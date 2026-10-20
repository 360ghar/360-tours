// Shared domain models for 360 Tours. Single file on purpose — this is the
// contract every feature codes against. Plain immutable classes, JSON maps.

import '../env.dart';

/// Sentinel used by `copyWith` so nullable fields can be reset to `null`
/// (distinguishing "not passed" from "explicitly null").
const _sentinel = Object();

enum AssetType { pano360 }

/// Device orientation recorded with each captured frame (degrees). Feeds the
/// on-device fallback stitchers only. The cloud re-stitch request carries frame
/// URLs and nothing else (`SceneStitchRequest` has no pose field), so the
/// orientation never leaves the device.
class FrameOrientation {
  final double yaw;
  final double pitch;
  final double roll;

  const FrameOrientation({
    required this.yaw,
    required this.pitch,
    this.roll = 0,
  });

  Map<String, dynamic> toJson() => {'yaw': yaw, 'pitch': pitch, 'roll': roll};

  factory FrameOrientation.fromJson(Map<String, dynamic> json) =>
      FrameOrientation(
        yaw: (json['yaw'] as num?)?.toDouble() ?? 0,
        pitch: (json['pitch'] as num?)?.toDouble() ?? 0,
        roll: (json['roll'] as num?)?.toDouble() ?? 0,
      );
}

enum AssetStatus {
  capturing,
  stitching,
  pendingCloudStitch,
  ready,
  failed,
}

class AppUser {
  final String id;
  final String email;
  final String? displayName;
  final String? photoUrl;

  const AppUser({
    required this.id,
    required this.email,
    this.displayName,
    this.photoUrl,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'displayName': displayName,
        'photoUrl': photoUrl,
      };

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: json['id'] as String,
        email: json['email'] as String? ?? '',
        displayName: json['displayName'] as String?,
        photoUrl: json['photoUrl'] as String?,
      );
}

/// A captured scan: one 360 panorama (Phase 1) that can grow into a
/// multi-room tour (rooms).
class ScanAsset {
  final String id;
  final String ownerId;
  final String name;
  final AssetType type;
  final AssetStatus status;
  final DateTime createdAt;

  /// Local file path of the stitched equirectangular panorama.
  final String? panoramaPath;

  /// Remote URL once uploaded.
  final String? panoramaUrl;

  /// Local paths of the raw captured frames (kept for cloud re-stitch).
  final List<String> framePaths;

  final String? thumbnailPath;
  final String? shareCode;

  /// Backend Tour id once the asset has been created remotely.
  final String? remoteTourId;

  /// Backend id of the main scene (the panorama of this capture), stored when
  /// the queue creates it. A queue job that sees this id never uploads the
  /// panorama or creates a scene again.
  final String? remoteSceneId;

  /// Per-frame device orientation, parallel to [framePaths].
  final List<FrameOrientation> frameOrientations;

  const ScanAsset({
    required this.id,
    required this.ownerId,
    required this.name,
    this.type = AssetType.pano360,
    this.status = AssetStatus.capturing,
    required this.createdAt,
    this.panoramaPath,
    this.panoramaUrl,
    this.framePaths = const [],
    this.thumbnailPath,
    this.shareCode,
    this.remoteTourId,
    this.remoteSceneId,
    this.frameOrientations = const [],
  });

  ScanAsset copyWith({
    String? name,
    AssetType? type,
    AssetStatus? status,
    Object? panoramaPath = _sentinel,
    Object? panoramaUrl = _sentinel,
    List<String>? framePaths,
    Object? thumbnailPath = _sentinel,
    Object? shareCode = _sentinel,
    Object? remoteTourId = _sentinel,
    Object? remoteSceneId = _sentinel,
    List<FrameOrientation>? frameOrientations,
  }) =>
      ScanAsset(
        id: id,
        ownerId: ownerId,
        name: name ?? this.name,
        type: type ?? this.type,
        status: status ?? this.status,
        createdAt: createdAt,
        panoramaPath: identical(panoramaPath, _sentinel)
            ? this.panoramaPath
            : panoramaPath as String?,
        panoramaUrl: identical(panoramaUrl, _sentinel)
            ? this.panoramaUrl
            : panoramaUrl as String?,
        framePaths: framePaths ?? this.framePaths,
        thumbnailPath: identical(thumbnailPath, _sentinel)
            ? this.thumbnailPath
            : thumbnailPath as String?,
        shareCode: identical(shareCode, _sentinel)
            ? this.shareCode
            : shareCode as String?,
        remoteTourId: identical(remoteTourId, _sentinel)
            ? this.remoteTourId
            : remoteTourId as String?,
        remoteSceneId: identical(remoteSceneId, _sentinel)
            ? this.remoteSceneId
            : remoteSceneId as String?,
        frameOrientations: frameOrientations ?? this.frameOrientations,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'ownerId': ownerId,
        'name': name,
        'type': type.name,
        'status': status.name,
        'createdAt': createdAt.toIso8601String(),
        'panoramaPath': panoramaPath,
        'panoramaUrl': panoramaUrl,
        'framePaths': framePaths,
        'thumbnailPath': thumbnailPath,
        'shareCode': shareCode,
        'remoteTourId': remoteTourId,
        'remoteSceneId': remoteSceneId,
        'frameOrientations':
            frameOrientations.map((o) => o.toJson()).toList(),
      };

  /// Strict: a record that cannot be read as an asset throws
  /// [FormatException], and the repository quarantines it. An unknown status
  /// or type fails closed (never `ready`), and a missing `createdAt` is an
  /// error (never "now", which would reorder the list on every read).
  factory ScanAsset.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    if (id is! String || id.isEmpty) {
      throw const FormatException('asset: id is missing');
    }
    final ownerId = json['ownerId'];
    if (ownerId is! String || ownerId.isEmpty) {
      throw const FormatException('asset: ownerId is missing');
    }
    final status = AssetStatus.values.asNameMap()[json['status']];
    if (status == null) {
      throw FormatException('asset: unknown status ${json['status']}');
    }
    final type = AssetType.values.asNameMap()[json['type']];
    if (type == null) {
      throw FormatException('asset: unknown type ${json['type']}');
    }
    final createdAt = DateTime.tryParse(json['createdAt'] as String? ?? '');
    if (createdAt == null) {
      throw const FormatException('asset: createdAt is missing');
    }
    return ScanAsset(
      id: id,
      ownerId: ownerId,
      name: json['name'] as String? ?? 'Untitled',
      type: type,
      status: status,
      createdAt: createdAt,
      panoramaPath: json['panoramaPath'] as String?,
      panoramaUrl: json['panoramaUrl'] as String?,
      // A bad element rejects the record (the repository quarantines it): a
      // silently shortened list would re-stitch with frames missing or with
      // orientations out of step.
      framePaths: [
        for (final f in (json['framePaths'] as List? ?? const []))
          f is String
              ? f
              : throw const FormatException('asset: framePaths holds a non-string'),
      ],
      thumbnailPath: json['thumbnailPath'] as String?,
      shareCode: json['shareCode'] as String?,
      remoteTourId: json['remoteTourId'] as String?,
      remoteSceneId: json['remoteSceneId'] as String?,
      frameOrientations: [
        for (final o in (json['frameOrientations'] as List? ?? const []))
          o is Map
              ? FrameOrientation.fromJson(Map<String, dynamic>.from(o))
              : throw const FormatException(
                  'asset: frameOrientations holds a non-object'),
      ],
    );
  }
}

/// One room inside a multi-room tour. Each room has its own panorama and
/// hotspots that jump to other rooms.
class Room {
  final String id;
  final String assetId;
  final String name;
  final String? panoramaPath;
  final String? panoramaUrl;

  /// Backend Scene id once the room has been created remotely.
  final String? remoteSceneId;

  /// Upload pipeline state: `null` = not started, `'uploading'` while the
  /// stitch/upload pipeline runs, `'ready'` once the scene exists remotely,
  /// `'failed'` after a terminal stitch/upload failure (see [lastError]).
  /// The room list renders this instead of guessing from [remoteSceneId].
  final String? status;

  /// Human-readable reason when [status] is `'failed'`.
  final String? lastError;

  const Room({
    required this.id,
    required this.assetId,
    required this.name,
    this.panoramaPath,
    this.panoramaUrl,
    this.remoteSceneId,
    this.status,
    this.lastError,
  });

  Room copyWith({
    String? name,
    Object? panoramaPath = _sentinel,
    Object? panoramaUrl = _sentinel,
    Object? remoteSceneId = _sentinel,
    Object? status = _sentinel,
    Object? lastError = _sentinel,
  }) =>
      Room(
        id: id,
        assetId: assetId,
        name: name ?? this.name,
        panoramaPath: identical(panoramaPath, _sentinel)
            ? this.panoramaPath
            : panoramaPath as String?,
        panoramaUrl: identical(panoramaUrl, _sentinel)
            ? this.panoramaUrl
            : panoramaUrl as String?,
        remoteSceneId: identical(remoteSceneId, _sentinel)
            ? this.remoteSceneId
            : remoteSceneId as String?,
        status: identical(status, _sentinel) ? this.status : status as String?,
        lastError: identical(lastError, _sentinel)
            ? this.lastError
            : lastError as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'assetId': assetId,
        'name': name,
        'panoramaPath': panoramaPath,
        'panoramaUrl': panoramaUrl,
        'remoteSceneId': remoteSceneId,
        'status': status,
        'lastError': lastError,
      };

  /// Strict like [ScanAsset.fromJson]: a record with no id or asset id throws
  /// [FormatException] and is quarantined by the repository. A stored
  /// `hotspots` key from an older build is ignored.
  factory Room.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final assetId = json['assetId'];
    if (id is! String || id.isEmpty) {
      throw const FormatException('room: id is missing');
    }
    if (assetId is! String || assetId.isEmpty) {
      throw const FormatException('room: assetId is missing');
    }
    return Room(
      id: id,
      assetId: assetId,
      name: json['name'] as String? ?? 'Room',
      panoramaPath: json['panoramaPath'] as String?,
      panoramaUrl: json['panoramaUrl'] as String?,
      remoteSceneId: json['remoteSceneId'] as String?,
      status: json['status'] as String?,
      lastError: json['lastError'] as String?,
    );
  }
}

class ShareLink {
  final String code;
  final String assetId;
  final DateTime createdAt;

  const ShareLink({
    required this.code,
    required this.assetId,
    required this.createdAt,
  });

  /// Public viewer URL, e.g. https://api.360ghar.com/v/abc12 (OG page that
  /// redirects to the web viewer). Built from the tour's `short_code`; the
  /// backend sends no `share_url`.
  String get url => '${Env.apiRoot}/v/$code';

  Map<String, dynamic> toJson() => {
        'code': code,
        'assetId': assetId,
        'createdAt': createdAt.toIso8601String(),
      };

  factory ShareLink.fromJson(Map<String, dynamic> json) => ShareLink(
        code: json['code'] as String,
        assetId: json['assetId'] as String? ?? '',
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
      );
}

/// What the analytics screen shows for one tour.
class ViewAnalytics {
  final String tourId;
  final int views;
  final int totalSeconds;

  /// Clicks on hotspots inside the tour, summed over all hotspots. The backend
  /// has no "showing request" event: this is a click count and is labelled so.
  final int hotspotClicks;

  const ViewAnalytics({
    required this.tourId,
    this.views = 0,
    this.totalSeconds = 0,
    this.hotspotClicks = 0,
  });
}
