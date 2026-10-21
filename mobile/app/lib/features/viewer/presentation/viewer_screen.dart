import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../core/env.dart';
import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../assets/presentation/asset_providers.dart';

/// In-app 360 viewer: the web viewer's chromeless /embed/{tourId} page in a
/// WebView — same renderer the public share link uses.
class ViewerScreen extends ConsumerStatefulWidget {
  const ViewerScreen({super.key, required this.assetId});

  final String assetId;

  @override
  ConsumerState<ViewerScreen> createState() => _ViewerScreenState();
}

class _ViewerScreenState extends ConsumerState<ViewerScreen> {
  WebViewController? _controller;
  bool _loading = true;
  String? _error;
  String? _tourId;
  bool _loadStarted = false;
  bool _timedOut = false;
  Timer? _loadTimeout;

  /// Longest we wait for the main frame before offering a retry — a slow
  /// or dead tour must not leave an eternal spinner under "Loading…".
  static const _loadTimeoutMs = 30 * 1000;

  void _load(String tourId) {
    _tourId = tourId;
    final url = '${Env.viewerBase}/embed/$tourId?minimal=1&branding=0';
    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(AppColors.background)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) {
          if (!mounted) return;
          setState(() {
            _loading = false;
            _loadTimeout?.cancel();
            // The page made it eventually — drop a timeout message.
            if (_timedOut) {
              _timedOut = false;
              _error = null;
            }
          });
        },
        onWebResourceError: (e) {
          // Only main-frame failures are fatal: subframe errors (thumbnails,
          // iframes) must not kill a working viewer.
          if (e.isForMainFrame == true) _fail('Could not load the tour.');
        },
        onHttpError: (e) {
          // The platform interface exposes only the request URI here, so
          // treat an HTTP error on the page we loaded as fatal; errors on
          // subresources are ignored (same policy as onWebResourceError).
          final requestUri = e.request?.uri;
          if (requestUri == null) return;
          final base = requestUri.replace(queryParameters: null);
          final loaded = Uri.parse(url).replace(queryParameters: null);
          if (base == loaded) _fail('Could not load the tour.');
        },
      ))
      ..loadRequest(Uri.parse(url));
    _controller = controller;
    _loading = true;
    _error = null;
    _timedOut = false;
    _loadTimeout?.cancel();
    _loadTimeout = Timer(const Duration(milliseconds: _loadTimeoutMs), () {
      if (!mounted || !_loading || _error != null) return;
      setState(() {
        _timedOut = true;
        _error = 'Still loading? The tour may be unavailable.';
      });
    });
  }

  void _fail(String message) {
    _loadTimeout?.cancel();
    if (!mounted) return;
    setState(() {
      _error = message;
      _loading = false;
    });
  }

  /// Starts loading the panorama once the remote tour id is known. Guarded so
  /// it runs at most once per available tour id; called from
  /// [didChangeDependencies] (value already present) and a provider listener
  /// (value arrives later) — never from [build], keeping build side-effect
  /// free.
  void _maybeStartLoad(String? tourId) {
    if (_loadStarted || _controller != null || _error != null) return;
    if (tourId == null) return;
    _loadStarted = true;
    _load(tourId);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _maybeStartLoad(
      ref.read(assetProvider(widget.assetId)).value?.remoteTourId,
    );
  }

  void _retry() {
    final tourId = _tourId;
    if (tourId == null) return;
    setState(() => _load(tourId));
  }

  @override
  void dispose() {
    _loadTimeout?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final assetAsync = ref.watch(assetProvider(widget.assetId));
    // Kick off the load as soon as the tour id becomes available.
    ref.listen(assetProvider(widget.assetId), (_, next) {
      _maybeStartLoad(next.value?.remoteTourId);
    });
    final asset = assetAsync.value;
    final tourId = asset?.remoteTourId;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: Text(asset?.name ?? '')),
      body: tourId == null
          ? _notReady(assetAsync, asset)
          : Stack(
              children: [
                if (_controller != null)
                  WebViewWidget(controller: _controller!),
                if (_loading && _error == null)
                  const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircularProgressIndicator(),
                        SizedBox(height: 14),
                        Text('Loading panorama…',
                            style: TextStyle(color: AppColors.inkDim)),
                      ],
                    ),
                  ),
                if (_error != null)
                  Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!,
                            style:
                                const TextStyle(color: AppColors.inkDim)),
                        const SizedBox(height: 16),
                        FilledButton.tonal(
                          onPressed: _retry,
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }

  /// Body shown while there is no remote tour id yet. Distinguishes "still
  /// uploading" (progress + message) from a genuinely unavailable tour
  /// (actionable message), and avoids flashing a final state while the asset
  /// itself is still loading.
  Widget _notReady(AsyncValue<ScanAsset?> assetAsync, ScanAsset? asset) {
    if (assetAsync.isLoading || asset == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_isStillUploading(asset.status)) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 14),
            Text('This tour is still uploading…',
                style: TextStyle(color: AppColors.inkDim)),
          ],
        ),
      );
    }
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Text(
          'This tour is not available to view yet. Open it again once '
          'uploading finishes.',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.inkDim),
        ),
      ),
    );
  }

  bool _isStillUploading(AssetStatus status) => switch (status) {
        AssetStatus.capturing => true,
        AssetStatus.stitching => true,
        AssetStatus.pendingCloudStitch => true,
        AssetStatus.ready => false,
        AssetStatus.failed => false,
      };
}
