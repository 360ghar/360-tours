import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/env.dart';
import '../../../core/models/api_dtos.dart';
import '../../../core/models/models.dart';
import '../../../core/models/wire_enums.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../assets/presentation/asset_providers.dart';

/// Candidate destinations for a hotspot: the main scene and every uploaded
/// room scene, minus [currentSceneId] (the scene the hotspot sits in: a
/// hotspot must not lead back into its own scene). Every id is a backend scene
/// id; a scene that is not uploaded yet is not offered.
List<({String sceneId, String label})> hotspotDestinations({
  required String currentSceneId,
  required ScanAsset? asset,
  required List<Room> rooms,
}) {
  final mainSceneId = asset?.remoteSceneId;
  final out = <({String sceneId, String label})>[
    if (mainSceneId != null) (sceneId: mainSceneId, label: '${asset!.name} (main)'),
    for (final r in rooms)
      if (r.remoteSceneId != null) (sceneId: r.remoteSceneId!, label: r.name),
  ];
  return out.where((d) => d.sceneId != currentSceneId).toList();
}

/// Hotspot placement and management: the web viewer's embed page in edit
/// mode, opened on [sceneId]. A tap on the panorama posts
/// `panoramaClick {yaw, pitch, sceneId}`; we relay it through a
/// JavaScriptChannel, ask which scene it should lead to, and create the
/// navigation hotspot via the backend. Existing hotspots of the scene are
/// listed below the panorama with delete and re-point actions.
///
/// [sceneId] is a backend scene id, the main scene's included: the route
/// carries the real id, so there is nothing to resolve.
class HotspotEditorScreen extends ConsumerStatefulWidget {
  const HotspotEditorScreen({
    super.key,
    required this.assetId,
    required this.sceneId,
  });

  final String assetId;
  final String sceneId;

  @override
  ConsumerState<HotspotEditorScreen> createState() =>
      _HotspotEditorScreenState();
}

class _HotspotEditorScreenState extends ConsumerState<HotspotEditorScreen> {
  WebViewController? _controller;
  bool _placing = false;
  bool _busy = false;
  String? _webError;
  List<HotspotDto> _hotspots = const [];
  bool _loadingHotspots = false;
  bool _initStarted = false;

  // The embed page posts to window.parent, which inside a WebView is the
  // page's own window — so a message listener sees every outbound event.
  static const _bridgeJs = '''
    window.addEventListener('message', function (e) {
      try { FlutterBridge.postMessage(JSON.stringify(e.data)); } catch (_) {}
    });
  ''';

  WebViewController _buildController(String tourId) {
    return WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(AppColors.background)
      ..addJavaScriptChannel(
        'FlutterBridge',
        onMessageReceived: (msg) => _onViewerMessage(msg.message),
      )
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) {
          if (mounted) setState(() => _webError = null);
          _controller?.runJavaScript(_bridgeJs);
        },
        onWebResourceError: (err) {
          if (!mounted) return;
          setState(() => _webError =
              'Could not load the panorama viewer (${err.errorCode}). '
              'Check your connection and retry.');
        },
      ))
      ..loadRequest(
        Uri.parse('${Env.viewerBase}/embed/$tourId'
            '?editmode=1&minimal=1&scene=${widget.sceneId}'),
      );
  }

  /// Starts the WebView and the hotspot list once the asset (tour id) is
  /// known. Guarded so it runs at most once; called from
  /// [didChangeDependencies] and a provider listener — never from [build].
  void _maybeInit(String? tourId) {
    if (_initStarted || tourId == null) return;
    _initStarted = true;
    _controller = _buildController(tourId);
    _loadHotspots();
  }

  /// Says what failed, with the server's reason when it sent one.
  void _fail(String what, Object e) {
    if (!mounted) return;
    final reason = e is ApiException && !e.isNetwork
        ? e.userMessage
        : 'Check your connection and try again.';
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text('$what $reason')));
  }

  void _say(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _loadHotspots() async {
    setState(() => _loadingHotspots = true);
    try {
      final all = await ref.read(backendApiProvider).getHotspots(widget.sceneId);
      if (!mounted) return;
      setState(() {
        _hotspots = all;
        _loadingHotspots = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingHotspots = false);
      _fail('Could not load hotspots.', e);
    }
  }

  Future<void> _onViewerMessage(String raw) async {
    if (_placing) return;
    Map<String, dynamic> data;
    try {
      data = Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return;
    }
    if (data['type'] != 'panoramaClick') return;
    final payload = Map<String, dynamic>.from(data['data'] as Map? ?? {});
    final yaw = (payload['yaw'] as num?)?.toDouble();
    final pitch = (payload['pitch'] as num?)?.toDouble();
    final sceneId = payload['sceneId'] as String?;
    if (yaw == null || pitch == null || sceneId == null) return;

    _placing = true;
    try {
      await _placeHotspot(sceneId: sceneId, yaw: yaw, pitch: pitch);
    } finally {
      if (mounted) _placing = false;
    }
  }

  Future<void> _placeHotspot({
    required String sceneId,
    required double yaw,
    required double pitch,
  }) async {
    // Viewer-supplied angles can exceed sane ranges; clamp before the
    // backend sees them.
    yaw = yaw.clamp(-180.0, 180.0);
    pitch = pitch.clamp(-90.0, 90.0);
    final repo = ref.read(assetRepositoryProvider);
    final asset = await repo.getAsset(widget.assetId);
    final rooms = await repo.getRooms(widget.assetId);

    final target = await _pickDestination(
      currentSceneId: sceneId,
      asset: asset,
      rooms: rooms,
    );
    if (target == null || !mounted) return;

    try {
      await ref.read(backendApiProvider).createHotspot(
            sceneId: sceneId,
            yaw: yaw,
            pitch: pitch,
            targetSceneId: target.sceneId,
            title: target.label,
          );
    } catch (e) {
      _fail('Could not place the hotspot.', e);
      return;
    }
    _say('Hotspot to “${target.label}” placed');
    await _reloadAndRefresh();
  }

  /// Shared destination picker for placement and edit. Shows an explanatory
  /// snackbar (no API call) when there is nowhere to go.
  Future<({String sceneId, String label})?> _pickDestination({
    required String currentSceneId,
    required ScanAsset? asset,
    required List<Room> rooms,
  }) async {
    final destinations = hotspotDestinations(
      currentSceneId: currentSceneId,
      asset: asset,
      rooms: rooms,
    );
    if (!mounted) return null;
    if (destinations.isEmpty) {
      _say('Add another room first: a hotspot needs somewhere to go.');
      return null;
    }

    final picked = await showModalBottomSheet<({String sceneId, String label})>(
      context: context,
      backgroundColor: AppColors.surfaceRaised,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 20, 20, 8),
              child: Text('Hotspot leads to…',
                  style:
                      TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            ),
            for (final d in destinations)
              ListTile(
                leading: const Icon(Icons.meeting_room_outlined,
                    color: AppColors.inkDim),
                title: Text(d.label),
                onTap: () => Navigator.pop(ctx, d),
              ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
    return picked;
  }

  Future<void> _deleteHotspot(HotspotDto entry) async {
    final label = entry.title ?? 'Untitled hotspot';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surfaceRaised,
        title: Text('Delete “$label”?'),
        content: const Text(
          'This removes the hotspot from the tour. This can\'t be undone.',
          style: TextStyle(color: AppColors.inkDim),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete',
                style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(backendApiProvider).deleteHotspot(entry.id);
      if (!mounted) return;
      // Only remove locally after the backend confirmed the delete.
      setState(() {
        _hotspots = _hotspots.where((h) => h.id != entry.id).toList();
      });
      _say('Hotspot deleted');
      await _controller?.reload();
    } catch (e) {
      _fail('Could not delete the hotspot.', e);
      // The list may be stale (deleted on another device): show the truth.
      await _loadHotspots();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Points an existing hotspot at another scene with one PATCH. The hotspot
  /// is never deleted: if the PATCH fails, it is exactly as it was.
  Future<void> _editHotspot(HotspotDto entry) async {
    final repo = ref.read(assetRepositoryProvider);
    final asset = await repo.getAsset(widget.assetId);
    final rooms = await repo.getRooms(widget.assetId);
    // The hotspot sits in this scene, so this scene is not a destination.
    final target = await _pickDestination(
      currentSceneId: widget.sceneId,
      asset: asset,
      rooms: rooms,
    );
    if (target == null || !mounted) return;

    setState(() => _busy = true);
    try {
      final updated = await ref.read(backendApiProvider).updateHotspot(
            entry.id,
            targetSceneId: target.sceneId,
            title: target.label,
          );
      // The server drops target_scene_id on a hotspot that is not a
      // navigation hotspot. Never report success it did not give.
      if (updated.targetSceneId != target.sceneId) {
        _say('Could not update the hotspot. The server did not point it at '
            '“${target.label}”.');
        await _loadHotspots();
        return;
      }
      _say('Hotspot now leads to “${target.label}”');
      await _reloadAndRefresh();
    } catch (e) {
      _fail('Could not update the hotspot.', e);
      // The list may be stale (another device edited it): show the truth.
      await _loadHotspots();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Reloads the embed (so the marker appears/moves immediately) and
  /// re-fetches the hotspot list.
  Future<void> _reloadAndRefresh() async {
    await _controller?.reload();
    await _loadHotspots();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _maybeInit(ref.read(assetProvider(widget.assetId)).value?.remoteTourId);
  }

  @override
  Widget build(BuildContext context) {
    final assetAsync = ref.watch(assetProvider(widget.assetId));
    ref.listen(assetProvider(widget.assetId), (_, next) {
      _maybeInit(next.value?.remoteTourId);
    });
    final asset = assetAsync.value;
    final tourId = asset?.remoteTourId;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Place hotspots'),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(34),
          child: Padding(
            padding: EdgeInsets.only(left: 20, right: 20, bottom: 10),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Tap a doorway in the panorama to link rooms.',
                style: TextStyle(color: AppColors.inkDim, fontSize: 14),
              ),
            ),
          ),
        ),
      ),
      body: tourId == null
          ? const Center(
              child: Text('Not uploaded yet',
                  style: TextStyle(color: AppColors.inkDim)),
            )
          : _webError != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_webError!,
                            textAlign: TextAlign.center,
                            style:
                                const TextStyle(color: AppColors.inkDim)),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: () {
                            setState(() => _webError = null);
                            _controller?.reload();
                          },
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                )
              : _controller == null
                  ? const Center(child: CircularProgressIndicator())
                  : Column(
                      children: [
                        Expanded(
                          child: WebViewWidget(controller: _controller!),
                        ),
                        _HotspotListPanel(
                          hotspots: _hotspots,
                          loading: _loadingHotspots,
                          busy: _busy,
                          onDelete: _deleteHotspot,
                          onEdit: _editHotspot,
                        ),
                      ],
                    ),
    );
  }
}

class _HotspotListPanel extends StatelessWidget {
  const _HotspotListPanel({
    required this.hotspots,
    required this.loading,
    required this.busy,
    required this.onDelete,
    required this.onEdit,
  });

  final List<HotspotDto> hotspots;
  final bool loading;
  final bool busy;
  final void Function(HotspotDto) onDelete;
  final void Function(HotspotDto) onEdit;

  @override
  Widget build(BuildContext context) {
    if (!loading && hotspots.isEmpty) {
      return const Padding(
        padding: EdgeInsets.fromLTRB(20, 12, 20, 16),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Text(
            'No hotspots yet. Tap a doorway in the panorama above to '
            'link it to another room.',
            style: TextStyle(color: AppColors.inkFaint, fontSize: 13),
          ),
        ),
      );
    }
    return Container(
      constraints: const BoxConstraints(maxHeight: 230),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: Color(0xFF232323))),
      ),
      child: loading && hotspots.isEmpty
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(),
              ),
            )
          : ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(vertical: 4),
              children: [
                for (final h in hotspots)
                  ListTile(
                    dense: true,
                    title: Text(h.title ?? 'Untitled hotspot',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(
                      _detail(h),
                      style: const TextStyle(
                          color: AppColors.inkFaint, fontSize: 12),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Only a navigation hotspot has a destination; the
                        // server ignores a target on every other type.
                        if (h.type == HotspotType.navigation)
                          IconButton(
                            tooltip: 'Edit destination',
                            icon: const Icon(Icons.edit_outlined, size: 18),
                            onPressed: busy ? null : () => onEdit(h),
                          ),
                        IconButton(
                          tooltip: 'Delete hotspot',
                          icon: const Icon(Icons.delete_outline,
                              size: 18, color: AppColors.danger),
                          onPressed:
                              busy ? null : () => onDelete(h),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }

  /// Type and angles. A hotspot whose stored position is invalid has none.
  static String _detail(HotspotDto h) {
    final type = h.type?.wire ?? 'unknown type';
    final yaw = h.yawDeg;
    final pitch = h.pitchDeg;
    if (yaw == null || pitch == null) return type;
    return '$type · yaw ${yaw.toStringAsFixed(0)}° · '
        'pitch ${pitch.toStringAsFixed(0)}°';
  }
}
