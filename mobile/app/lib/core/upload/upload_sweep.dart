import 'dart:io';

import '../api/backend_api.dart';
import '../models/models.dart';
import '../storage/local_store.dart';
import 'upload_queue.dart';

/// Whether [parse] reads [record] without throwing.
bool _reads(void Function(Map<String, dynamic> record) parse,
    Map<String, dynamic> record) {
  try {
    parse(record);
    return true;
  } on Object {
    return false;
  }
}

/// The recovery action for quarantined data. Nothing is thrown away when a
/// record or file cannot be read (see [LocalStore]); this gives it a way back.
/// A quarantined asset or room that the current parser reads is restored, and a
/// collection file set aside because it came from a newer app is merged back
/// once this build can read it. Data that is still unreadable stays quarantined.
/// Runs at start and after sign-in, ahead of the stuck-upload sweep, so a
/// restored asset is swept like any other.
Future<void> recoverQuarantined(LocalStore store) async {
  for (final collection in const ['assets', 'rooms', 'upload_queue']) {
    await store.restoreQuarantinedFiles(collection);
  }
  await store.restoreQuarantinedRecords(
      'assets', (r) => _reads(ScanAsset.fromJson, r));
  await store.restoreQuarantinedRecords(
      'rooms', (r) => _reads(Room.fromJson, r));
}

/// Reconciles uploads that a process kill left half-done. Run once at startup
/// and again after sign-in, for the signed-in account only.
///
/// The capture screen saves an asset or a room, then starts work in the
/// background. A kill between those two points leaves a record with no job to
/// finish it, and the list shows "Uploading…" forever. This sweep:
///
/// - gives an asset that was uploaded by an older build its main scene id
///   (from its finished job, or from the tour when no job is left);
/// - re-enqueues an asset still `stitching` or `pendingCloudStitch` that has a
///   panorama but no job, and marks one with no panorama `failed` (the detail
///   screen offers "Retry stitching & upload" from its raw frames);
/// - re-enqueues a room with no scene, a panorama and no live job, and marks a
///   room with no panorama `failed` with a message.
///
/// A record that is queued, parked or already failed is left alone: the queue
/// and the UI own it. Records that cannot be parsed are skipped here and
/// quarantined by the repository when the list loads.
///
/// First, it puts back what an earlier run quarantined and this build can read
/// ([recoverQuarantined]).
Future<void> sweepStuckUploads({
  required LocalStore store,
  required String ownerId,
  required UploadQueue queue,
  BackendApi? api,
}) async {
  await recoverQuarantined(store);
  final jobs = await store.readAll('upload_queue');
  final assets = <ScanAsset>[];
  for (final raw in await store.readAll('assets')) {
    if (raw['ownerId'] != ownerId) continue;
    try {
      assets.add(ScanAsset.fromJson(raw));
    } on Object {
      continue;
    }
  }
  final byId = <String, ScanAsset>{};

  for (var asset in assets) {
    final job = jobs
        .where((j) => j['assetId'] == asset.id && j['kind'] != 'room')
        .firstOrNull;

    if (asset.remoteTourId != null && asset.remoteSceneId == null) {
      var sceneId = job?['sceneId'] as String?;
      if (sceneId == null && (job == null || job['step'] == 'done')) {
        try {
          sceneId = (await api?.getTour(asset.remoteTourId!))?.mainSceneId;
        } on Object {
          // Offline or signed out: the next start tries again.
        }
      }
      if (sceneId != null) {
        asset = asset.copyWith(remoteSceneId: sceneId);
        await store.upsert('assets', asset.toJson());
      }
    }
    byId[asset.id] = asset;

    final running = asset.status == AssetStatus.stitching ||
        asset.status == AssetStatus.pendingCloudStitch;
    if (running && job == null) {
      final pano = asset.panoramaPath;
      if (pano != null && File(pano).existsSync()) {
        await queue.enqueue(asset);
      } else {
        await store.upsert(
            'assets', asset.copyWith(status: AssetStatus.failed).toJson());
      }
    }
  }

  for (final raw in await store.readAll('rooms')) {
    final asset = byId[raw['assetId']];
    if (asset == null) continue;
    final Room room;
    try {
      room = Room.fromJson(raw);
    } on Object {
      continue;
    }
    if (room.remoteSceneId != null || room.status == 'failed') continue;
    final job = jobs.where((j) => j['id'] == 'room-${room.id}').firstOrNull;
    if (job != null && job['step'] != 'done') continue; // queued or parked
    final pano = room.panoramaPath;
    if (pano != null && File(pano).existsSync()) {
      await queue.enqueueRoom(asset, room);
    } else {
      await store.upsert(
        'rooms',
        room
            .copyWith(
              status: 'failed',
              lastError: 'Stitching was interrupted. Delete this room and '
                  'capture it again.',
            )
            .toJson(),
      );
    }
  }

  await queue.pump();
}
