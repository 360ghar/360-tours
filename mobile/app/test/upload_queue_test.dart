import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/api/backend_api.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/storage/local_store.dart';
import 'package:tours360/core/upload/upload_queue.dart';

class _FakeApi extends BackendApi {
  _FakeApi() : super(Dio());

  final calls = <String>[];
  bool failPublishOnce = false;
  bool failWithAuth = false;
  bool failScene = false;

  @override
  Future<Map<String, dynamic>> createTour({
    required String title,
    String? description,
  }) async {
    if (failWithAuth) {
      throw DioException(
        requestOptions: RequestOptions(path: '/tours'),
        response: Response(
          requestOptions: RequestOptions(path: '/tours'),
          statusCode: 401,
        ),
      );
    }
    calls.add('createTour');
    return {'id': 'tour-1', 'title': title};
  }

  @override
  Future<Map<String, dynamic>> createPresignedUpload({
    required String filename,
    required String folderType,
    String? tourId,
    String? sceneId,
    int? fileSize,
  }) async {
    calls.add('presign');
    return {
      'upload_id': 'up-1',
      'signed_url': 'https://cloudinary.example/upload',
      'token': 'sig',
      'api_key': 'key',
      'timestamp': 1,
      'public_id': 'pid',
      'public_url': 'https://res.cloudinary.example/pano.jpg',
      'path': 'p',
    };
  }

  @override
  Future<void> uploadToCloudinary({
    required Map<String, dynamic> presigned,
    required File file,
  }) async {
    calls.add('putCloudinary');
  }

  @override
  Future<Map<String, dynamic>> confirmUpload(String uploadId) async {
    calls.add('confirm:$uploadId');
    return {'media': {}, 'message': 'ok'};
  }

  @override
  Future<Map<String, dynamic>> createScene({
    required String tourId,
    required String imageUrl,
    String? title,
    int? orderIndex,
  }) async {
    if (failScene) throw Exception('scene boom');
    calls.add('createScene:$tourId:$orderIndex');
    return {'id': 'scene-1', 'image_url': imageUrl};
  }

  @override
  Future<Map<String, dynamic>> publishTour(String tourId) async {
    if (failPublishOnce) {
      failPublishOnce = false;
      throw DioException(requestOptions: RequestOptions(path: '/publish'));
    }
    calls.add('publish:$tourId');
    return {'id': tourId, 'status': 'published', 'short_code': 'abc12'};
  }
}

void main() {
  late Directory dir;
  late LocalStore store;
  late _FakeApi api;
  late Map<String, ScanAsset> assets;
  late List<Room> rooms;
  late UploadQueue queue;

  ScanAsset makeAsset(String id, {String? panoPath, String? tourId}) =>
      ScanAsset(
        id: id,
        ownerId: 'u1',
        name: 'Room $id',
        status: AssetStatus.stitching,
        createdAt: DateTime(2026, 7, 23),
        panoramaPath: panoPath,
        remoteTourId: tourId,
      );

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('queue_test');
    store = LocalStore(dir);
    api = _FakeApi();
    assets = {};
    rooms = [];
    queue = UploadQueue(
      store,
      api,
      getAsset: (id) async => assets[id],
      saveAsset: (a) async => assets[a.id] = a,
      getRooms: (assetId) async =>
          rooms.where((r) => r.assetId == assetId).toList(),
      saveRoom: (r) async {
        rooms.removeWhere((x) => x.id == r.id);
        rooms.add(r);
      },
      connectivityChanges: const Stream.empty(),
    );
  });

  tearDown(() => dir.delete(recursive: true));

  Future<String> writePano() async {
    final f = File('${dir.path}/pano.jpg');
    await f.writeAsBytes([0xFF, 0xD8, 0xFF, 0xD9]);
    return f.path;
  }

  test('full pipeline runs in order and marks the asset ready', () async {
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano);
    await queue.enqueue(assets['a1']!);
    await queue.pump();

    expect(api.calls, [
      'createTour',
      'presign',
      'putCloudinary',
      'confirm:up-1',
      'createScene:tour-1:0',
      'publish:tour-1',
    ]);
    final done = assets['a1']!;
    expect(done.status, AssetStatus.ready);
    expect(done.remoteTourId, 'tour-1');
    expect(done.shareCode, 'abc12');
    expect(done.panoramaUrl, 'https://res.cloudinary.example/pano.jpg');
  });

  test('recovers from a failed step without duplicating earlier ones',
      () async {
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano);
    api.failPublishOnce = true;

    await queue.enqueue(assets['a1']!);
    await queue.pump(); // publish fails once, retry succeeds
    await queue.pump();

    expect(api.calls.where((c) => c == 'createTour').length, 1,
        reason: 'must not create a duplicate tour on retry');
    expect(api.calls.where((c) => c == 'presign').length, 1,
        reason: 'earlier steps must not repeat');
    expect(api.calls.where((c) => c.startsWith('publish')).length, 1);
    expect(assets['a1']!.status, AssetStatus.ready);
  });

  test('deleted asset drops its queued job', () async {
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano);
    await queue.enqueue(assets['a1']!);
    assets.remove('a1');
    await queue.pump();
    expect(api.calls, isEmpty);
  });

  test('room job waits for the tour, then uploads a scene', () async {
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano);
    rooms.add(Room(
        id: 'r1', assetId: 'a1', name: 'Kitchen', panoramaPath: pano));

    // Queue the room BEFORE the asset has a tour: it must not starve the
    // asset job that unblocks it.
    await queue.enqueueRoom(assets['a1']!, rooms.first);
    await queue.enqueue(assets['a1']!);
    await queue.pump();

    expect(api.calls, contains('createScene:tour-1:1'));
    expect(rooms.single.remoteSceneId, 'scene-1');
    expect(rooms.single.panoramaUrl, isNotNull);
    expect(rooms.single.status, 'ready');
  });

  test('a terminally failed room job marks the room failed with the error',
      () async {
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano, tourId: 'tour-1');
    rooms.add(Room(
        id: 'r1',
        assetId: 'a1',
        name: 'Kitchen',
        panoramaPath: pano,
        status: 'uploading'));
    api.failScene = true;
    await queue.enqueueRoom(assets['a1']!, rooms.first);
    for (var i = 0; i < 8; i++) {
      await queue.pump();
    }
    expect(rooms.single.status, 'failed');
    expect(rooms.single.lastError, contains('scene boom'));
    final job = (await store.readAll('upload_queue')).single;
    expect(job['step'], 'failed');
    expect(job['attempts'], 8);
  });

  test('resumes at presign when the persisted Cloudinary signature is stale',
      () async {
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano, tourId: 'tour-1');
    // Simulate a crash-restart: the job was persisted mid-pipeline at
    // putCloudinary with a 2-hour-old signature.
    await store.upsert('upload_queue', {
      'id': 'a1',
      'kind': 'asset',
      'assetId': 'a1',
      'step': 'putCloudinary',
      'attempts': 2,
      'lastStep': 'putCloudinary',
      'tourId': 'tour-1',
      'presigned': {
        'upload_id': 'up-old',
        'signed_url': 'https://cloudinary.example/old',
        'token': 'old-sig',
        'api_key': 'key',
        'timestamp': 1,
        'public_id': 'pid',
        'public_url': 'https://res.cloudinary.example/pano.jpg',
        'path': 'p',
      },
      'presignedAt': DateTime.now()
          .subtract(const Duration(hours: 2))
          .millisecondsSinceEpoch,
    });
    await queue.pump();

    expect(api.calls.first, 'presign',
        reason: 'stale signature must be re-issued before upload');
    expect(api.calls.where((c) => c == 'presign').length, 1);
    expect(api.calls.where((c) => c == 'createTour'), isEmpty);
    expect(assets['a1']!.status, AssetStatus.ready);
  });

  test('resumes at putCloudinary directly when the signature is fresh',
      () async {
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano, tourId: 'tour-1');
    await store.upsert('upload_queue', {
      'id': 'a1',
      'kind': 'asset',
      'assetId': 'a1',
      'step': 'putCloudinary',
      'attempts': 2,
      'lastStep': 'putCloudinary',
      'tourId': 'tour-1',
      'presigned': {
        'upload_id': 'up-1',
        'signed_url': 'https://cloudinary.example/upload',
        'token': 'sig',
        'api_key': 'key',
        'timestamp': 1,
        'public_id': 'pid',
        'public_url': 'https://res.cloudinary.example/pano.jpg',
        'path': 'p',
      },
      'presignedAt':
          DateTime.now().subtract(const Duration(minutes: 1)).millisecondsSinceEpoch,
    });
    await queue.pump();

    expect(api.calls.where((c) => c == 'presign'), isEmpty,
        reason: 'a fresh signature must not be re-issued');
    expect(api.calls.first, 'putCloudinary');
    expect(assets['a1']!.status, AssetStatus.ready);
  });

  test('enqueue with an existing tour resumes at presign, never re-creates it',
      () async {
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano, tourId: 'tour-1');
    await queue.enqueue(assets['a1']!);
    await queue.pump();
    expect(api.calls.where((c) => c == 'createTour'), isEmpty);
    expect(api.calls.first, 'presign');
    expect(assets['a1']!.status, AssetStatus.ready);
  });

  test('auth-expired failures hold the job instead of burning attempts',
      () async {
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano);
    api.failWithAuth = true;
    await queue.enqueue(assets['a1']!);
    await queue.pump();

    final held = (await store.readAll('upload_queue')).single;
    expect(held['step'], 'waiting-auth');
    expect(held['attempts'], 0,
        reason: 'auth holds must not consume retry attempts');
    expect(held['lastError'], contains('Session expired'));
    expect(assets['a1']!.status, AssetStatus.stitching);

    // Session restored: the next pump resumes the job to completion.
    api.failWithAuth = false;
    await queue.pump();
    expect(assets['a1']!.status, AssetStatus.ready);
  });

  test('an asset without a panorama fails with a readable message', () async {
    assets['a1'] = makeAsset('a1'); // no panorama path
    await queue.enqueue(assets['a1']!);
    for (var i = 0; i < 8; i++) {
      await queue.pump();
    }
    expect(assets['a1']!.status, AssetStatus.failed);
    final job = (await store.readAll('upload_queue')).single;
    expect(job['step'], 'failed');
    expect(job['lastError'], contains('panorama file is missing'));
    expect(job['lastError'], contains('re-capture'));
  });

  test('cloud re-stitch with missing frames fails the asset with a message',
      () async {
    final pano = await writePano();
    assets['a1'] = ScanAsset(
      id: 'a1',
      ownerId: 'u1',
      name: 'Room a1',
      status: AssetStatus.pendingCloudStitch,
      createdAt: DateTime(2026, 7, 23),
      panoramaPath: pano,
      framePaths: ['${dir.path}/gone_0.jpg', '${dir.path}/gone_1.jpg'],
    );
    await queue.enqueue(assets['a1']!);
    await queue.pump();

    expect(assets['a1']!.status, AssetStatus.failed,
        reason: 'missing frames must never silently claim readiness');
    final job = (await store.readAll('upload_queue')).single;
    expect(job['lastError'], contains('Only 0 of 2 frames uploaded'));
    expect(job['lastError'], contains('re-capture'));
  });

  test('cloud re-stitch with too few frames keeps ready and logs the reason',
      () async {
    final pano = await writePano();
    final frame = '${dir.path}/frame_0.jpg';
    await File(frame).writeAsBytes([0xFF, 0xD8, 0xFF, 0xD9]);
    assets['a1'] = ScanAsset(
      id: 'a1',
      ownerId: 'u1',
      name: 'Room a1',
      status: AssetStatus.pendingCloudStitch,
      createdAt: DateTime(2026, 7, 23),
      panoramaPath: pano,
      framePaths: [frame],
    );
    await queue.enqueue(assets['a1']!);
    await queue.pump();

    expect(assets['a1']!.status, AssetStatus.ready,
        reason: 'no frames were lost, so the naive pano stands');
    final job = (await store.readAll('upload_queue')).single;
    expect(job['lastError'], contains('fewer than 2 frames'));
  });

  test('watchJob emits the job map for the asset', () async {
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano);
    final seen = <Map<String, dynamic>?>[];
    final sub = queue.watchJob('a1').listen(seen.add);
    await queue.enqueue(assets['a1']!);
    await queue.pump();
    await Future<void>.delayed(const Duration(milliseconds: 10));
    expect(seen, isNotEmpty);
    expect(seen.last?['assetId'], 'a1');
    expect(seen.last?['step'], 'done');
    await sub.cancel();
  });
}
