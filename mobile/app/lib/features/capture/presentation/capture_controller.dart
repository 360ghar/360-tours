import 'dart:async';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../../../core/models/api_dtos.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/repositories/repositories.dart';
import '../../../core/storage/local_store.dart';
import '../../../core/upload/upload_queue.dart';
import '../../settings/domain/processing_preference.dart';
import '../domain/capture_targets.dart';
import '../domain/orientation_engine.dart';
import '../domain/stitcher_service.dart';

enum CapturePhase { initializing, aiming, shooting, review, error }

/// Re-runs the stitch ladder for a failed asset that still has raw frames but
/// no panorama (focus-path (a) in docs/VERIFICATION_LOG.md) and enqueues the
/// upload once a panorama exists. Keeps the layers clean: UI calls this one
/// function; no Dio or queue internals reach widgets.
///
/// Returns `null` on success, or a user-facing error message on failure
/// ("Stitching failed: `reason` — try re-capturing").
Future<String?> retryStitch({
  required ScanAsset asset,
  required AssetRepository assets,
  required UploadQueue queue,
  String? outDir,
  bool preferDevice = true,
  StitcherService stitcher = const StitcherService(),
}) async {
  if (asset.framePaths.isEmpty) {
    return 'No captured frames to stitch — delete this scan and re-capture';
  }
  try {
    final dir = outDir ??
        '${(await getApplicationDocumentsDirectory()).path}/'
            'stitch_retry/${DateTime.now().millisecondsSinceEpoch}';
    await Directory(dir).create(recursive: true);
    final result = await stitcher.stitch(
      framePaths: asset.framePaths,
      orientations: asset.frameOrientations,
      outDir: dir,
      preferDevice: preferDevice,
    );
    final stitched = asset.copyWith(
      status: result.naive
          ? AssetStatus.pendingCloudStitch
          : AssetStatus.stitching,
      panoramaPath: result.panoramaPath,
      thumbnailPath: result.thumbnailPath,
    );
    await assets.saveAsset(stitched);
    await assets.enqueueUpload(stitched);
    return null;
  } catch (e) {
    await assets.saveAsset(asset.copyWith(status: AssetStatus.failed));
    return 'Stitching failed: $e — try re-capturing';
  }
}

/// Deletes capture session directories whose session was never saved (no
/// asset or room references any file inside them, so cloud re-stitch would
/// never need them) and that are older than [maxAge], so in-flight sessions
/// are never swept. Call once at startup after the store is available —
/// main.dart wires it (see the W3e fix report).
Future<void> sweepOrphanedCaptures({
  required LocalStore store,
  Directory? docsDir,
  Duration maxAge = const Duration(hours: 24),
}) async {
  final root = docsDir ?? await getApplicationDocumentsDirectory();
  final captures = Directory('${root.path}/captures');
  if (!await captures.exists()) return;
  final referenced = <String>{
    for (final a in await store.readAll('assets')) ...[
      if (a['panoramaPath'] is String) a['panoramaPath'] as String,
      if (a['thumbnailPath'] is String) a['thumbnailPath'] as String,
      for (final f in (a['framePaths'] as List? ?? const []))
        if (f is String) f,
    ],
    for (final r in await store.readAll('rooms'))
      if (r['panoramaPath'] is String) r['panoramaPath'] as String,
  };
  final now = DateTime.now();
  await for (final entry in captures.list()) {
    if (entry is! Directory) continue;
    try {
      // Session dirs are named with their creation epoch-ms, which is more
      // reliable than mtime (writing frames bumps the dir mtime). Fall back
      // to mtime for dirs with non-timestamp names.
      final name = entry.uri.pathSegments
          .where((s) => s.isNotEmpty)
          .lastOrNull;
      final nameTs = name != null ? int.tryParse(name) : null;
      final created = nameTs != null
          ? DateTime.fromMillisecondsSinceEpoch(nameTs)
          : entry.statSync().modified;
      if (now.difference(created) < maxAge) continue;
      final dirPath = '${entry.path}/';
      if (referenced.any((p) => p.startsWith(dirPath))) continue;
      await entry.delete(recursive: true);
      debugPrint('sweepOrphanedCaptures: deleted $dirPath');
    } catch (e) {
      debugPrint('sweepOrphanedCaptures: skipped ${entry.path}: $e');
    }
  }
}

class CaptureState {
  final CapturePhase phase;
  final int targetIndex;
  final FrameOrientation orientation;
  final List<String> framePaths;
  final List<FrameOrientation> frameOrientations;
  final String? errorMessage;

  /// 0..1 progress of the alignment dwell (drives the reticle fill ring).
  final double dwellProgress;

  /// True when the last target is reached with fewer than 4 frames captured.
  final bool needMoreShots;

  const CaptureState({
    this.phase = CapturePhase.initializing,
    this.targetIndex = 0,
    this.orientation = const FrameOrientation(yaw: 0, pitch: 0),
    this.framePaths = const [],
    this.frameOrientations = const [],
    this.errorMessage,
    this.dwellProgress = 0,
    this.needMoreShots = false,
  });

  CaptureState copyWith({
    CapturePhase? phase,
    int? targetIndex,
    FrameOrientation? orientation,
    List<String>? framePaths,
    List<FrameOrientation>? frameOrientations,
    String? errorMessage,
    double? dwellProgress,
    bool? needMoreShots,
  }) =>
      CaptureState(
        phase: phase ?? this.phase,
        targetIndex: targetIndex ?? this.targetIndex,
        orientation: orientation ?? this.orientation,
        framePaths: framePaths ?? this.framePaths,
        frameOrientations: frameOrientations ?? this.frameOrientations,
        errorMessage: errorMessage ?? this.errorMessage,
        dwellProgress: dwellProgress ?? this.dwellProgress,
        needMoreShots: needMoreShots ?? this.needMoreShots,
      );

  CaptureTarget get currentTarget => kCaptureTargets[targetIndex];
  int get total => kCaptureTargets.length;
  bool get done => framePaths.length >= kCaptureTargets.length;
}

final captureControllerProvider =
    NotifierProvider.autoDispose<CaptureController, CaptureState>(
        CaptureController.new);

class CaptureController extends Notifier<CaptureState> {
  CameraController? camera;
  OrientationEngine? _engine;
  StreamSubscription<FrameOrientation>? _orientationSub;
  DateTime? _alignedSince;
  final List<FrameOrientation> _recent = [];
  Directory? _sessionDir;
  bool _capturing = false;
  bool _cameraPaused = false;
  bool _initializing = false;

  /// Consecutive `captureFrame` failures. Auto-capture re-fires every ~400ms
  /// while the device holds alignment, so a persistent failure (disk full,
  /// session directory swept, camera invalidated by another app) used to loop
  /// forever with the error swallowed and nothing shown to the user.
  int _captureFailures = 0;
  static const _maxCaptureFailures = 3;

  bool get isCameraPaused => _cameraPaused;

  @override
  CaptureState build() {
    ref.onDispose(_teardown);
    return const CaptureState();
  }

  @visibleForTesting
  void setStateForTest(CaptureState value) => state = value;

  Future<void> pauseCamera() async {
    // Pause the orientation stream too: sensors keep firing during
    // AppLifecycleState.inactive otherwise, wasting battery and feeding
    // stale samples into the stability window on resume.
    _orientationSub?.pause();
    await camera?.dispose();
    camera = null;
    _cameraPaused = true;
  }

  Future<void> initialize() async {
    // Re-entrancy guard: initialize() has many awaits and can be kicked off
    // concurrently from _start(), the error-retry button and the app
    // lifecycle callback. Only one run at a time.
    if (_initializing) return;
    _initializing = true;
    try {
      final cameras = await availableCameras();
      if (!ref.mounted) return;
      final back = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );
      await camera?.dispose();
      camera = CameraController(
        back,
        ResolutionPreset.high, // 1080p: enough for stitching, avoids OOM
        enableAudio: false,
      );
      await camera!.initialize();
      if (!ref.mounted) return;

      if (_sessionDir == null) {
        final docs = await getApplicationDocumentsDirectory();
        if (!ref.mounted) return;
        _sessionDir = Directory(
            '${docs.path}/captures/${DateTime.now().millisecondsSinceEpoch}');
        await _sessionDir!.create(recursive: true);
        if (!ref.mounted) return;
      }

      if (_engine == null) {
        _engine = OrientationEngine()..start();
        // Give the low-pass filters a beat to settle, then zero the yaw.
        await Future<void>.delayed(const Duration(milliseconds: 600));
        if (!ref.mounted) return;
        _engine!.zero();
        await _orientationSub?.cancel();
        _orientationSub = _engine!.stream.listen(_onOrientation);
      } else {
        _orientationSub ??= _engine!.stream.listen(_onOrientation);
        // Resume the subscription paused in pauseCamera(). A broadcast
        // subscription buffers while paused, so resume rather than re-listen
        // to avoid a stale-sample flood.
        if (_orientationSub!.isPaused) _orientationSub!.resume();
      }

      _cameraPaused = false;
      if (state.phase == CapturePhase.initializing ||
          state.phase == CapturePhase.error) {
        // A fresh camera session gets a fresh failure budget.
        _captureFailures = 0;
        state = state.copyWith(phase: CapturePhase.aiming);
      }
    } on CameraException catch (e) {
      if (!ref.mounted) return;
      state = state.copyWith(
        phase: CapturePhase.error,
        errorMessage: e.description ?? 'Camera unavailable',
      );
    } catch (e) {
      if (!ref.mounted) return;
      state =
          state.copyWith(phase: CapturePhase.error, errorMessage: '$e');
    } finally {
      _initializing = false;
    }
  }

  void _onOrientation(FrameOrientation o) {
    if (state.phase != CapturePhase.aiming) return;

    // Stability: max orientation delta over the recent window.
    _recent.add(o);
    while (_recent.length > 10) {
      _recent.removeAt(0);
    }
    final stable = _recent.length >= 5 &&
        _recent.every((r) =>
            wrapDegrees(r.yaw - o.yaw).abs() < kStableToleranceDeg &&
            (r.pitch - o.pitch).abs() < kStableToleranceDeg);

    final aligned = isAligned(state.currentTarget, o);
    double dwell = 0;
    if (aligned && stable) {
      _alignedSince ??= DateTime.now();
      final held = DateTime.now().difference(_alignedSince!);
      dwell = (held.inMilliseconds / kDwell.inMilliseconds).clamp(0, 1);
      if (held >= kDwell) {
        _alignedSince = null;
        captureFrame(); // auto-capture
      }
    } else {
      _alignedSince = null;
    }

    state = state.copyWith(orientation: o, dwellProgress: dwell);
  }

  /// Capture at the current orientation (auto trigger or the manual button).
  Future<void> captureFrame() async {
    final cam = camera;
    if (cam == null || !cam.value.isInitialized || _capturing) return;
    if (state.phase != CapturePhase.aiming) return;
    _capturing = true;
    state = state.copyWith(phase: CapturePhase.shooting);
    try {
      // Lock exposure after the first frame so seams don't shift brightness.
      if (state.framePaths.isEmpty) {
        try {
          await cam.setExposureMode(ExposureMode.locked);
        } catch (_) {
          // best-effort; not all devices support exposure lock
        }
        if (!ref.mounted) return;
      }
      // Snapshot the shutter pose BEFORE the capture: takePicture() can take
      // 100-500ms while the user keeps rotating, so reading _engine?.current
      // afterwards would lag the actual frame pose and create stitch seams.
      final orientation = _engine?.current ??
          const FrameOrientation(yaw: 0, pitch: 0);
      final shot = await cam.takePicture();
      if (!ref.mounted) return;
      final index = state.framePaths.length;
      final path = '${_sessionDir!.path}/frame_$index.jpg';
      await File(shot.path).copy(path);
      if (!ref.mounted) return;

      _captureFailures = 0;
      final frames = [...state.framePaths, path];
      final orientations = [...state.frameOrientations, orientation];
      final nextIndex = state.targetIndex + 1;
      if (nextIndex >= kCaptureTargets.length && frames.length >= 4) {
        state = state.copyWith(
          framePaths: frames,
          frameOrientations: orientations,
          phase: CapturePhase.review,
          needMoreShots: false,
        );
      } else if (nextIndex >= kCaptureTargets.length) {
        // Stay aiming on the last target; need more shots.
        state = state.copyWith(
          framePaths: frames,
          frameOrientations: orientations,
          phase: CapturePhase.aiming,
          needMoreShots: true,
        );
      } else {
        state = state.copyWith(
          framePaths: frames,
          frameOrientations: orientations,
          targetIndex: nextIndex,
          phase: CapturePhase.aiming,
          needMoreShots: false,
        );
      }
    } catch (e) {
      debugPrint('captureFrame failed: $e');
      if (!ref.mounted) return;
      _captureFailures++;
      // One bad shot is retried by the next dwell; a persistent failure must
      // stop and say why instead of spinning the reticle forever.
      if (_captureFailures >= _maxCaptureFailures) {
        state = state.copyWith(
          phase: CapturePhase.error,
          errorMessage: e is CameraException
              ? (e.description ?? 'Camera capture failed')
              : 'Could not save the photo: $e',
        );
      } else {
        state = state.copyWith(phase: CapturePhase.aiming);
      }
    } finally {
      _capturing = false;
    }
  }

  /// Skip the current target (e.g. blocked by furniture).
  void skipTarget() {
    if (state.phase != CapturePhase.aiming) return;
    if (state.targetIndex + 1 >= kCaptureTargets.length) {
      if (state.framePaths.length >= 4) {
        state = state.copyWith(
          phase: CapturePhase.review,
          needMoreShots: false,
        );
      } else {
        state = state.copyWith(needMoreShots: true);
      }
      return;
    }
    _alignedSince = null;
    state = state.copyWith(
      targetIndex: state.targetIndex + 1,
      needMoreShots: false,
    );
  }

  /// Name the scan and hand it off: save asset (or a room on an existing
  /// asset), kick stitching, enqueue upload.
  Future<void> saveScan(String name, String ownerId,
      {String? intoAssetId}) async {
    // Read everything needed by the background work BEFORE any await —
    // this is an autoDispose notifier and `ref` dies with the screen.
    final assets = ref.read(assetRepositoryProvider);
    final queue = ref.read(uploadQueueProvider);
    final preferDevice = ref.read(processingPreferenceProvider).value !=
        ProcessingPreference.cloudFirst;
    // Cut to the backend's 255-character limit here, so a pasted long name
    // never reaches a create call that answers 422.
    final cleanName =
        name.trim().isEmpty ? 'Untitled room' : clampName(name.trim());

    if (intoAssetId != null) {
      final framePaths = state.framePaths;
      final frameOrientations = state.frameOrientations;
      final sessionPath = _sessionDir!.path;
      final room = Room(
        id: const Uuid().v4(),
        assetId: intoAssetId,
        name: cleanName,
      );
      await assets.saveRoom(room);
      unawaited(_stitchRoomAndUpload(assets, queue, intoAssetId, room,
          framePaths, frameOrientations, sessionPath,
          preferDevice: preferDevice));
      return;
    }

    final asset = ScanAsset(
      id: const Uuid().v4(),
      ownerId: ownerId,
      name: cleanName,
      status: AssetStatus.stitching,
      createdAt: DateTime.now(),
      framePaths: state.framePaths,
      frameOrientations: state.frameOrientations,
    );
    await assets.saveAsset(asset);

    // Stitch in the background; the asset list reflects status changes.
    unawaited(_stitchAndUpload(assets, asset, _sessionDir!.path,
        preferDevice: preferDevice));
  }

  Future<void> _stitchAndUpload(
      AssetRepository assets, ScanAsset asset, String outDir,
      {bool preferDevice = true}) async {
    try {
      final result = await const StitcherService().stitch(
        framePaths: asset.framePaths,
        orientations: asset.frameOrientations,
        outDir: outDir,
        preferDevice: preferDevice,
      );
      final stitched = asset.copyWith(
        // A naive local stitch is shipped immediately, then the raw frames
        // ride along so the backend can re-stitch with OpenCV.
        status: result.naive
            ? AssetStatus.pendingCloudStitch
            : AssetStatus.stitching,
        panoramaPath: result.panoramaPath,
        thumbnailPath: result.thumbnailPath,
      );
      await assets.saveAsset(stitched);
      await assets.enqueueUpload(stitched);
    } catch (e) {
      await assets.saveAsset(asset.copyWith(status: AssetStatus.failed));
    }
  }

  Future<void> _stitchRoomAndUpload(
    AssetRepository assets,
    UploadQueue queue,
    String assetId,
    Room room,
    List<String> framePaths,
    List<FrameOrientation> orientations,
    String outDir, {
    bool preferDevice = true,
  }) async {
    // Reflect the pipeline state immediately so the room list never shows a
    // not-started room as "Uploading…" with no progress (focus g).
    await assets.saveRoom(room.copyWith(status: 'uploading'));
    try {
      final result = await const StitcherService().stitch(
        framePaths: framePaths,
        orientations: orientations,
        outDir: outDir,
        preferDevice: preferDevice,
      );
      final stitched = room.copyWith(
        panoramaPath: result.panoramaPath,
        // Not ready until the queue has uploaded it and created the scene.
        status: 'uploading',
      );
      await assets.saveRoom(stitched);
      final asset = await assets.getAsset(assetId);
      if (asset != null) await queue.enqueueRoom(asset, stitched);
    } catch (e) {
      // Terminal stitch failure: surface it on the room instead of leaving
      // it stuck at "Uploading…" forever (focus g). Upload failures after
      // enqueue are marked by the queue's onGiveUp.
      await assets.saveRoom(room.copyWith(
        status: 'failed',
        lastError: 'Stitching failed: $e — try re-capturing',
      ));
    }
  }

  Future<void> _teardown() async {
    await _orientationSub?.cancel();
    _engine?.dispose();
    await camera?.dispose();
  }
}
