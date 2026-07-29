import 'dart:io';

import '../../../core/models/models.dart';
import '../../../core/repositories/repositories.dart';
import '../../../core/storage/local_store.dart';

typedef EnqueueUpload = Future<void> Function(ScanAsset asset);
typedef RemoteDelete = Future<void> Function(ScanAsset asset);
typedef RemoteDeleteScene = Future<void> Function(String sceneId);

/// Local-first asset repository over [LocalStore]. Uploads are delegated to
/// the upload queue; remote deletion is best-effort.
class LocalAssetRepository implements AssetRepository {
  LocalAssetRepository(
    this._store, {
    this._enqueue,
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
}
