import '../../../core/models/models.dart';
import 'capture_targets.dart';

/// One captured frame inside a [CaptureSession]. Images stay as files; this
/// is lightweight metadata only (never image bytes).
class CapturedFrameRecord {
  /// Plan target this frame was captured for.
  final int targetIndex;

  /// Absolute path of the saved JPEG.
  final String path;

  /// Shutter-pose orientation (yaw/pitch/roll, degrees).
  final FrameOrientation orientation;

  /// True when the frame was accepted via hysteresis despite failing the
  /// quality gate (shown as a warning in the coverage report).
  final bool lowQuality;

  const CapturedFrameRecord({
    required this.targetIndex,
    required this.path,
    required this.orientation,
    this.lowQuality = false,
  });

  Map<String, dynamic> toJson() => {
    'targetIndex': targetIndex,
    'path': path,
    'orientation': orientation.toJson(),
    'lowQuality': lowQuality,
  };

  factory CapturedFrameRecord.fromJson(Map<String, dynamic> json) =>
      CapturedFrameRecord(
        targetIndex: (json['targetIndex'] as num?)?.toInt() ?? 0,
        path: json['path'] as String? ?? '',
        orientation: FrameOrientation.fromJson(
          Map<String, dynamic>.from(json['orientation'] as Map? ?? {}),
        ),
        lowQuality: json['lowQuality'] as bool? ?? false,
      );
}

/// Crash-safe capture state. Survives backgrounding, process restart and
/// temporary camera failure. Persisted as JSON via [CaptureSessionStore].
class CaptureSession {
  final String id;
  final DateTime createdAt;

  /// When the capture is a new room inside an existing asset.
  final String? assetId;

  /// The plan profile the session was laid out with (target indices only
  /// mean something against the same profile).
  final CameraProfile profile;

  /// Index of the NEXT target to capture.
  final int targetIndex;

  final List<CapturedFrameRecord> frames;
  final List<int> skippedTargets;

  const CaptureSession({
    required this.id,
    required this.createdAt,
    required this.profile,
    required this.targetIndex,
    this.assetId,
    this.frames = const [],
    this.skippedTargets = const [],
  });

  int get frameCount => frames.length;

  Map<String, dynamic> toJson() => {
    'id': id,
    'createdAt': createdAt.toIso8601String(),
    'assetId': assetId,
    'profile': profile.toJson(),
    'targetIndex': targetIndex,
    'frames': frames.map((f) => f.toJson()).toList(),
    'skippedTargets': skippedTargets,
  };

  factory CaptureSession.fromJson(Map<String, dynamic> json) => CaptureSession(
    id: json['id'] as String? ?? '',
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
    assetId: json['assetId'] as String?,
    profile: CameraProfile.fromJson(
      Map<String, dynamic>.from(json['profile'] as Map? ?? {}),
    ),
    targetIndex: (json['targetIndex'] as num?)?.toInt() ?? 0,
    frames:
        (json['frames'] as List?)
            ?.map(
              (f) => CapturedFrameRecord.fromJson(Map<String, dynamic>.from(f)),
            )
            .toList() ??
        const [],
    skippedTargets: (json['skippedTargets'] as List?)?.cast<int>() ?? const [],
  );
}
