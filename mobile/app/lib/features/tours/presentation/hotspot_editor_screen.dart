import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../core/env.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../assets/presentation/asset_providers.dart';

/// Hotspot placement: the web viewer's embed page in edit mode. A tap on the
/// panorama posts `panoramaClick {yaw, pitch, sceneId}`; we relay it through
/// a JavaScriptChannel, ask which room it should lead to, and create the
/// navigation hotspot via the backend.
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
  String? _webError;

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
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
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
    final asset = await ref
        .read(assetRepositoryProvider)
        .getAsset(widget.assetId);
    final rooms =
        await ref.read(assetRepositoryProvider).getRooms(widget.assetId);

    // Candidate destinations: every uploaded scene except the tapped one.
    final destinations = <(String, String)>[
      if (asset?.remoteTourId != null)
        ('__main__', '${asset!.name} (main)'),
      for (final r in rooms)
        if (r.remoteSceneId != null) (r.remoteSceneId!, r.name),
    ].where((d) => d.$1 != sceneId).toList();

    if (!mounted) return;
    if (destinations.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Add another room first: a hotspot needs somewhere to go.'),
      ));
      return;
    }

    final target = await showModalBottomSheet<(String, String)>(
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
                title: Text(d.$2),
                onTap: () => Navigator.pop(ctx, d),
              ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
    if (target == null || !mounted) return;

    // '__main__' means the tour's first scene: resolve its real scene id.
    var targetSceneId = target.$1;
    if (targetSceneId == '__main__') {
      final tour = await ref
          .read(backendApiProvider)
          .getTour(asset!.remoteTourId!);
      final scenes = (tour['scenes'] as List?) ?? const [];
      if (scenes.isEmpty) return;
      final first = scenes
          .map((s) => Map<String, dynamic>.from(s as Map))
          .reduce((a, b) =>
              ((a['order_index'] ?? 0) as num) <=
                      ((b['order_index'] ?? 0) as num)
                  ? a
                  : b);
      targetSceneId = first['id'] as String;
    }

    await ref.read(backendApiProvider).createHotspot(
          sceneId: sceneId,
          yaw: yaw,
          pitch: pitch,
          targetSceneId: targetSceneId,
          title: target.$2,
        );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Hotspot to “${target.$2}” placed')),
    );
    // Reload so the embed shows the new hotspot immediately.
    await _controller?.reload();
  }

  @override
  Widget build(BuildContext context) {
    final asset = ref.watch(assetProvider(widget.assetId)).value;
    final tourId = asset?.remoteTourId;
    if (tourId != null && _controller == null) {
      _controller = _buildController(tourId);
    }
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
                  : WebViewWidget(controller: _controller!),
    );
  }
}
