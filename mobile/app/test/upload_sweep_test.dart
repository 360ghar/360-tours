import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/models/api_dtos.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/storage/local_store.dart';
import 'package:tours360/core/upload/upload_queue.dart';
import 'package:tours360/core/upload/upload_sweep.dart';
import 'package:tours360/features/assets/data/local_asset_repository.dart';

import 'fakes.dart';

void main() {
  late Directory dir;
  late LocalStore store;
  late FakeBackendApi api;
  late LocalAssetRepository repo;
  late UploadQueue queue;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('sweep_test');
    store = LocalStore(dir);
    api = FakeBackendApi();
    queue = UploadQueue(
      store,
      api,
      getAsset: (id) => repo.getAsset(id),
      saveAsset: (a) => repo.saveAsset(a),
      getRooms: (assetId) => repo.getRooms(assetId),
      saveRoom: (r) => repo.saveRoom(r),
      connectivityChanges: const Stream.empty(),
    );
    repo = LocalAssetRepository(store,
        enqueue: queue.enqueue, enqueueRoom: queue.enqueueRoom);
  });

  tearDown(() => dir.delete(recursive: true));

  String writeFile(String name) {
    final f = File('${dir.path}/$name')
      ..writeAsBytesSync([0xFF, 0xD8, 0xFF, 0xD9]);
    return f.path;
  }

  ScanAsset asset(
    String id, {
    String owner = 'u1',
    AssetStatus status = AssetStatus.stitching,
    String? pano,
    String? tourId,
    String? sceneId,
  }) =>
      ScanAsset(
        id: id,
        ownerId: owner,
        name: 'Scan $id',
        status: status,
        createdAt: DateTime(2026, 7, 23),
        panoramaPath: pano,
        remoteTourId: tourId,
        remoteSceneId: sceneId,
      );

  Future<void> sweep({FakeBackendApi? withApi}) => sweepStuckUploads(
      store: store, ownerId: 'u1', queue: queue, api: withApi);

  group('quarantined data', () {
    Future<void> hold(String collection, Map<String, dynamic> record) =>
        store.quarantineRecord(collection, record, 'older build');

    test('an asset the parser reads now is restored and swept', () async {
      final json = asset('a1', pano: writeFile('pano.jpg')).toJson();
      await hold('assets', json);
      expect(await store.readAll('assets'), isEmpty);

      await sweep();

      expect((await repo.getAsset('a1'))!.status, AssetStatus.ready);
      expect(await store.readAll('assets_quarantine'), isEmpty);
    });

    test('an asset that is still unreadable stays quarantined', () async {
      final json = asset('a1').toJson()..['status'] = 'processing3d';
      await hold('assets', json);

      await sweep();

      expect(await store.readAll('assets'), isEmpty);
      expect(await store.readAll('assets_quarantine'), hasLength(1));
    });

    test('a room the parser reads now is restored', () async {
      await repo.saveAsset(asset('a1',
          status: AssetStatus.ready, tourId: 't', sceneId: 's'));
      await hold('rooms', const Room(
              id: 'r1', assetId: 'a1', name: 'Kitchen', remoteSceneId: 'sc')
          .toJson());

      await sweep();

      expect((await repo.getRooms('a1')).single.id, 'r1');
    });
  });

  group('assets', () {
    test('an asset that was stitched but never queued is uploaded', () async {
      await repo.saveAsset(asset('a1', pano: writeFile('pano.jpg')));
      await sweep();
      expect((await repo.getAsset('a1'))!.status, AssetStatus.ready);
      expect(api.calls, contains('createTour'));
    });

    test('an asset killed during stitching is marked failed, not stuck',
        () async {
      await repo.saveAsset(asset('a1')); // no panorama
      await sweep();
      expect((await repo.getAsset('a1'))!.status, AssetStatus.failed);
      expect(api.calls, isEmpty);
    });

    test('an asset that already has a job is left to the queue', () async {
      await repo.saveAsset(asset('a1', pano: writeFile('pano.jpg')));
      await store.upsert('upload_queue', {
        'id': 'a1',
        'kind': 'asset',
        'assetId': 'a1',
        'step': 'failed',
        'lastStep': 'presign',
        'attempts': 8,
      });
      await sweep();
      expect(api.calls, isEmpty);
      expect((await store.readAll('upload_queue')).single['step'], 'failed');
    });

    test('a stitching asset whose job already failed is marked failed', () async {
      await repo.saveAsset(asset('a1', pano: writeFile('pano.jpg')));
      await store.upsert('upload_queue', {
        'id': 'a1',
        'kind': 'asset',
        'assetId': 'a1',
        'step': 'failed',
        'attempts': 8,
      });
      await sweep();
      expect((await repo.getAsset('a1'))!.status, AssetStatus.failed);
    });

    test('a room whose job already failed is marked failed with the reason',
        () async {
      await repo.saveAsset(asset('a1',
          status: AssetStatus.ready, tourId: 't', sceneId: 's'));
      await repo.saveRoom(Room(
          id: 'r1',
          assetId: 'a1',
          name: 'Kitchen',
          panoramaPath: writeFile('room.jpg'),
          status: 'uploading'));
      await store.upsert('upload_queue', {
        'id': 'room-r1',
        'kind': 'room',
        'assetId': 'a1',
        'roomId': 'r1',
        'step': 'failed',
        'lastError': 'The server said no',
      });
      await sweep();
      final room = (await repo.getRooms('a1')).single;
      expect(room.status, 'failed');
      expect(room.lastError, 'The server said no');
    });

    test('a ready or failed asset is not touched', () async {
      await repo.saveAsset(asset('r', status: AssetStatus.ready));
      await repo.saveAsset(asset('f', status: AssetStatus.failed));
      await sweep();
      expect((await repo.getAsset('r'))!.status, AssetStatus.ready);
      expect((await repo.getAsset('f'))!.status, AssetStatus.failed);
      expect(api.calls, isEmpty);
    });

    test('another account\'s assets are never touched', () async {
      await repo.saveAsset(asset('theirs', owner: 'u2'));
      await sweep();
      expect((await repo.getAsset('theirs'))!.status, AssetStatus.stitching);
    });
  });

  group('main scene id for assets from an older build', () {
    test('is taken from the finished job', () async {
      await repo.saveAsset(
          asset('a1', status: AssetStatus.ready, tourId: 'tour-1'));
      await store.upsert('upload_queue', {
        'id': 'a1',
        'kind': 'asset',
        'assetId': 'a1',
        'step': 'done',
        'tourId': 'tour-1',
        'sceneId': 'scene-5',
      });
      await sweep();
      expect((await repo.getAsset('a1'))!.remoteSceneId, 'scene-5');
    });

    test('is read from the tour when no job is left', () async {
      api.tourScenes.add(const SceneDto(
        id: 'scene-main',
        tourId: 'tour-1',
        title: null,
        imageUrl: 'https://res.cloudinary.example/p',
        orderIndex: 0,
      ));
      await repo.saveAsset(
          asset('a1', status: AssetStatus.ready, tourId: 'tour-1'));
      await sweep(withApi: api);
      expect((await repo.getAsset('a1'))!.remoteSceneId, 'scene-main');
    });

    test('stays empty offline and is tried again next start', () async {
      await repo.saveAsset(
          asset('a1', status: AssetStatus.ready, tourId: 'tour-1'));
      await sweep(); // no api
      expect((await repo.getAsset('a1'))!.remoteSceneId, isNull);
    });
  });

  group('rooms', () {
    Future<void> asset1() => repo.saveAsset(asset('a1',
        status: AssetStatus.ready, tourId: 'tour-1', sceneId: 'scene-0'));

    test('a stitched room with no job is uploaded', () async {
      await asset1();
      await repo.saveRoom(Room(
          id: 'r1',
          assetId: 'a1',
          name: 'Kitchen',
          panoramaPath: writeFile('room.jpg'),
          status: 'ready'));
      await sweep();
      final room = (await repo.getRooms('a1')).single;
      expect(room.remoteSceneId, isNotNull);
      expect(room.status, 'ready');
    });

    test('a room killed while uploading, with a panorama, is re-queued',
        () async {
      await asset1();
      await repo.saveRoom(Room(
          id: 'r1',
          assetId: 'a1',
          name: 'Kitchen',
          panoramaPath: writeFile('room.jpg'),
          status: 'uploading'));
      await sweep();
      expect((await repo.getRooms('a1')).single.remoteSceneId, isNotNull);
    });

    test('a room killed during stitching is failed with a message', () async {
      await asset1();
      await repo.saveRoom(const Room(
          id: 'r1', assetId: 'a1', name: 'Kitchen', status: 'uploading'));
      await sweep();
      final room = (await repo.getRooms('a1')).single;
      expect(room.status, 'failed');
      expect(room.lastError, contains('interrupted'));
      expect(api.calls, isEmpty);
    });

    test('a room that is queued, failed or already uploaded is left alone',
        () async {
      await asset1();
      await repo.saveRoom(const Room(
          id: 'failed', assetId: 'a1', name: 'A', status: 'failed'));
      await repo.saveRoom(const Room(
          id: 'done',
          assetId: 'a1',
          name: 'B',
          status: 'ready',
          remoteSceneId: 'scene-b'));
      await sweep();
      expect(api.calls, isEmpty);
    });

    test('rooms of another account\'s asset are not touched', () async {
      await repo.saveAsset(asset('x', owner: 'u2', tourId: 't', sceneId: 's'));
      await repo.saveRoom(const Room(
          id: 'r9', assetId: 'x', name: 'Theirs', status: 'uploading'));
      await sweep();
      expect((await repo.getRooms('x')).single.status, 'uploading');
    });
  });
}
