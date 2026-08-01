import 'dart:io';

import '../../../core/models/models.dart';
import '../../../core/repositories/repositories.dart';
import '../../../core/storage/local_store.dart';

typedef EnqueueUpload = Future<void> Function(ScanAsset asset);
typedef RemoteDelete = Future<void> Function(ScanAsset asset);
typedef RemoteDeleteScene = Future<void> Function(String sceneId);
typedef EnqueueRoomUpload = Future<void> Function(ScanAsset asset, Room room);

/// Upload-queue record for a room job, surfaced so the UI can show real
/// per-room progress/failure instead of an eternal "Uploading…". Until the
/// Room model carries its own status field (W3e), the queue record is the
/// source of truth for failed rooms.
class RoomUploadJob {
  const RoomUploadJob({
    required this.roomId,
    required this.step,
    this.lastError,
  });

  final String roomId;

  /// Queue step: 'presign'…'done' or 'failed'.
  final String step;
  final String? lastError;

  bool get failed => step == 'failed';
  bool get done => step == 'done';

  factory RoomUploadJob.fromJson(Map<String, dynamic> json) => RoomUploadJob(
        roomId: json['roomId'] as String? ?? '',
        step: json['step'] as String? ?? '',
        lastError: json['lastError'] as String?,
      );
}

/// Persisted 3D-generation job state for an asset (job id + status), so a
/// killed app resumes polling instead of starting a duplicate backend job.
class PersistedAiJob {
  const PersistedAiJob({
    required this.jobId,
    required this.status,
    this.progress = 0,
    this.error,
  });

  final String jobId;

  /// 'running' | 'completed' | 'failed'
  final String status;
  final int progress;
  final String? error;

  Map<String, dynamic> toJson() => {
        'jobId': jobId,
        'status': status,
        'progress': progress,
        'error': error,
      };

  factory PersistedAiJob.fromJson(Map<String, dynamic> json) => PersistedAiJob(
        jobId: json['jobId'] as String? ?? '',
        status: json['status'] as String? ?? 'running',
        progress: (json['progress'] as num?)?.toInt() ?? 0,
        error: json['error'] as String?,
      );
}

/// Local-first asset repository over [LocalStore]. Uploads are delegated to
/// the upload queue; remote deletion is best-effort.
class LocalAssetRepository implements AssetRepository {
  LocalAssetRepository(
    this._store, {
    this._enqueue,
    this._enqueueRoom,
    this._remoteDelete,
    this._remoteDeleteScene,
  });

  static const _assets = 'assets';
  static const _rooms = 'rooms';
  // Collection owned by UploadQueue; cleaned here so a deleted asset's
  // in-flight job does not linger and read now-deleted files.
  static const _uploadQueue = 'upload_queue';
  // 3D-generation job state keyed by asset id (see PersistedAiJob).
  static const _aiJobs = 'ai_jobs';

  final LocalStore _store;
  final EnqueueUpload? _enqueue;
  final EnqueueRoomUpload? _enqueueRoom;
  final RemoteDelete? _remoteDelete;
  final RemoteDeleteScene? _remoteDeleteScene;

  @override
  Stream<List<ScanAsset>> watchAssets(String ownerId) =>
      _store.watch(_assets).map((items) => items
          .map(ScanAsset.fromJson)
          .where((a) => a.ownerId == ownerId)
          .toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt)));

  @override
  Future<ScanAsset?> getAsset(String id) async {
    final items = await _store.readAll(_assets);
    final json = items.where((e) => e['id'] == id).firstOrNull;
    return json == null ? null : ScanAsset.fromJson(json);
  }

  @override
  Future<void> saveAsset(ScanAsset asset) =>
      _store.upsert(_assets, asset.toJson());

  @override
  Future<void> deleteAsset(String id) async {
    final asset = await getAsset(id);
    await _store.delete(_assets, id);
    // Drop this asset's upload jobs BEFORE deleting local files, so the queue
    // stops reading them. A job mid-read may already be in flight, but no
    // future pump will pick it up again.
    final jobs = await _store.readAll(_uploadQueue);
    final remaining = jobs.where((j) => j['assetId'] != id).toList();
    if (remaining.length != jobs.length) {
      await _store.writeAll(_uploadQueue, remaining);
    }
    // Drop this asset's rooms too.
    final rooms = await _store.readAll(_rooms);
    for (final r in rooms.where((e) => e['assetId'] == id).toList()) {
      await _store.delete(_rooms, r['id'] as String);
    }
    await _store.delete(_aiJobs, id);
    if (asset == null) return;
    // Best-effort local file + remote cleanup; never block the UI on it.
    for (final path in [
      asset.panoramaPath,
      asset.thumbnailPath,
      ...asset.framePaths,
    ]) {
      if (path != null) {
        try {
          await File(path).delete();
        } on FileSystemException {
          // already gone
        }
      }
    }
    if (asset.remoteTourId != null && _remoteDelete != null) {
      try {
        await _remoteDelete(asset);
      } catch (_) {
        // ponytail: best-effort — orphaned remote tours can be cleaned later.
      }
    }
  }

  @override
  Future<List<Room>> getRooms(String assetId) async {
    final items = await _store.readAll(_rooms);
    return items
        .where((e) => e['assetId'] == assetId)
        .map(Room.fromJson)
        .toList();
  }

  @override
  Stream<List<Room>> watchRooms(String assetId) =>
      _store.watch(_rooms).map((items) => items
          .where((e) => e['assetId'] == assetId)
          .map(Room.fromJson)
          .toList());

  @override
  Future<void> saveRoom(Room room) => _store.upsert(_rooms, room.toJson());

  @override
  Future<void> deleteRoom(String assetId, String roomId) async {
    final rooms = await getRooms(assetId);
    final room = rooms.where((r) => r.id == roomId).firstOrNull;
    await _store.delete(_rooms, roomId);
    if (room?.panoramaPath != null) {
      try {
        await File(room!.panoramaPath!).delete();
      } catch (_) {
        // best-effort local cleanup
      }
    }
    final sceneId = room?.remoteSceneId;
    if (sceneId != null && _remoteDeleteScene != null) {
      try {
        await _remoteDeleteScene(sceneId);
      } catch (_) {
        // ponytail: best-effort — orphaned remote scenes can be cleaned later.
      }
    }
  }

  @override
  Future<void> enqueueUpload(ScanAsset asset) async {
    if (_enqueue == null) return;
    await _enqueue(asset);
  }

  // ---- Room upload jobs ----------------------------------------------------

  /// Watch queue records for this asset's room jobs. A room whose record
  /// reaches `failed` is terminally failed (the queue gives up after 8
  /// attempts) — surfaces the forever-"Uploading…" state as a real failure.
  Stream<List<RoomUploadJob>> watchRoomUploadJobs(String assetId) =>
      _store.watch(_uploadQueue).map((jobs) => jobs
          .where((j) => j['kind'] == 'room' && j['assetId'] == assetId)
          .map(RoomUploadJob.fromJson)
          .toList());

  /// Re-enqueue a room's upload: resets its queue job to a fresh `presign`
  /// (the existing tour is reused — the room job never recreates it) and
  /// re-pumps the queue. Safe to call for rooms that are not failed (the
  /// queue upserts the same job id and keeps a single record).
  Future<void> retryRoomUpload(String assetId, String roomId) async {
    final enqueueRoom = _enqueueRoom;
    if (enqueueRoom == null) return;
    final asset = await getAsset(assetId);
    if (asset == null) return;
    final rooms = await getRooms(assetId);
    final room = rooms.where((r) => r.id == roomId).firstOrNull;
    if (room == null) return;
    await enqueueRoom(asset, room);
  }

  // ---- 3D-generation job persistence ---------------------------------------

  Future<void> save3dJob({
    required String assetId,
    required PersistedAiJob job,
  }) =>
      _store.upsert(_aiJobs, {'id': assetId, ...job.toJson()});

  Future<PersistedAiJob?> get3dJob(String assetId) async {
    final items = await _store.readAll(_aiJobs);
    final json = items.where((e) => e['id'] == assetId).firstOrNull;
    return json == null ? null : PersistedAiJob.fromJson(json);
  }

  Future<void> clear3dJob(String assetId) => _store.delete(_aiJobs, assetId);
}
