import 'dart:io';

import '../../../core/api/api_exception.dart';
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

  /// The queue parked this job because the session expired. Not a failure —
  /// it resumes after sign-in — but it must be visible, or the row reads
  /// "Uploading…" indefinitely with no way out.
  bool get waitingForAuth => step == 'waiting-auth';

  factory RoomUploadJob.fromJson(Map<String, dynamic> json) => RoomUploadJob(
        roomId: json['roomId'] as String? ?? '',
        step: json['step'] as String? ?? '',
        lastError: json['lastError'] as String?,
      );
}

/// Local-first asset repository over [LocalStore]. Uploads are delegated to
/// the upload queue; remote deletion of a tour is best-effort, remote deletion
/// of a scene is not (see [deleteRoom]).
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

  final LocalStore _store;
  final EnqueueUpload? _enqueue;
  final EnqueueRoomUpload? _enqueueRoom;
  final RemoteDelete? _remoteDelete;
  final RemoteDeleteScene? _remoteDeleteScene;

  /// Assets of [ownerId] only. The owner is checked on the raw record before
  /// anything is parsed, so another account's data is never read. A record that
  /// cannot be parsed is quarantined and the rest of the list still loads.
  @override
  Stream<List<ScanAsset>> watchAssets(String ownerId) => _store
      .watch(_assets)
      .asyncMap((items) => _ownedAssets(items, ownerId));

  Future<List<ScanAsset>> _ownedAssets(
      List<Map<String, dynamic>> items, String ownerId) async {
    final out = <ScanAsset>[];
    for (final raw in List.of(items)) {
      final owner = raw['ownerId'];
      if (owner is String && owner.isNotEmpty && owner != ownerId) continue;
      final asset = await _parseAsset(raw);
      if (asset != null && asset.ownerId == ownerId) out.add(asset);
    }
    return out..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  Future<ScanAsset?> _parseAsset(Map<String, dynamic> raw) async {
    try {
      return ScanAsset.fromJson(raw);
    } on Object catch (e) {
      await _store.quarantineRecord(_assets, raw, e);
      return null;
    }
  }

  Future<Room?> _parseRoom(Map<String, dynamic> raw) async {
    try {
      return Room.fromJson(raw);
    } on Object catch (e) {
      await _store.quarantineRecord(_rooms, raw, e);
      return null;
    }
  }

  @override
  Future<ScanAsset?> getAsset(String id) async {
    final items = await _store.readAll(_assets);
    final json = items.where((e) => e['id'] == id).firstOrNull;
    return json == null ? null : _parseAsset(json);
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
  Future<List<Room>> getRooms(String assetId) async =>
      _roomsOf(await _store.readAll(_rooms), assetId);

  @override
  Stream<List<Room>> watchRooms(String assetId) => _store
      .watch(_rooms)
      .asyncMap((items) => _roomsOf(items, assetId));

  Future<List<Room>> _roomsOf(
      List<Map<String, dynamic>> items, String assetId) async {
    final out = <Room>[];
    for (final raw in items.where((e) => e['assetId'] == assetId).toList()) {
      final room = await _parseRoom(raw);
      if (room != null) out.add(room);
    }
    return out;
  }

  @override
  Future<void> saveRoom(Room room) => _store.upsert(_rooms, room.toJson());

  /// Deletes the scene on the server first, then the local room. A failed
  /// remote delete throws (the room stays, so the user is not told it is gone
  /// while the tour still shows it). A 404 means the scene is already gone.
  /// The server removes the hotspots that pointed at the scene; the hotspot
  /// editor reads the list fresh each time it opens.
  @override
  Future<void> deleteRoom(String assetId, String roomId) async {
    final rooms = await getRooms(assetId);
    final room = rooms.where((r) => r.id == roomId).firstOrNull;
    final sceneId = room?.remoteSceneId;
    final deleteScene = _remoteDeleteScene;
    if (sceneId != null && deleteScene != null) {
      try {
        await deleteScene(sceneId);
      } on ApiException catch (e) {
        if (e.statusCode != 404) rethrow;
      }
    }
    await _store.delete(_rooms, roomId);
    if (room?.panoramaPath != null) {
      try {
        await File(room!.panoramaPath!).delete();
      } catch (_) {
        // best-effort local cleanup
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
  ///
  /// Returns false when nothing was queued: a room that failed before it had a
  /// stitched panorama has nothing to upload, so the caller must tell the user
  /// to delete it and capture it again.
  Future<bool> retryRoomUpload(String assetId, String roomId) async {
    final enqueueRoom = _enqueueRoom;
    if (enqueueRoom == null) return false;
    final asset = await getAsset(assetId);
    if (asset == null) return false;
    final rooms = await getRooms(assetId);
    final room = rooms.where((r) => r.id == roomId).firstOrNull;
    if (room == null || room.panoramaPath == null) return false;
    await enqueueRoom(asset, room);
    return true;
  }

}
