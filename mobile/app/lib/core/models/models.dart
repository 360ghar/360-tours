// Shared domain models for 360 Tours. Single file on purpose — this is the
// contract every feature codes against. Plain immutable classes, JSON maps.

import '../env.dart';

/// Sentinel used by `copyWith` so nullable fields can be reset to `null`
/// (distinguishing "not passed" from "explicitly null").
const _sentinel = Object();

enum AssetType { pano360, model3d, lidar }

/// Device orientation recorded with each captured frame (degrees). Feeds the
/// fallback stitchers and cloud re-stitch.
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
  processing3d,
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
/// multi-room tour (rooms) and a 3D world (model3d).
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

  /// Local paths of the raw captured frames (kept for cloud re-stitch / 3D).
  final List<String> framePaths;

  final String? thumbnailPath;
  final String? shareCode;
  final String? model3dUrl;

  /// Backend Tour id once the asset has been created remotely.
  final String? remoteTourId;

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
    this.model3dUrl,
    this.remoteTourId,
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
    Object? model3dUrl = _sentinel,
    Object? remoteTourId = _sentinel,
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
        model3dUrl: identical(model3dUrl, _sentinel)
            ? this.model3dUrl
            : model3dUrl as String?,
        remoteTourId: identical(remoteTourId, _sentinel)
            ? this.remoteTourId
            : remoteTourId as String?,
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
        'model3dUrl': model3dUrl,
        'remoteTourId': remoteTourId,
        'frameOrientations':
            frameOrientations.map((o) => o.toJson()).toList(),
      };

  factory ScanAsset.fromJson(Map<String, dynamic> json) => ScanAsset(
        id: json['id'] as String,
        ownerId: json['ownerId'] as String? ?? '',
        name: json['name'] as String? ?? 'Untitled',
        type: AssetType.values.asNameMap()[json['type']] ?? AssetType.pano360,
        status: AssetStatus.values.asNameMap()[json['status']] ??
            AssetStatus.ready,
        createdAt:
            DateTime.tryParse(json['createdAt'] as String? ?? '') ??
                DateTime.now(),
        panoramaPath: json['panoramaPath'] as String?,
        panoramaUrl: json['panoramaUrl'] as String?,
        framePaths:
            (json['framePaths'] as List?)?.cast<String>() ?? const [],
        thumbnailPath: json['thumbnailPath'] as String?,
        shareCode: json['shareCode'] as String?,
        model3dUrl: json['model3dUrl'] as String?,
        remoteTourId: json['remoteTourId'] as String?,
        frameOrientations: (json['frameOrientations'] as List?)
                ?.map((o) =>
                    FrameOrientation.fromJson(Map<String, dynamic>.from(o)))
                .toList() ??
            const [],
      );
}

/// One room inside a multi-room tour. Each room has its own panorama and
/// hotspots that jump to other rooms.
class Room {
  final String id;
  final String assetId;
  final String name;
  final String? panoramaPath;
  final String? panoramaUrl;
  final List<Hotspot> hotspots;

  /// Backend Scene id once the room has been created remotely.
  final String? remoteSceneId;

  const Room({
    required this.id,
    required this.assetId,
    required this.name,
    this.panoramaPath,
    this.panoramaUrl,
    this.hotspots = const [],
    this.remoteSceneId,
  });

  Room copyWith({
    String? name,
    Object? panoramaPath = _sentinel,
    Object? panoramaUrl = _sentinel,
    List<Hotspot>? hotspots,
    Object? remoteSceneId = _sentinel,
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
        hotspots: hotspots ?? this.hotspots,
        remoteSceneId: identical(remoteSceneId, _sentinel)
            ? this.remoteSceneId
            : remoteSceneId as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'assetId': assetId,
        'name': name,
        'panoramaPath': panoramaPath,
        'panoramaUrl': panoramaUrl,
        'hotspots': hotspots.map((h) => h.toJson()).toList(),
        'remoteSceneId': remoteSceneId,
      };

  factory Room.fromJson(Map<String, dynamic> json) => Room(
        id: json['id'] as String,
        assetId: json['assetId'] as String? ?? '',
        name: json['name'] as String? ?? 'Room',
        panoramaPath: json['panoramaPath'] as String?,
        panoramaUrl: json['panoramaUrl'] as String?,
        hotspots: (json['hotspots'] as List?)
                ?.map((h) => Hotspot.fromJson(Map<String, dynamic>.from(h)))
                .toList() ??
            const [],
        remoteSceneId: json['remoteSceneId'] as String?,
      );
}

/// A clickable marker placed on a room's panorama at (yaw, pitch) degrees
/// that navigates to another room.
class Hotspot {
  final String id;
  final String targetRoomId;
  final String label;
  final double yawDeg;
  final double pitchDeg;

  /// Backend Hotspot id once created remotely.
  final String? remoteId;

  const Hotspot({
    required this.id,
    required this.targetRoomId,
    required this.label,
    required this.yawDeg,
    required this.pitchDeg,
    this.remoteId,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'targetRoomId': targetRoomId,
        'label': label,
        'yawDeg': yawDeg,
        'pitchDeg': pitchDeg,
        'remoteId': remoteId,
      };

  factory Hotspot.fromJson(Map<String, dynamic> json) => Hotspot(
        id: json['id'] as String,
        targetRoomId: json['targetRoomId'] as String? ?? '',
        label: json['label'] as String? ?? '',
        yawDeg: (json['yawDeg'] as num?)?.toDouble() ?? 0,
        pitchDeg: (json['pitchDeg'] as num?)?.toDouble() ?? 0,
        remoteId: json['remoteId'] as String?,
      );
}

class ShareLink {
  final String code;
  final String assetId;
  final DateTime createdAt;

  /// When set (e.g. no short_code from backend), used instead of the
  /// code-derived short-link URL.
  final String? overrideUrl;

  const ShareLink({
    required this.code,
    required this.assetId,
    required this.createdAt,
    this.overrideUrl,
  });

  /// Public viewer URL, e.g. https://api.360ghar.com/v/abc12 (OG page that
  /// redirects to the web viewer).
  String get url => overrideUrl ?? '${Env.apiRoot}/v/$code';

  String get embedCode =>
      '<iframe src="$url?embed=1" width="800" height="450" '
      'frameborder="0" allowfullscreen></iframe>';

  Map<String, dynamic> toJson() => {
        'code': code,
        'assetId': assetId,
        'createdAt': createdAt.toIso8601String(),
        'overrideUrl': overrideUrl,
      };

  factory ShareLink.fromJson(Map<String, dynamic> json) => ShareLink(
        code: json['code'] as String,
        assetId: json['assetId'] as String? ?? '',
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
        overrideUrl: json['overrideUrl'] as String?,
      );
}

class ViewAnalytics {
  final String assetId;
  final int views;
  final int totalSeconds;
  final int showingRequests;
  final DateTime? lastViewedAt;

  const ViewAnalytics({
    required this.assetId,
    this.views = 0,
    this.totalSeconds = 0,
    this.showingRequests = 0,
    this.lastViewedAt,
  });

  Map<String, dynamic> toJson() => {
        'assetId': assetId,
        'views': views,
        'totalSeconds': totalSeconds,
        'showingRequests': showingRequests,
        'lastViewedAt': lastViewedAt?.toIso8601String(),
      };

  factory ViewAnalytics.fromJson(Map<String, dynamic> json) => ViewAnalytics(
        assetId: json['assetId'] as String? ?? '',
        views: (json['views'] as num?)?.toInt() ?? 0,
        totalSeconds: (json['totalSeconds'] as num?)?.toInt() ?? 0,
        showingRequests: (json['showingRequests'] as num?)?.toInt() ?? 0,
        lastViewedAt:
            DateTime.tryParse(json['lastViewedAt'] as String? ?? ''),
      );
}
