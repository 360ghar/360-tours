import '../../../core/models/models.dart';
import '../domain/capture_targets.dart';
import '../domain/frame_quality.dart';

enum CapturePhase { initializing, aiming, shooting, review, error }

/// Sentinel so [CaptureState.copyWith] can reset nullable fields to null.
const _sentinel = Object();

/// Offer shown once when the capture screen opens with an interrupted session
/// on disk ("Resume previous capture?").
class ResumeOffer {
  final String sessionId;
  final int frameCount;
  final int total;
  final int targetIndex;

  const ResumeOffer({
    required this.sessionId,
    required this.frameCount,
    required this.total,
    required this.targetIndex,
  });
}

/// UI-facing capture state (presentation model). The source of truth for
/// frame bookkeeping is [capturedTargets] (parallel to [framePaths]); images
/// live as files, never in state.
class CaptureState {
  final CapturePhase phase;
  final int targetIndex;
  final FrameOrientation orientation;
  final List<String> framePaths;
  final List<FrameOrientation> frameOrientations;

  /// Plan target index each frame was captured for, parallel to [framePaths].
  /// A retake REPLACES the entry for its target, so this is never a set.
  final List<int> capturedTargets;
  final String? errorMessage;

  /// 0..1 progress of the alignment dwell (drives the reticle fill ring).
  final double dwellProgress;

  /// True when the last target is reached with fewer than 4 frames captured.
  final bool needMoreShots;

  /// The adaptive layout for this session. Null only in unit-test state
  /// objects; live sessions always have one.
  final CapturePlan? plan;

  /// Why the current target's last frame was rejected (human copy lives in
  /// presentation). Cleared when a frame is accepted.
  final FrameRejectionReason? rejectionReason;

  /// True while the engine detects translation (keep-phone-put warning).
  final bool movementWarning;

  /// True when the last target was reached: either everything captured
  /// (phase review) or angles are still missing (phase aiming).
  final bool captureComplete;

  /// Targets whose frame was auto-accepted via hysteresis despite failing
  /// the quality gate.
  final Set<int> lowQualityTargets;

  /// Targets the user skipped (kept so skipped angles can be retaken).
  final Set<int> skippedTargets;

  final ResumeOffer? resumeOffer;

  /// Set once when a session record exists but cannot be resumed (frames
  /// deleted, zero progress, corrupt payload). Shown as an informational
  /// dialog, then cleared by the controller.
  final String? resumeError;

  const CaptureState({
    this.phase = CapturePhase.initializing,
    this.targetIndex = 0,
    this.orientation = const FrameOrientation(yaw: 0, pitch: 0),
    this.framePaths = const [],
    this.frameOrientations = const [],
    this.capturedTargets = const [],
    this.errorMessage,
    this.dwellProgress = 0,
    this.needMoreShots = false,
    this.plan,
    this.rejectionReason,
    this.movementWarning = false,
    this.captureComplete = false,
    this.lowQualityTargets = const {},
    this.skippedTargets = const {},
    this.resumeOffer,
    this.resumeError,
  });

  CapturePlan get effectivePlan => plan ?? kFallbackCapturePlan;
  CaptureTarget get currentTarget => effectivePlan.targets[targetIndex];
  int get total => effectivePlan.total;
  bool get done => total > 0 && capturedTargets.length >= total;

  CaptureState copyWith({
    CapturePhase? phase,
    int? targetIndex,
    FrameOrientation? orientation,
    List<String>? framePaths,
    List<FrameOrientation>? frameOrientations,
    List<int>? capturedTargets,
    Object? errorMessage = _sentinel,
    double? dwellProgress,
    bool? needMoreShots,
    CapturePlan? plan,
    Object? rejectionReason = _sentinel,
    bool? movementWarning,
    bool? captureComplete,
    Set<int>? lowQualityTargets,
    Set<int>? skippedTargets,
    Object? resumeOffer = _sentinel,
    Object? resumeError = _sentinel,
  }) => CaptureState(
    phase: phase ?? this.phase,
    targetIndex: targetIndex ?? this.targetIndex,
    orientation: orientation ?? this.orientation,
    framePaths: framePaths ?? this.framePaths,
    frameOrientations: frameOrientations ?? this.frameOrientations,
    capturedTargets: capturedTargets ?? this.capturedTargets,
    errorMessage: identical(errorMessage, _sentinel)
        ? this.errorMessage
        : errorMessage as String?,
    dwellProgress: dwellProgress ?? this.dwellProgress,
    needMoreShots: needMoreShots ?? this.needMoreShots,
    plan: plan ?? this.plan,
    rejectionReason: identical(rejectionReason, _sentinel)
        ? this.rejectionReason
        : rejectionReason as FrameRejectionReason?,
    movementWarning: movementWarning ?? this.movementWarning,
    captureComplete: captureComplete ?? this.captureComplete,
    lowQualityTargets: lowQualityTargets ?? this.lowQualityTargets,
    skippedTargets: skippedTargets ?? this.skippedTargets,
    resumeOffer: identical(resumeOffer, _sentinel)
        ? this.resumeOffer
        : resumeOffer as ResumeOffer?,
    resumeError: identical(resumeError, _sentinel)
        ? this.resumeError
        : resumeError as String?,
  );
}

/// Outcome of a frame-capture decision (pure, unit-tested).
class CaptureDecision {
  final CaptureState state;
  final int consecutiveRejects;

  /// Path of the frame this accept REPLACED, if any (the caller deletes the
  /// orphaned JPEG so retakes don't leak full-resolution files).
  final String? replacedPath;

  const CaptureDecision(
    this.state,
    this.consecutiveRejects, {
    this.replacedPath,
  });
}

/// True when [orientation] duplicates an already-captured frame belonging to
/// a DIFFERENT target. [capturedTargets] and [frameOrientations] are
/// PARALLEL BY CAPTURE ORDER (a target index is NOT a list position — with
/// skipped/retaken targets they diverge), so lookups must be positional.
bool isDuplicateCapture({
  required List<int> capturedTargets,
  required List<FrameOrientation> frameOrientations,
  required int targetIndex,
  required FrameOrientation orientation,
}) {
  for (var i = 0; i < capturedTargets.length; i++) {
    if (capturedTargets[i] != targetIndex &&
        sameDirection(frameOrientations[i], orientation)) {
      return true;
    }
  }
  return false;
}

/// Pure state-machine step: given the shutter result, decide accept/reject/
/// retake and advance. Kept free of I/O so every transition is deterministic
/// and testable without a camera.
///
/// Rules:
/// - Duplicate angle (frame aimed at a direction already captured for a
///   DIFFERENT target) → always reject, never auto-accept.
/// - Quality rejection → stay on the SAME target (single-target retake).
/// - Hysteresis: after 3 consecutive rejections the frame is accepted with a
///   low-quality flag (see [FrameQualityGate.kMaxAutoRejects]).
/// - Accept → frame recorded for the current target; advance unless the last
///   target was reached (review when complete, "angles missing" otherwise).
CaptureDecision decideCapture({
  required CaptureState state,
  required String path,
  required FrameOrientation orientation,
  required FrameQualityResult qualityResult,
  required bool duplicate,
  required int consecutiveRejects,
}) {
  final targetIndex = state.targetIndex;
  final plan = state.effectivePlan;

  if (duplicate) {
    return CaptureDecision(
      state.copyWith(
        phase: CapturePhase.aiming,
        rejectionReason: FrameRejectionReason.duplicate,
        dwellProgress: 0,
      ),
      consecutiveRejects,
    );
  }

  if (!qualityResult.accepted) {
    return CaptureDecision(
      state.copyWith(
        phase: CapturePhase.aiming,
        rejectionReason: qualityResult.rejectionReason,
        dwellProgress: 0,
      ),
      consecutiveRejects + 1,
    );
  }

  final lowQuality = qualityResult.quality.lowQuality;

  // Record the frame for the current target. A retake of an already-recorded
  // target (e.g. the last target recaptured after "angles missing") REPLACES
  // its entry — capturedTargets/framePaths/frameOrientations stay parallel
  // by capture order with at most one frame per target, so completion
  // counts stay honest and the session never grows duplicate angles.
  final capturedTargets = [...state.capturedTargets];
  final framePaths = [...state.framePaths];
  final frameOrientations = [...state.frameOrientations];
  final pos = capturedTargets.indexOf(targetIndex);
  final String? replacedPath;
  if (pos >= 0) {
    replacedPath = framePaths[pos];
    framePaths[pos] = path;
    frameOrientations[pos] = orientation;
  } else {
    replacedPath = null;
    capturedTargets.add(targetIndex);
    framePaths.add(path);
    frameOrientations.add(orientation);
  }
  final lowQualityTargets = lowQuality
      ? {...state.lowQualityTargets, targetIndex}
      : state.lowQualityTargets.difference({targetIndex});

  // Advance to the next target NOT yet captured: in retake/skip flows this
  // jumps straight to the next missing angle instead of re-guiding the user
  // through already-filled targets (which would silently replace their
  // frames). Normal sequential capture is unaffected (the next index is
  // never already captured).
  var advance = targetIndex + 1;
  while (advance < plan.total && capturedTargets.contains(advance)) {
    advance++;
  }

  if (advance >= plan.total) {
    if (capturedTargets.length >= plan.total) {
      return CaptureDecision(
        state.copyWith(
          phase: CapturePhase.review,
          capturedTargets: capturedTargets,
          framePaths: framePaths,
          frameOrientations: frameOrientations,
          lowQualityTargets: lowQualityTargets,
          captureComplete: true,
          rejectionReason: null,
          needMoreShots: false,
        ),
        0,
        replacedPath: replacedPath,
      );
    }
    // Last target captured but angles are still missing (skips): stay aiming
    // and surface the coverage gap instead of silently publishing.
    return CaptureDecision(
      state.copyWith(
        phase: CapturePhase.aiming,
        capturedTargets: capturedTargets,
        framePaths: framePaths,
        frameOrientations: frameOrientations,
        lowQualityTargets: lowQualityTargets,
        captureComplete: true,
        rejectionReason: null,
        needMoreShots: false,
      ),
      0,
      replacedPath: replacedPath,
    );
  }
  return CaptureDecision(
    state.copyWith(
      phase: CapturePhase.aiming,
      targetIndex: advance,
      capturedTargets: capturedTargets,
      framePaths: framePaths,
      frameOrientations: frameOrientations,
      lowQualityTargets: lowQualityTargets,
      rejectionReason: null,
      needMoreShots: false,
    ),
    0,
    replacedPath: replacedPath,
  );
}
