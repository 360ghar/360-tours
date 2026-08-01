import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../core/env.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../assets/presentation/asset_providers.dart';

/// A backend hotspot parsed for display (parse at the API boundary).
class HotspotEntry {
  const HotspotEntry({
    required this.id,
    required this.title,
    required this.type,
    required this.yawDeg,
    required this.pitchDeg,
    required this.targetSceneId,
  });

  final String id;
  final String title;
  final String type;
  final double yawDeg;
  final double pitchDeg;

  /// Destination scene, or null when unknown ('__main__' unresolved).
  final String? targetSceneId;

  factory HotspotEntry.fromJson(Map<String, dynamic> json) {
    final position =
        Map<String, dynamic>.from(json['position'] as Map? ?? {});
    return HotspotEntry(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? 'Untitled hotspot',
      type: json['type'] as String? ?? 'navigation',
      yawDeg: (position['yaw'] as num?)?.toDouble() ?? 0,
      pitchDeg: (position['pitch'] as num?)?.toDouble() ?? 0,
      targetSceneId: json['target_scene_id'] as String?,
    );
  }
}

/// Candidate destinations for a hotspot: every uploaded room scene plus the
/// main scene, minus the current one.
List<({String sceneId, String label})> hotspotDestinations({
  required String currentSceneId,
  required ScanAsset? asset,
  required List<Room> rooms,
}) {
  final out = <({String sceneId, String label})>[
    if (asset?.remoteTourId != null)
      (sceneId: '__main__', label: '${asset!.name} (main)'),
    for (final r in rooms)
      if (r.remoteSceneId != null)
        (sceneId: r.remoteSceneId!, label: r.name),
  ];
  return out.where((d) => d.sceneId != currentSceneId).toList();
}

/// Resolves the tour's first scene ('__main__' destination) — the scene with
/// the lowest order_index. Returns null for a tour with no scenes.
String? resolveMainSceneId(List<Map<String, dynamic>> scenes) {
  if (scenes.isEmpty) return null;
  Map<String, dynamic>? first;
  for (final scene in scenes) {
    if (first == null ||
        ((scene['order_index'] ?? 0) as num) <
            ((first['order_index'] ?? 0) as num)) {
      first = scene;
    }
  }
  return first?['id'] as String?;
}

/// Hotspot placement and management: the web viewer's embed page in edit
/// mode. A tap on the panorama posts `panoramaClick {yaw, pitch, sceneId}`;
/// we relay it through a JavaScriptChannel, ask which room it should lead
/// to, and create the navigation hotspot via the backend. Existing hotspots
/// are listed below the panorama with delete + re-place-destination actions.
class HotspotEditorScreen extends ConsumerStatefulWidget {
  const HotspotEditorScreen({
    super.key,
    required this.assetId,
    required this.roomId,
  });

  final String assetId;
  final String roomId;

  @override
  ConsumerState<HotspotEditorScreen> createState() =>
      _HotspotEditorScreenState();
}

class _HotspotEditorScreenState extends ConsumerState<HotspotEditorScreen> {
  WebViewController? _controller;
  bool _placing = false;
  bool _busy = false;
  String? _webError;
  List<HotspotEntry> _hotspots = const [];
  bool _loadingHotspots = false;
  bool _initStarted = false;
  String? _sceneId;

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
        Uri.parse('${Env.viewerBase}/embed/$tourId?editmode=1&minimal=1'),
      );
  }

  /// Starts the WebView and the hotspot list once both the asset (tour id)
  /// and the room are known. Guarded so it runs at most once; called from
  /// [didChangeDependencies] and a provider listener — never from [build].
  void _maybeInit(String? tourId) {
    if (_initStarted || tourId == null) return;
    _initStarted = true;
    _controller = _buildController(tourId);
    _loadSceneAndHotspots();
  }

  Future<void> _loadSceneAndHotspots() async {
    final rooms =
        await ref.read(assetRepositoryProvider).getRooms(widget.assetId);
    if (!mounted) return;
    final room = rooms.where((r) => r.id == widget.roomId).firstOrNull;
    final sceneId = room?.remoteSceneId;
    if (sceneId == null) return;
    setState(() => _sceneId = sceneId);
    await _loadHotspots(sceneId);
  }

  Future<void> _loadHotspots(String sceneId) async {
    setState(() => _loadingHotspots = true);
    try {
      final raw =
          await ref.read(backendApiProvider).getHotspots(sceneId);
      if (!mounted) return;
      setState(() {
        _hotspots = raw.map(HotspotEntry.fromJson).toList();
        _loadingHotspots = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingHotspots = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Could not load hotspots. Check your connection and '
            'try again.'),
      ));
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

    final targetSceneId = await _resolveTargetSceneId(target.sceneId, asset);
    if (targetSceneId == null || !mounted) return;

    await _createHotspot(
      sceneId: sceneId,
      yaw: yaw,
      pitch: pitch,
      targetSceneId: targetSceneId,
      title: target.label,
    );
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
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text(
            'Add another room first: a hotspot needs somewhere to go.'),
      ));
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

  /// Resolves '__main__' to the tour's first scene id; null when there is
  /// no published scene (the caller shows nothing more — the embed itself
  /// has no scenes either).
  Future<String?> _resolveTargetSceneId(
    String raw,
    ScanAsset? asset,
  ) async {
    if (raw != '__main__') return raw;
    final tourId = asset?.remoteTourId;
    if (tourId == null) return null;
    final tour = await ref.read(backendApiProvider).getTour(tourId);
    final scenes = ((tour['scenes'] as List?) ?? const [])
        .map((s) => Map<String, dynamic>.from(s as Map))
        .toList();
    final first = resolveMainSceneId(scenes);
    if (first == null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('This tour has no published scenes yet.'),
      ));
    }
    return first;
  }

  Future<void> _createHotspot({
    required String sceneId,
    required double yaw,
    required double pitch,
    required String targetSceneId,
    required String title,
  }) async {
    try {
      await ref.read(backendApiProvider).createHotspot(
            sceneId: sceneId,
            yaw: yaw,
            pitch: pitch,
            targetSceneId: targetSceneId,
            title: title,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Hotspot to “$title” placed')),
      );
      await _reloadAndRefresh();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text(
            'Could not place the hotspot. Check your connection and '
            'try again.'),
      ));
    }
  }

  Future<void> _deleteHotspot(HotspotEntry entry) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surfaceRaised,
        title: Text('Delete “${entry.title}”?'),
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
        _hotspots =
            _hotspots.where((h) => h.id != entry.id).toList();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Hotspot deleted')),
      );
      await _controller?.reload();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Could not delete the hotspot. Try again.'),
      ));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Re-place an existing hotspot's destination. The backend has no update
  /// endpoint, so this is delete + create with the same angles and a newly
  /// picked destination.
  Future<void> _editHotspot(HotspotEntry entry) async {
    final repo = ref.read(assetRepositoryProvider);
    final asset = await repo.getAsset(widget.assetId);
    final rooms = await repo.getRooms(widget.assetId);
    final target = await _pickDestination(
      currentSceneId: entry.targetSceneId ?? entry.id,
      asset: asset,
      rooms: rooms,
    );
    if (target == null || !mounted) return;
    final targetSceneId = await _resolveTargetSceneId(target.sceneId, asset);
    final sceneId = _sceneId;
    if (targetSceneId == null || sceneId == null || !mounted) return;

    setState(() => _busy = true);
    try {
      await ref.read(backendApiProvider).deleteHotspot(entry.id);
      await _createHotspot(
        sceneId: sceneId,
        yaw: entry.yawDeg,
        pitch: entry.pitchDeg,
        targetSceneId: targetSceneId,
        title: target.label,
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Could not update the hotspot. Try again.'),
      ));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Reloads the embed (so the marker appears/moves immediately) and
  /// re-fetches the hotspot list.
  Future<void> _reloadAndRefresh() async {
    await _controller?.reload();
    final sceneId = _sceneId;
    if (sceneId != null) await _loadHotspots(sceneId);
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

  final List<HotspotEntry> hotspots;
  final bool loading;
  final bool busy;
  final void Function(HotspotEntry) onDelete;
  final void Function(HotspotEntry) onEdit;

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
                    title: Text(h.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(
                      '${h.type} · yaw ${h.yawDeg.toStringAsFixed(0)}° · '
                      'pitch ${h.pitchDeg.toStringAsFixed(0)}°',
                      style: const TextStyle(
                          color: AppColors.inkFaint, fontSize: 12),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          tooltip: 'Edit destination',
                          icon: const Icon(Icons.edit_outlined, size: 18),
                          onPressed:
                              busy ? null : () => onEdit(h),
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
}
