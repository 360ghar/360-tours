import 'dart:async';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/storage/local_store.dart';
import '../../settings/domain/processing_preference.dart';
import '../data/capture_session_store.dart';
import '../domain/capture_session.dart';
import '../domain/capture_targets.dart';
import '../domain/frame_quality.dart';
import '../domain/orientation_engine.dart';
import '../domain/stitch_pipeline.dart';
import 'capture_state.dart';
export 'capture_state.dart';

final captureControllerProvider =
    NotifierProvider.autoDispose<CaptureController, CaptureState>(
      CaptureController.new,
    );

class CaptureController extends Notifier<CaptureState> {
  CameraController? camera;
  OrientationEngine? _engine;
  StreamSubscription<FrameOrientation>? _orientationSub;
  StreamSubscription<bool>? _movementSub;
  DateTime? _alignedSince;
  final List<FrameOrientation> _recent = [];
  Directory? _sessionDir;
  CaptureSession? _session;
  CaptureSessionStore? _sessionStore;
  Directory? _docsDir;
  bool _capturing = false;
  bool _cameraPaused = false;
  bool _initializing = false;
  int _consecutiveRejects = 0;
  Timer? _movementClearTimer;
  FrameQualityGate _qualityGate = const FrameQualityGate();

  /// The documented capture resolution: ~1080p (was 720p) — the OpenCV
  /// stitch rung downscales to <=1600px long side anyway, so memory is
  /// bounded regardless. Falls back to [ResolutionPreset.high] on devices
  /// that cannot open veryHigh.
  static const ResolutionPreset kCaptureResolution = ResolutionPreset.veryHigh;
  static const ResolutionPreset kCaptureResolutionFallback =
      ResolutionPreset.high;

  bool get isCameraPaused => _cameraPaused;

  /// Test seam: inject a deterministic gate.
  @visibleForTesting
  set qualityGate(FrameQualityGate gate) => _qualityGate = gate;

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
    _movementSub?.pause();
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
      camera = await _createCamera(back);
      if (!ref.mounted) return;
      // Phase 3 harness: log what the camera actually opened with (device
      // verification of the veryHigh preset; see docs/exec-plans/active/
      // phase-3-device-validation.md).
      debugPrint(
        '[capture] camera=${back.name} lens=${back.lensDirection} '
        'preset=${camera!.resolutionPreset} '
        'preview=${camera!.value.previewSize}',
      );

      if (_sessionStore == null) {
        final docs = await getApplicationDocumentsDirectory();
        if (!ref.mounted) return;
        _docsDir = docs;
        _sessionStore = CaptureSessionStore(LocalStore(docs));
      }

      // A fresh controller offers to resume an interrupted session; a
      // controller that already has one (lifecycle re-init) skips this.
      if (_session == null) {
        final stored = await _sessionStore!.load();
        if (!ref.mounted) return;
        if (stored != null) {
          if (CaptureSessionStore.framesIntact(stored) &&
              stored.targetIndex > 0) {
            _session = stored;
            state = state.copyWith(
              resumeOffer: ResumeOffer(
                sessionId: stored.id,
                frameCount: stored.frameCount,
                total: state.effectivePlan.total,
                targetIndex: stored.targetIndex,
              ),
            );
          } else {
            // Unrecoverable (frames deleted, zero progress, or corrupt):
            // surface a clear message; a fresh session starts below.
            await _sessionStore!.clear();
            state = state.copyWith(
              resumeError: 'Unable to resume capture.\nStart a new capture.',
            );
          }
        }
      }

      if (_session == null && _sessionDir == null) {
        _sessionDir = Directory(
          '${_docsDir!.path}/captures/${DateTime.now().millisecondsSinceEpoch}',
        );
        await _sessionDir!.create(recursive: true);
        if (!ref.mounted) return;
        _session = CaptureSession(
          id: const Uuid().v4(),
          createdAt: DateTime.now(),
          profile: CameraProfile.fallbackWide,
          targetIndex: 0,
        );
        await _persistSession();
      }

      if (_engine == null) {
        _engine = OrientationEngine()..start();
        // Give the low-pass filters a beat to settle, then zero the yaw.
        await Future<void>.delayed(const Duration(milliseconds: 600));
        if (!ref.mounted) return;
        _engine!.zero();
        await _orientationSub?.cancel();
        _orientationSub = _engine!.stream.listen(_onOrientation);
        _movementSub = _engine!.movementStream.listen(_onMovement);
      } else {
        _orientationSub ??= _engine!.stream.listen(_onOrientation);
        _movementSub ??= _engine!.movementStream.listen(_onMovement);
        // Resume the subscription paused in pauseCamera(). A broadcast
        // subscription buffers while paused, so resume rather than re-listen
        // to avoid a stale-sample flood.
        if (_orientationSub!.isPaused) _orientationSub!.resume();
        if (_movementSub!.isPaused) _movementSub!.resume();
      }

      _cameraPaused = false;
      if (state.phase == CapturePhase.initializing ||
          state.phase == CapturePhase.error) {
        state = state.copyWith(
          // Hold the spinner while a resume offer/error is pending: the
          // camera is live but aiming (and auto-capture) must not start
          // before the user resolves it.
          phase: (state.resumeOffer != null || state.resumeError != null)
              ? CapturePhase.initializing
              : CapturePhase.aiming,
          plan: const CaptureTargetPlanner().createPlan(
            CameraProfile.fallbackWide,
          ),
        );
      }
    } on CameraException catch (e) {
      if (!ref.mounted) return;
      state = state.copyWith(
        phase: CapturePhase.error,
        errorMessage: e.description ?? 'Camera unavailable',
      );
    } catch (e) {
      if (!ref.mounted) return;
      state = state.copyWith(phase: CapturePhase.error, errorMessage: '$e');
    } finally {
      _initializing = false;
    }
  }

  /// Opens the camera at ~1080p, falling back to 720p if that fails.
  Future<CameraController> _createCamera(CameraDescription back) async {
    try {
      final controller = CameraController(
        back,
        kCaptureResolution,
        enableAudio: false,
      );
      await controller.initialize();
      return controller;
    } on CameraException {
      final controller = CameraController(
        back,
        kCaptureResolutionFallback,
        enableAudio: false,
      );
      await controller.initialize();
      return controller;
    }
  }

  /// Resume an interrupted session offered at screen entry.
  Future<void> resumeSession() async {
    final session = _session;
    if (session == null) return;
    final plan = const CaptureTargetPlanner().createPlan(session.profile);
    _planFor(session, plan);
    if (session.frames.isNotEmpty) {
      final dir = File(session.frames.first.path).parent;
      _sessionDir = Directory(dir.path);
    } else if (_sessionDir == null) {
      // Skip-only session (no frames yet): nothing to reuse — create a fresh
      // session directory so captureFrame never sees a null dir.
      _sessionDir = Directory(
        '${_docsDir!.path}/captures/${DateTime.now().millisecondsSinceEpoch}',
      );
      await _sessionDir!.create(recursive: true);
    }
    await _persistSession();
  }

  void _planFor(CaptureSession session, CapturePlan plan) {
    final sorted = [...session.frames]
      ..sort((a, b) => a.targetIndex.compareTo(b.targetIndex));
    final paths = sorted.map((f) => f.path).toList();
    final orientations = sorted.map((f) => f.orientation).toList();
    final captured = sorted.map((f) => f.targetIndex).toList();
    final lowQuality = sorted
        .where((f) => f.lowQuality)
        .map((f) => f.targetIndex)
        .toSet();
    final complete = captured.length >= plan.total;
    final targetIndex = complete
        ? plan.total - 1
        : session.targetIndex.clamp(0, plan.total - 1);

    _consecutiveRejects = 0;
    state = state.copyWith(
      plan: plan,
      targetIndex: targetIndex,
      framePaths: paths,
      frameOrientations: orientations,
      capturedTargets: captured,
      lowQualityTargets: lowQuality,
      skippedTargets: session.skippedTargets.toSet(),
      phase: complete ? CapturePhase.review : CapturePhase.aiming,
      needMoreShots: false,
      captureComplete: complete,
      rejectionReason: null,
      resumeOffer: null,
    );
  }

  /// Discard the interrupted session (frame files + record) and start fresh.
  Future<void> discardSession() async {
    final session = _session;
    if (session != null) {
      CaptureSessionStore.deleteFrameFiles(session);
      await _sessionStore?.clear();
    }
    _session = null;
    _sessionDir = Directory(
      '${_docsDir!.path}/captures/${DateTime.now().millisecondsSinceEpoch}',
    );
    await _sessionDir!.create(recursive: true);
    _session = CaptureSession(
      id: const Uuid().v4(),
      createdAt: DateTime.now(),
      profile: CameraProfile.fallbackWide,
      targetIndex: 0,
    );
    await _persistSession();
    _consecutiveRejects = 0;
    state = state.copyWith(
      phase: CapturePhase.aiming,
      targetIndex: 0,
      framePaths: const [],
      frameOrientations: const [],
      capturedTargets: const [],
      skippedTargets: const {},
      lowQualityTargets: const {},
      needMoreShots: false,
      captureComplete: false,
      rejectionReason: null,
      resumeOffer: null,
    );
  }

  /// Dismiss the informational "unable to resume" message.
  void dismissResumeError() {
    if (state.resumeError == null) return;
    state = state.copyWith(resumeError: null, phase: CapturePhase.aiming);
  }

  void _onOrientation(FrameOrientation o) {
    if (state.phase != CapturePhase.aiming) return;

    // Stability: max orientation delta over the recent window.
    _recent.add(o);
    while (_recent.length > 10) {
      _recent.removeAt(0);
    }
    final stable =
        _recent.length >= 5 &&
        _recent.every(
          (r) =>
              wrapDegrees(r.yaw - o.yaw).abs() < kStableToleranceDeg &&
              (r.pitch - o.pitch).abs() < kStableToleranceDeg,
        );

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

  void _onMovement(bool moving) {
    if (!moving || state.phase != CapturePhase.aiming) return;
    state = state.copyWith(movementWarning: true);
    _movementClearTimer?.cancel();
    _movementClearTimer = Timer(const Duration(seconds: 4), () {
      if (!ref.mounted) return;
      state = state.copyWith(movementWarning: false);
    });
  }

  /// Capture at the current orientation (auto trigger or the manual button).
  Future<void> captureFrame() async {
    final cam = camera;
    if (cam == null || !cam.value.isInitialized || _capturing) return;
    if (state.phase != CapturePhase.aiming) return;
    // Never shoot while a resume offer is unresolved (session dir is not
    // valid yet and the user has not chosen how to proceed).
    if (state.resumeOffer != null || state.resumeError != null) return;
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
      final orientation =
          _engine?.current ?? const FrameOrientation(yaw: 0, pitch: 0);
      final shot = await cam.takePicture();
      if (!ref.mounted) return;

      final targetIndex = state.targetIndex;
      final path =
          '${_sessionDir!.path}/frame_${DateTime.now().millisecondsSinceEpoch}_$targetIndex.jpg';
      await File(shot.path).copy(path);
      if (!ref.mounted) return;

      // Quality gate: single downscaled decode of the saved frame.
      final quality = _qualityGate.evaluate(path);
      final result = _qualityGate.assess(
        quality,
        consecutiveRejects: _consecutiveRejects,
      );

      // Duplicate-angle check: a frame aimed at a direction already captured
      // for a DIFFERENT target (adjacent targets are >= spacing - 2*tolerance
      // apart, so this only trips on a mis-tapped retake or sensor drift).
      // Positional lookup: capturedTargets holds TARGET indices, which are
      // not list positions once targets were skipped or retaken.
      final duplicate = isDuplicateCapture(
        capturedTargets: state.capturedTargets,
        frameOrientations: state.frameOrientations,
        targetIndex: targetIndex,
        orientation: orientation,
      );

      final decision = decideCapture(
        state: state,
        path: path,
        orientation: orientation,
        qualityResult: result,
        duplicate: duplicate,
        consecutiveRejects: _consecutiveRejects,
      );
      _consecutiveRejects = decision.consecutiveRejects;
      state = decision.state;
      await _persistSession();
    } catch (e) {
      if (!ref.mounted) return;
      state = state.copyWith(phase: CapturePhase.aiming);
    } finally {
      _capturing = false;
    }
  }

  /// Skip the current target (e.g. blocked by furniture). Keeps the skipped
  /// angle recorded so the completion gate can demand a retake of it.
  void skipTarget() {
    if (state.phase != CapturePhase.aiming) return;
    if (state.resumeOffer != null || state.resumeError != null) return;
    if (state.targetIndex + 1 >= state.total) {
      if (state.framePaths.length >= 4) {
        state = state.copyWith(
          phase: CapturePhase.review,
          needMoreShots: false,
        );
      } else {
        state = state.copyWith(needMoreShots: true);
      }
      _persistSession();
      return;
    }
    _alignedSince = null;
    _consecutiveRejects = 0;
    state = state.copyWith(
      targetIndex: state.targetIndex + 1,
      needMoreShots: false,
      skippedTargets: {...state.skippedTargets, state.targetIndex},
    );
    _persistSession();
  }

  /// Jump back to the first angle still missing (used by "Retake missing
  /// angles" from the completion state / review sheet).
  void retakeMissingAngles() {
    if (state.phase != CapturePhase.aiming &&
        state.phase != CapturePhase.review) {
      return;
    }
    final missing =
        state.effectivePlan
            .missingTargets(state.capturedTargets.toSet())
            .toList()
          ..sort();
    if (missing.isEmpty) return;
    _alignedSince = null;
    _consecutiveRejects = 0;
    state = state.copyWith(
      targetIndex: missing.first,
      phase: CapturePhase.aiming,
      captureComplete: false,
      needMoreShots: false,
      rejectionReason: null,
    );
  }

  /// Name the scan and hand it off: save asset (or a room on an existing
  /// asset), kick stitching, enqueue upload. The persisted session is cleared
  /// (frame files stay — they now belong to the asset).
  Future<void> saveScan(
    String name,
    String ownerId, {
    String? intoAssetId,
  }) async {
    // Read everything needed by the background work BEFORE any await —
    // this is an autoDispose notifier and `ref` dies with the screen.
    final assets = ref.read(assetRepositoryProvider);
    final queue = ref.read(uploadQueueProvider);
    final preferDevice =
        ref.read(processingPreferenceProvider).value !=
        ProcessingPreference.cloudFirst;
    final cleanName = name.trim().isEmpty ? 'Untitled room' : name.trim();
    final framePaths = state.framePaths;
    final frameOrientations = state.frameOrientations;
    final outDir = _sessionDir?.path ?? _docsDir?.path ?? '.';

    // The frames now belong to the asset: drop the session RECORD (the
    // files themselves stay on disk).
    _session = null;
    _sessionDir = null;
    await _sessionStore?.clear();

    if (intoAssetId != null) {
      final room = Room(
        id: const Uuid().v4(),
        assetId: intoAssetId,
        name: cleanName,
      );
      await assets.saveRoom(room);
      unawaited(
        const StitchPipeline().stitchRoomAndUpload(
          assets,
          queue,
          intoAssetId,
          room,
          framePaths,
          frameOrientations,
          outDir,
          preferDevice: preferDevice,
        ),
      );
      return;
    }

    final asset = ScanAsset(
      id: const Uuid().v4(),
      ownerId: ownerId,
      name: cleanName,
      status: AssetStatus.stitching,
      createdAt: DateTime.now(),
      framePaths: framePaths,
      frameOrientations: frameOrientations,
      captureHFovDeg:
          state.plan?.profile.hFovDeg ?? CameraProfile.fallbackWide.hFovDeg,
      captureVFovDeg:
          state.plan?.profile.vFovDeg ?? CameraProfile.fallbackWide.vFovDeg,
      frameTargetIndices: state.capturedTargets,
      frameLowQuality: [
        for (var i = 0; i < state.capturedTargets.length; i++)
          state.lowQualityTargets.contains(state.capturedTargets[i]),
      ],
    );
    await assets.saveAsset(asset);

    // Stitch in the background; the asset list reflects status changes.
    unawaited(
      const StitchPipeline().stitchAndUpload(
        assets,
        asset,
        outDir,
        preferDevice: preferDevice,
      ),
    );
  }

  Future<void> _persistSession() async {
    final session = _session;
    final store = _sessionStore;
    if (session == null || store == null) return;
    final s = state;
    final frames = [
      for (var i = 0; i < s.capturedTargets.length; i++)
        CapturedFrameRecord(
          targetIndex: s.capturedTargets[i],
          path: s.framePaths[i],
          orientation: s.frameOrientations[i],
          lowQuality: s.lowQualityTargets.contains(s.capturedTargets[i]),
        ),
    ];
    final next = CaptureSession(
      id: session.id,
      createdAt: session.createdAt,
      assetId: session.assetId,
      profile: session.profile,
      targetIndex: s.phase == CapturePhase.review ? s.total - 1 : s.targetIndex,
      frames: frames,
      skippedTargets: s.skippedTargets.toList()..sort(),
    );
    _session = next;
    await store.save(next);
  }

  Future<void> _teardown() async {
    await _orientationSub?.cancel();
    await _movementSub?.cancel();
    _movementClearTimer?.cancel();
    _engine?.dispose();
    await camera?.dispose();
  }
}
