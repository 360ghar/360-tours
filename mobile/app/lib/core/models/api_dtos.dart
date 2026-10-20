// Typed DTOs for the 360ghar backend responses the app reads. `BackendApi`
// parses every response into these at the boundary, so nothing above it handles
// a raw `Map<String, dynamic>`.
//
// A missing required field throws `FormatException`; `BackendApi` turns that
// into an `ApiException` with code `BAD_RESPONSE`. Enum values come from
// `wire_enums.dart`: an unknown value reads as null, never as a real value.
// Fixtures in test/fixtures/api come from the backend's own Pydantic models
// (tool/api_fixtures.py) and test/contract parses each one with these classes.

import 'wire_enums.dart';

/// Backend limit for tour, scene and hotspot titles (characters).
const kMaxNameLength = 255;

/// Cuts [value] to [kMaxNameLength] characters without splitting a surrogate
/// pair. The backend counts characters, so 255 code points always fit.
String clampName(String value) => value.runes.length <= kMaxNameLength
    ? value
    : String.fromCharCodes(value.runes.take(kMaxNameLength));

Map<String, dynamic> asJsonMap(Object? value, String what) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  throw FormatException('$what: expected a JSON object');
}

String _str(Map<String, dynamic> j, String key, String what) {
  final v = j[key];
  if (v is String && v.isNotEmpty) return v;
  throw FormatException('$what.$key is missing');
}

String? _optStr(Map<String, dynamic> j, String key) {
  final v = j[key];
  return v is String ? v : null;
}

int _int(Map<String, dynamic> j, String key, String what) {
  final v = j[key];
  if (v is num) return v.toInt();
  throw FormatException('$what.$key is missing');
}

double _num(Map<String, dynamic> j, String key, String what) {
  final v = j[key];
  if (v is num) return v.toDouble();
  throw FormatException('$what.$key is missing');
}

bool _bool(Map<String, dynamic> j, String key, String what) {
  final v = j[key];
  if (v is bool) return v;
  throw FormatException('$what.$key is missing');
}

/// The raw value of a required enum field. The key must be present and not
/// null: a missing field is a broken response. A value the app does not know is
/// still allowed here and reads as null in the enum's `fromJson`.
Object _required(Map<String, dynamic> j, String key, String what) {
  final v = j[key];
  if (v != null) return v;
  throw FormatException('$what.$key is missing');
}

List<Map<String, dynamic>> _objects(Object? value, String what) {
  if (value == null) return const [];
  if (value is! List) throw FormatException('$what: expected a list');
  return [for (final e in value) asJsonMap(e, what)];
}

/// `CursorPage[T]`: `items`, `next_cursor`, `has_more`, `limit`, `total`.
class CursorPage<T> {
  const CursorPage({
    required this.items,
    required this.nextCursor,
    required this.hasMore,
    required this.limit,
    required this.total,
  });

  final List<T> items;
  final String? nextCursor;
  final bool hasMore;
  final int limit;

  /// Set only when the request sent `include_total=true`.
  final int? total;

  factory CursorPage.fromJson(
    Object? json,
    T Function(Map<String, dynamic>) parse,
  ) {
    final m = asJsonMap(json, 'page');
    return CursorPage(
      items: [for (final e in _objects(m['items'], 'page.items')) parse(e)],
      nextCursor: _optStr(m, 'next_cursor'),
      hasMore: _bool(m, 'has_more', 'page'),
      limit: _int(m, 'limit', 'page'),
      total: (m['total'] as num?)?.toInt(),
    );
  }
}

/// `Tour` (create and publish responses).
class TourDto {
  const TourDto({
    required this.id,
    required this.title,
    required this.status,
    required this.visibility,
    required this.shortCode,
  });

  final String id;
  final String title;
  final TourStatus? status;
  final TourVisibility? visibility;

  /// Set when the tour is published. The public link is `/v/{short_code}`.
  final String? shortCode;

  factory TourDto.fromJson(Map<String, dynamic> j) => TourDto(
        id: _str(j, 'id', 'tour'),
        title: _str(j, 'title', 'tour'),
        status: TourStatus.fromJson(_required(j, 'status', 'tour')),
        visibility:
            TourVisibility.fromJson(_required(j, 'visibility', 'tour')),
        shortCode: _optStr(j, 'short_code'),
      );
}

/// `TourWithScenes` (owner) or `PublicTourWithScenes`, read from
/// `GET /tours/{id}`. Both carry `main_scene_id`, `scenes` and `floor_plans`.
class TourDetailDto {
  const TourDetailDto({
    required this.tour,
    required this.mainSceneId,
    required this.scenes,
    required this.floorPlans,
  });

  final TourDto tour;

  /// The scene with the lowest `order_index`, or null when the tour has none.
  final String? mainSceneId;
  final List<SceneDto> scenes;
  final List<FloorPlanDto> floorPlans;

  factory TourDetailDto.fromJson(Map<String, dynamic> j) => TourDetailDto(
        tour: TourDto.fromJson(j),
        mainSceneId: _optStr(j, 'main_scene_id'),
        scenes: [
          for (final s in _objects(j['scenes'], 'tour.scenes'))
            SceneDto.fromJson(s),
        ],
        floorPlans: [
          for (final f in _objects(j['floor_plans'], 'tour.floor_plans'))
            FloorPlanDto.fromJson(f),
        ],
      );
}

/// `Scene`.
class SceneDto {
  const SceneDto({
    required this.id,
    required this.tourId,
    required this.title,
    required this.imageUrl,
    required this.orderIndex,
  });

  final String id;
  final String tourId;
  final String? title;
  final String imageUrl;
  final int orderIndex;

  factory SceneDto.fromJson(Map<String, dynamic> j) => SceneDto(
        id: _str(j, 'id', 'scene'),
        tourId: _str(j, 'tour_id', 'scene'),
        title: _optStr(j, 'title'),
        imageUrl: _str(j, 'image_url', 'scene'),
        orderIndex: _int(j, 'order_index', 'scene'),
      );
}

/// `Hotspot`. The single typed hotspot of the app: the editor list reads it and
/// the target is a backend scene id.
class HotspotDto {
  const HotspotDto({
    required this.id,
    required this.sceneId,
    required this.type,
    required this.title,
    required this.yawDeg,
    required this.pitchDeg,
    required this.targetSceneId,
    required this.isActive,
  });

  final String id;
  final String sceneId;
  final HotspotType? type;
  final String? title;

  /// Null when the stored position failed validation on the server.
  final double? yawDeg;
  final double? pitchDeg;
  final String? targetSceneId;
  final bool isActive;

  factory HotspotDto.fromJson(Map<String, dynamic> j) {
    final position = j['position'];
    final pos = position == null ? null : asJsonMap(position, 'hotspot.position');
    return HotspotDto(
      id: _str(j, 'id', 'hotspot'),
      sceneId: _str(j, 'scene_id', 'hotspot'),
      type: HotspotType.fromJson(_required(j, 'type', 'hotspot')),
      title: _optStr(j, 'title'),
      yawDeg: (pos?['yaw'] as num?)?.toDouble(),
      pitchDeg: (pos?['pitch'] as num?)?.toDouble(),
      targetSceneId: _optStr(j, 'target_scene_id'),
      isActive: _bool(j, 'is_active', 'hotspot'),
    );
  }
}

/// One `FloorPlanMarker` of a `FloorPlanResponse`: a scene pinned on the plan.
class FloorPlanMarkerDto {
  const FloorPlanMarkerDto({
    required this.sceneId,
    required this.x,
    required this.y,
    required this.label,
  });

  final String sceneId;

  /// Percentage of the image width (0-100), the unit the web editor writes.
  final double x;

  /// Percentage of the image height (0-100).
  final double y;

  final String? label;

  factory FloorPlanMarkerDto.fromJson(Map<String, dynamic> j) =>
      FloorPlanMarkerDto(
        sceneId: _str(j, 'scene_id', 'floor plan marker'),
        x: _num(j, 'x', 'floor plan marker'),
        y: _num(j, 'y', 'floor plan marker'),
        label: _optStr(j, 'label'),
      );
}

/// `FloorPlanResponse`.
class FloorPlanDto {
  const FloorPlanDto({
    required this.id,
    required this.tourId,
    required this.name,
    required this.imageUrl,
    required this.floorNumber,
    required this.markers,
  });

  final String id;
  final String tourId;
  final String name;
  final String imageUrl;
  final int floorNumber;

  /// The server drops a stored marker that fails validation, so every entry
  /// here is placeable.
  final List<FloorPlanMarkerDto> markers;

  factory FloorPlanDto.fromJson(Map<String, dynamic> j) => FloorPlanDto(
        id: _str(j, 'id', 'floor plan'),
        tourId: _str(j, 'tour_id', 'floor plan'),
        name: _str(j, 'name', 'floor plan'),
        imageUrl: _str(j, 'image_url', 'floor plan'),
        floorNumber: _int(j, 'floor_number', 'floor plan'),
        markers: [
          for (final m in _objects(j['markers'], 'floor plan.markers'))
            FloorPlanMarkerDto.fromJson(m),
        ],
      );
}

/// `PresignedUploadResponseItem`. Every field the Cloudinary form needs is
/// required, so a missing one fails here and never reaches Cloudinary as an
/// empty form field.
class PresignedUploadDto {
  const PresignedUploadDto({
    required this.uploadId,
    required this.signedUrl,
    required this.signature,
    required this.apiKey,
    required this.timestamp,
    required this.publicId,
    required this.path,
    required this.publicUrl,
    this.type,
  });

  final String uploadId;
  final String signedUrl;
  final String signature;
  final String apiKey;
  final int timestamp;
  final String publicId;
  final String path;
  final String publicUrl;

  /// `authenticated` for document folders. The signature covers it, so it is
  /// sent as a form field. Null for everything else: send nothing.
  final String? type;

  factory PresignedUploadDto.fromJson(Map<String, dynamic> j) =>
      PresignedUploadDto(
        uploadId: _str(j, 'upload_id', 'presign'),
        signedUrl: _str(j, 'signed_url', 'presign'),
        signature: _str(j, 'signature', 'presign'),
        apiKey: _str(j, 'api_key', 'presign'),
        timestamp: _int(j, 'timestamp', 'presign'),
        publicId: _str(j, 'public_id', 'presign'),
        path: _str(j, 'path', 'presign'),
        publicUrl: _str(j, 'public_url', 'presign'),
        type: _optStr(j, 'type'),
      );

  /// Same keys as the backend, so a job saved by an earlier build still loads.
  Map<String, dynamic> toJson() => {
        'upload_id': uploadId,
        'signed_url': signedUrl,
        'signature': signature,
        'api_key': apiKey,
        'timestamp': timestamp,
        'public_id': publicId,
        'path': path,
        'public_url': publicUrl,
        'type': type,
      };
}

/// `UploadConfirmResponse`: the media row of the confirmed upload.
class UploadConfirmDto {
  const UploadConfirmDto({
    required this.mediaId,
    required this.fileUrl,
    required this.uploadStatus,
  });

  final String mediaId;
  final String fileUrl;
  final UploadStatus? uploadStatus;

  factory UploadConfirmDto.fromJson(Map<String, dynamic> j) {
    final media = asJsonMap(j['media'], 'confirm.media');
    return UploadConfirmDto(
      mediaId: _str(media, 'id', 'media'),
      fileUrl: _str(media, 'file_url', 'media'),
      uploadStatus: UploadStatus.fromJson(media['upload_status']),
    );
  }
}

/// `AIJobBase`.
class AiJobDto {
  const AiJobDto({
    required this.id,
    required this.jobType,
    required this.status,
    required this.progress,
    required this.errorMessage,
  });

  final String id;
  final AIJobType? jobType;

  /// Null for a status this app does not know. Treat it as still running.
  final AIJobStatus? status;
  final int progress;
  final String? errorMessage;

  bool get isTerminal =>
      status == AIJobStatus.completed ||
      status == AIJobStatus.failed ||
      status == AIJobStatus.cancelled;

  factory AiJobDto.fromJson(Map<String, dynamic> j) => AiJobDto(
        id: _str(j, 'id', 'job'),
        jobType: AIJobType.fromJson(j['job_type']),
        status: AIJobStatus.fromJson(_required(j, 'status', 'job')),
        progress: _int(j, 'progress', 'job'),
        errorMessage: _optStr(j, 'error_message'),
      );
}

/// `StitchResult`: the `result` of a completed `panorama_stitch` job.
class StitchResultDto {
  const StitchResultDto({
    required this.imageUrl,
    required this.width,
    required this.height,
  });

  final String imageUrl;
  final int width;
  final int height;

  factory StitchResultDto.fromJson(Map<String, dynamic> j) => StitchResultDto(
        imageUrl: _str(j, 'image_url', 'stitch result'),
        width: _int(j, 'width', 'stitch result'),
        height: _int(j, 'height', 'stitch result'),
      );
}

/// `AIJobResponse` (start of a job, no result) and `AIJobStatusResponse`
/// (`job` plus the typed `result`).
class AiJobSnapshotDto {
  const AiJobSnapshotDto({required this.job, this.stitch});

  final AiJobDto job;
  final StitchResultDto? stitch;

  factory AiJobSnapshotDto.fromJson(Map<String, dynamic> j) {
    final result = j['result'];
    return AiJobSnapshotDto(
      job: AiJobDto.fromJson(asJsonMap(j['job'], 'job response')),
      stitch: result is Map && result['image_url'] != null
          ? StitchResultDto.fromJson(asJsonMap(result, 'job result'))
          : null,
    );
  }
}

/// `TourAnalytics`. Only the keys the analytics screen reads.
class TourAnalyticsDto {
  const TourAnalyticsDto({
    required this.tourId,
    required this.totalViews,
    required this.sessionDurations,
    required this.hotspotClicks,
  });

  final String tourId;
  final int totalViews;

  /// One entry per viewer session, in seconds.
  final List<double> sessionDurations;

  /// Clicks per hotspot id.
  final Map<String, int> hotspotClicks;

  factory TourAnalyticsDto.fromJson(Map<String, dynamic> j) {
    final clicks = j['hotspot_clicks'];
    return TourAnalyticsDto(
      tourId: _str(j, 'tour_id', 'analytics'),
      totalViews: (j['total_views'] as num?)?.toInt() ?? 0,
      sessionDurations: [
        for (final d in (j['session_durations'] as List? ?? const []))
          if (d is num) d.toDouble(),
      ],
      hotspotClicks: {
        if (clicks is Map)
          for (final e in clicks.entries)
            if (e.value is num) '${e.key}': (e.value as num).toInt(),
      },
    );
  }
}

/// `AuthConfigResponse`: Google client ids for native sign-in.
class AuthConfigDto {
  const AuthConfigDto({this.googleWebClientId, this.googleIosClientId});

  final String? googleWebClientId;
  final String? googleIosClientId;

  factory AuthConfigDto.fromJson(Map<String, dynamic> j) => AuthConfigDto(
        googleWebClientId: _optStr(j, 'google_web_client_id'),
        googleIosClientId: _optStr(j, 'google_ios_client_id'),
      );
}
