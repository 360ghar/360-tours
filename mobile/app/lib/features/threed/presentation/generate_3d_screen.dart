import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lidar_scanner/lidar_scanner.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/env.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../assets/presentation/asset_providers.dart';

/// "Generate 3D World": kicks the backend job (equirect → textured skybox
/// mesh) and polls it to completion. Progress arrives via the AIJob record.
class Generate3dScreen extends ConsumerStatefulWidget {
  const Generate3dScreen({super.key, required this.assetId});

  final String assetId;

  @override
  ConsumerState<Generate3dScreen> createState() => _Generate3dScreenState();
}

/// On-device alternative: RealityKit photogrammetry over the captured
/// frames (iOS 17+, LiDAR-class devices). Produces a USDZ the agent can
/// export from the share sheet.
class _PhotogrammetryButton extends StatefulWidget {
  const _PhotogrammetryButton({required this.asset});

  final ScanAsset asset;

  @override
  State<_PhotogrammetryButton> createState() =>
      _PhotogrammetryButtonState();
}

class _PhotogrammetryButtonState extends State<_PhotogrammetryButton> {
  bool _busy = false;
  double _progress = 0;
  StreamSubscription<LidarScanEvent>? _events;

  @override
  void dispose() {
    _events?.cancel();
    super.dispose();
  }

  Future<void> _run() async {
    setState(() {
      _busy = true;
      _progress = 0;
    });
    _events = LidarScanner.scanEvents().listen((e) {
      if (e.phase == 'processing' && mounted) {
        setState(() => _progress = e.progress);
      }
    });
    try {
      final frames = widget.asset.framePaths
          .where((p) => File(p).existsSync())
          .toList();
      final usdzPath = await LidarScanner.buildPhotogrammetry(frames);
      if (!mounted) return;
      await SharePlus.instance.share(ShareParams(
        files: [XFile(usdzPath)],
        subject: '${widget.asset.name} 3D model',
      ));
    } on PlatformException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(e.code == 'PHOTOGRAMMETRY_UNSUPPORTED'
            ? 'On-device 3D needs iOS 17 on a LiDAR-class iPhone.'
            : 'On-device 3D failed: ${e.message}'),
      ));
    } finally {
      await _events?.cancel();
      _events = null;
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton(
        onPressed: _busy ? null : _run,
        child: Text(_busy
            ? 'Building on device… ${(_progress * 100).round()}%'
            : 'Build on device (photogrammetry)'),
      ),
    );
  }
}

class _Generate3dScreenState extends ConsumerState<Generate3dScreen> {
  Timer? _poll;
  String? _jobId;
  int _progress = 0;
  String? _error;
  bool _done = false;
  int _pollCount = 0;
  int _failCount = 0;

  /// 360 polls * 5 s = 30 minutes of polling before we give up.
  static const _maxPolls = 360;
  static const _maxConsecutiveFailures = 5;

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _start(ScanAsset asset) async {
    if (asset.remoteTourId == null) {
      setState(() => _error =
          'This scan has not been uploaded yet. Upload it before '
          'generating the 3D world.');
      return;
    }
    setState(() {
      _error = null;
      _progress = 5;
      _pollCount = 0;
      _failCount = 0;
    });
    try {
      final job = await ref
          .read(backendApiProvider)
          .generate3dWorld(asset.remoteTourId!);
      if (!mounted) return;
      _jobId = (job['id'] ?? job['job_id']) as String?;
      // ponytail: 5s polling instead of the /ws/jobs websocket — the job
      // takes minutes, sub-second latency buys nothing.
      _poll = Timer.periodic(
          const Duration(seconds: 5), (_) => _check(asset));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Could not start the job.\n$e');
    }
  }

  Future<void> _check(ScanAsset asset) async {
    final jobId = _jobId;
    if (jobId == null) return;
    _pollCount++;
    if (_pollCount > _maxPolls) {
      _poll?.cancel();
      if (mounted) {
        setState(() => _error =
            'Generation is taking longer than expected. Check back later '
            'from the asset page.');
      }
      return;
    }
    try {
      final job = await ref.read(backendApiProvider).getAiJob(jobId);
      if (!mounted) return;
      _failCount = 0;
      final status = (job['status'] ?? '') as String;
      final progress = (job['progress'] as num?)?.toInt() ?? _progress;
      if (status == 'completed') {
        _poll?.cancel();
        final fresh =
            await ref.read(assetRepositoryProvider).getAsset(asset.id);
        if (!mounted) return;
        if (fresh == null) {
          setState(() => _error =
              'Generation finished but the scan record was not found. '
              'Reopen this screen to retry.');
          return;
        }
        final url = '${Env.viewerBase}/view3d/${fresh.remoteTourId}';
        await ref.read(assetRepositoryProvider).saveAsset(
              fresh.copyWith(model3dUrl: url, type: AssetType.model3d),
            );
        if (mounted) {
          setState(() {
            _done = true;
            _progress = 100;
          });
        }
      } else if (status == 'failed') {
        _poll?.cancel();
        if (mounted) {
          setState(() => _error =
              (job['error_message'] as String?) ?? 'Generation failed.');
        }
      } else if (mounted) {
        setState(() => _progress = progress.clamp(5, 99));
      }
    } catch (_) {
      // Transient poll error — a few retries are fine; a sustained outage
      // means the job status is unreachable, so surface it.
      _failCount++;
      if (_failCount >= _maxConsecutiveFailures) {
        _poll?.cancel();
        if (mounted) {
          setState(() => _error =
              'Lost contact with the generation service after '
              '$_failCount attempts. Check your connection and retry.');
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final asset = ref.watch(assetProvider(widget.assetId)).value;
    final running = _jobId != null && !_done && _error == null;
    return Scaffold(
      appBar: AppBar(title: const Text('3D World')),
      body: asset == null
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 8),
                  Text(
                    _done
                        ? 'Your 3D world is ready.'
                        : running
                            ? 'Generating… about 6 minutes.'
                            : 'Turn this scan into a walkable 3D room.',
                    style:
                        Theme.of(context).textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                              letterSpacing: -0.5,
                            ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    _done
                        ? 'Open it below, or share the tour link: viewers '
                            'get the 3D world at the same address.'
                        : 'The panorama is projected into a textured room '
                            'mesh you can look around in. Keep the app open '
                            'or come back later; it runs in the cloud.',
                    style: const TextStyle(
                        color: AppColors.inkDim, height: 1.45),
                  ),
                  const SizedBox(height: 32),
                  if (running) ...[
                    LinearProgressIndicator(
                        value: _progress / 100, minHeight: 6),
                    const SizedBox(height: 10),
                    Text('$_progress%',
                        style: const TextStyle(
                            color: AppColors.inkDim, fontSize: 13)),
                  ],
                  if (_error != null)
                    Text(_error!,
                        style: const TextStyle(color: AppColors.danger)),
                  const Spacer(),
                  if (!running && !_done && asset.framePaths.isNotEmpty)
                    _PhotogrammetryButton(asset: asset),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: _done || asset.model3dUrl != null
                        ? FilledButton(
                            onPressed: () => context.push(
                                '/asset/${asset.id}/view?mode=3d'),
                            child: const Text('View 3D world'),
                          )
                        : FilledButton(
                            onPressed:
                                running ? null : () => _start(asset),
                            child: Text(running
                                ? 'Generating…'
                                : _error != null
                                    ? 'Retry generation'
                                    : 'Generate 3D world'),
                          ),
                  ),
                ],
              ),
            ),
    );
  }
}
