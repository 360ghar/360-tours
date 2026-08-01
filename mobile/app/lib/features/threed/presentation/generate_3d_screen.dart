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
import '../../assets/data/local_asset_repository.dart';
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
  void initState() {
    super.initState();
    _resumePersistedJob();
  }

  /// The local repository provides 3D job persistence; the interface does
  /// not declare it (kept off the contract until Room/asset job state lands
  /// in the model).
  LocalAssetRepository? get _repo {
    final repo = ref.read(assetRepositoryProvider);
    return repo is LocalAssetRepository ? repo : null;
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  /// Re-entering the screen must not spawn a duplicate backend job: if the
  /// last session left a running job, resume polling it. Completed jobs are
  /// already reflected in `model3dUrl` (persisted at completion), so the
  /// button flips to "View 3D world" without a stored record.
  Future<void> _resumePersistedJob() async {
    final repo = _repo;
    if (repo == null) return;
    final job = await repo.get3dJob(widget.assetId);
    if (!mounted || job == null) return;
    switch (job.status) {
      case 'completed':
        setState(() => _done = true);
      case 'failed':
        setState(() => _error = job.error ?? 'Generation failed.');
      default:
        setState(() {
          _jobId = job.jobId;
          _progress = job.progress.clamp(0, 99);
        });
        _poll = Timer.periodic(
            const Duration(seconds: 5), (_) => _check());
    }
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
      _done = false;
    });
    try {
      final job = await ref
          .read(backendApiProvider)
          .generate3dWorld(asset.remoteTourId!);
      if (!mounted) return;
      final jobId = (job['id'] ?? job['job_id']) as String?;
      _jobId = jobId;
      final repo = _repo;
      if (repo == null) return;
      // Mark the asset as processing so badges/status lines show progress;
      // re-read first so a concurrent save is not clobbered.
      final fresh = await repo.getAsset(asset.id);
      if (fresh != null) {
        await repo.saveAsset(fresh.copyWith(status: AssetStatus.processing3d));
      }
      if (jobId != null) {
        await repo.save3dJob(
          assetId: asset.id,
          job: PersistedAiJob(jobId: jobId, status: 'running'),
        );
      }
      // ponytail: 5s polling instead of the /ws/jobs websocket — the job
      // takes minutes, sub-second latency buys nothing.
      _poll = Timer.periodic(
          const Duration(seconds: 5), (_) => _check());
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Could not start the job.\n$e');
    }
  }

  Future<void> _check() async {
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
      final repo = _repo;
      if (repo == null) return;
      if (status == 'completed') {
        _poll?.cancel();
        final fresh = await repo.getAsset(widget.assetId);
        if (!mounted) return;
        final tourId = fresh?.remoteTourId;
        if (fresh == null || tourId == null) {
          setState(() => _error =
              'Generation finished but the scan record was not found. '
              'Reopen this screen to retry.');
          return;
        }
        final url = '${Env.viewerBase}/view3d/$tourId';
        await repo.saveAsset(fresh.copyWith(
          model3dUrl: url,
          type: AssetType.model3d,
          status: AssetStatus.ready,
        ));
        // model3dUrl is the durable completion marker — drop the job record
        // so a later visit shows "View 3D world", not a second Generate.
        await repo.clear3dJob(widget.assetId);
        if (mounted) {
          setState(() {
            _done = true;
            _progress = 100;
          });
        }
      } else if (status == 'failed') {
        _poll?.cancel();
        final message =
            (job['error_message'] as String?) ?? 'Generation failed.';
        // The 3D job failed; the panorama itself is fine — revert the asset
        // status so it is not stuck in "Building 3D…".
        final fresh = await repo.getAsset(widget.assetId);
        if (fresh != null && fresh.status == AssetStatus.processing3d) {
          await repo.saveAsset(fresh.copyWith(status: AssetStatus.ready));
        }
        await repo.save3dJob(
          assetId: widget.assetId,
          job: PersistedAiJob(
              jobId: jobId, status: 'failed', error: message),
        );
        if (mounted) {
          setState(() => _error = message);
        }
      } else if (mounted) {
        setState(() => _progress = progress.clamp(5, 99));
        await repo.save3dJob(
          assetId: widget.assetId,
          job: PersistedAiJob(
              jobId: jobId, status: 'running', progress: _progress),
        );
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
