import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/api/api_exception.dart';
import 'package:tours360/core/models/api_dtos.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/models/wire_enums.dart';
import 'package:tours360/core/storage/local_store.dart';
import 'package:tours360/core/upload/upload_queue.dart';

import 'fakes.dart';

void main() {
  late Directory dir;
  late LocalStore store;
  late FakeBackendApi api;
  late Map<String, ScanAsset> assets;
  late List<Room> rooms;
  late UploadQueue queue;
  late bool saveAssetThrowsOnce;

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
    api = FakeBackendApi();
    assets = {};
    rooms = [];
    saveAssetThrowsOnce = false;
    queue = UploadQueue(
      store,
      api,
      getAsset: (id) async => assets[id],
      saveAsset: (a) async {
        if (saveAssetThrowsOnce) {
          saveAssetThrowsOnce = false;
          throw StateError('asset store unavailable');
        }
        assets[a.id] = a;
      },
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
      'createScene:tour-1',
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

    // The main scene is created first, so the server orders it first.
    expect(api.calls.where((c) => c.startsWith('createScene')).length, 2);
    expect(assets['a1']!.remoteSceneId, 'scene-1');
    expect(rooms.single.remoteSceneId, 'scene-2');
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
        'signature': 'old-sig',
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
    // The backend folder enum has tour_original. The old 'tour' value returns 422.
    expect(api.folderTypes, everyElement(StorageFolderType.tourOriginal));
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
        'signature': 'sig',
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

  test('a permanently expired session eventually fails the job', () async {
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano);
    api.failWithAuth = true; // never recovers
    await queue.enqueue(assets['a1']!);

    // Every pump releases the held job, it 401s again and is re-held. Without
    // a bound on the holds this loops forever and the UI is stuck on
    // "Uploading…" with no retry, no delete and no error.
    for (var i = 0; i < 10; i++) {
      await queue.pump();
    }

    final job = (await store.readAll('upload_queue')).single;
    expect(job['step'], 'failed');
    expect(job['lastError'], contains('Session expired'));
    expect(assets['a1']!.status, AssetStatus.failed);
  });

  test('a failure after createTour never creates a second tour', () async {
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano);
    // POST /tours succeeds, then persisting the id throws — the job is left on
    // the createTour step with its tourId already recorded.
    saveAssetThrowsOnce = true;

    await queue.enqueue(assets['a1']!);
    await queue.pump(); // createTour succeeds, save throws → backoff
    await queue.pump(); // retry must resume at presign, not re-create

    expect(api.calls.where((c) => c == 'createTour').length, 1,
        reason: 'the backoff retry must not POST /tours again');
    expect(assets['a1']!.status, AssetStatus.ready);
  });

  test('re-enqueuing an already-uploaded room does not duplicate the scene',
      () async {
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano, tourId: 'tour-1');
    rooms.add(Room(
      id: 'r1',
      assetId: 'a1',
      name: 'Kitchen',
      panoramaPath: pano,
      remoteSceneId: 'scene-9',
      status: 'ready',
    ));

    await queue.enqueueRoom(assets['a1']!, rooms.first);
    await queue.pump();

    expect(api.calls.where((c) => c.startsWith('createScene')), isEmpty,
        reason: 'the room already has a scene; retry must be a no-op');
    expect(rooms.single.remoteSceneId, 'scene-9');
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

  // ---- Pass A: contract rules ------------------------------------------------

  Future<List<String>> writeFrames(int n) async => [
        for (var i = 0; i < n; i++)
          (File('${dir.path}/frame_$i.jpg')
                ..writeAsBytesSync([0xFF, 0xD8, 0xFF, 0xD9]))
              .path,
      ];

  Map<String, dynamic> doneJob({
    required String sceneId,
    bool cloudStitch = false,
    List<String> frameUrls = const [],
    int missingFrames = 0,
  }) =>
      {
        'id': 'a1',
        'kind': 'asset',
        'assetId': 'a1',
        'step': 'done',
        'tourId': 'tour-1',
        'sceneId': sceneId,
        'cloudStitch': cloudStitch,
        'frameUrls': frameUrls,
        'missingFrames': missingFrames,
        'attempts': 0,
      };

  group('main scene', () {
    test('the pipeline stores the main scene id on the asset', () async {
      final pano = await writePano();
      assets['a1'] = makeAsset('a1', panoPath: pano);
      await queue.enqueue(assets['a1']!);
      await queue.pump();
      expect(assets['a1']!.remoteSceneId, 'scene-1');
    });

    test('retrying a finished job creates no second scene and uploads nothing',
        () async {
      final pano = await writePano();
      assets['a1'] =
          makeAsset('a1', panoPath: pano, tourId: 'tour-1').copyWith(
        remoteSceneId: 'scene-9',
      );
      await store.upsert('upload_queue', doneJob(sceneId: 'scene-9'));

      await queue.enqueue(assets['a1']!);
      await queue.pump();

      expect(api.calls.where((c) => c.startsWith('createScene')), isEmpty);
      expect(api.calls.where((c) => c == 'presign'), isEmpty);
      expect(api.calls, ['publish:tour-1']);
      expect(assets['a1']!.status, AssetStatus.ready);
    });

    test('a fresh job for an asset that has a scene starts at publish',
        () async {
      final pano = await writePano();
      assets['a1'] =
          makeAsset('a1', panoPath: pano, tourId: 'tour-1').copyWith(
        remoteSceneId: 'scene-9',
      );
      await queue.enqueue(assets['a1']!);
      await queue.pump();
      expect(api.calls, ['publish:tour-1']);
    });

    test('a scene id only on the job (older build) is copied to the asset',
        () async {
      final pano = await writePano();
      assets['a1'] = makeAsset('a1', panoPath: pano, tourId: 'tour-1');
      await store.upsert('upload_queue', {
        ...doneJob(sceneId: 'scene-5'),
        'step': 'createScene',
        'panoramaUrl': 'https://res.cloudinary.example/pano.jpg',
      });
      await queue.pump();
      expect(api.calls.where((c) => c.startsWith('createScene')), isEmpty);
      expect(assets['a1']!.remoteSceneId, 'scene-5');
    });

    test('a room job waits until the main scene exists', () async {
      final pano = await writePano();
      assets['a1'] = makeAsset('a1', panoPath: pano, tourId: 'tour-1');
      rooms.add(Room(
          id: 'r1', assetId: 'a1', name: 'Kitchen', panoramaPath: pano));
      // The asset job failed before it created the main scene.
      await store.upsert('upload_queue', {
        'id': 'a1',
        'kind': 'asset',
        'assetId': 'a1',
        'step': 'failed',
        'lastStep': 'presign',
        'tourId': 'tour-1',
        'attempts': 8,
      });
      await queue.enqueueRoom(assets['a1']!, rooms.first);
      await queue.pump();
      expect(api.calls.where((c) => c.startsWith('createScene')), isEmpty,
          reason: 'a room scene made first would become the main scene');

      assets['a1'] = assets['a1']!.copyWith(remoteSceneId: 'scene-0');
      await queue.pump();
      expect(rooms.single.remoteSceneId, 'scene-1');
    });
  });

  group('cloud stitch', () {
    Future<void> enqueueCloudAsset() async {
      final pano = await writePano();
      final frames = await writeFrames(2);
      assets['a1'] = ScanAsset(
        id: 'a1',
        ownerId: 'u1',
        name: 'Room a1',
        status: AssetStatus.pendingCloudStitch,
        createdAt: DateTime(2026, 7, 23),
        panoramaPath: pano,
        framePaths: frames,
      );
      await queue.enqueue(assets['a1']!);
    }

    test('the asset becomes ready only when the job completes', () async {
      api.jobStatuses
        ..clear()
        ..add(AIJobStatus.processing);
      await enqueueCloudAsset();
      await queue.pump();

      expect(api.calls.where((c) => c.startsWith('requestStitch')).length, 1);
      expect(assets['a1']!.status, AssetStatus.pendingCloudStitch,
          reason: 'a running job is not a finished stitch');
      final waiting = (await store.readAll('upload_queue')).single;
      expect(waiting['step'], 'awaitStitch');

      api.jobStatuses
        ..clear()
        ..add(AIJobStatus.completed);
      await queue.pump();
      expect(assets['a1']!.status, AssetStatus.ready);
      expect((await store.readAll('upload_queue')).single['step'], 'done');
    });

    test('a failed job fails the asset with the server reason', () async {
      api.jobStatuses
        ..clear()
        ..add(AIJobStatus.failed);
      api.jobError = 'Not enough overlap between frames';
      await enqueueCloudAsset();
      await queue.pump();

      expect(assets['a1']!.status, AssetStatus.failed);
      final job = (await store.readAll('upload_queue')).single;
      expect(job['lastError'],
          'Cloud stitch failed: Not enough overlap between frames');
    });

    test('a cancelled job fails the asset', () async {
      api.jobStatuses
        ..clear()
        ..add(AIJobStatus.cancelled);
      await enqueueCloudAsset();
      await queue.pump();
      expect(assets['a1']!.status, AssetStatus.failed);
    });

    test('a retry after a failed job asks for the stitch again, nothing else',
        () async {
      final pano = await writePano();
      assets['a1'] = ScanAsset(
        id: 'a1',
        ownerId: 'u1',
        name: 'Room a1',
        status: AssetStatus.stitching, // the detail screen's Retry sets this
        createdAt: DateTime(2026, 7, 23),
        panoramaPath: pano,
        framePaths: await writeFrames(2),
        remoteTourId: 'tour-1',
        remoteSceneId: 'scene-9',
      );
      await store.upsert(
        'upload_queue',
        doneJob(
          sceneId: 'scene-9',
          cloudStitch: true,
          frameUrls: ['https://res.cloudinary.com/a', 'https://res.cloudinary.com/b'],
        ),
      );
      await queue.enqueue(assets['a1']!);
      await queue.pump();

      expect(api.calls.where((c) => c.startsWith('createScene')), isEmpty);
      expect(api.calls.where((c) => c == 'presign'), isEmpty,
          reason: 'frames are already uploaded');
      expect(api.calls.first, 'requestStitch:scene-9:2');
      expect(assets['a1']!.status, AssetStatus.ready);
    });

    test('a retry with missing frames stays failed and creates no scene',
        () async {
      final pano = await writePano();
      assets['a1'] = ScanAsset(
        id: 'a1',
        ownerId: 'u1',
        name: 'Room a1',
        status: AssetStatus.stitching,
        createdAt: DateTime(2026, 7, 23),
        panoramaPath: pano,
        framePaths: ['${dir.path}/gone_0.jpg', '${dir.path}/gone_1.jpg'],
        remoteTourId: 'tour-1',
        remoteSceneId: 'scene-9',
      );
      await store.upsert(
        'upload_queue',
        doneJob(sceneId: 'scene-9', cloudStitch: true, missingFrames: 2),
      );
      await queue.enqueue(assets['a1']!);
      await queue.pump();

      expect(assets['a1']!.status, AssetStatus.failed,
          reason: 'never ready while frames are missing');
      expect(api.calls.where((c) => c.startsWith('createScene')), isEmpty);
      final job = (await store.readAll('upload_queue')).single;
      expect(job['lastError'], contains('please re-capture'));
    });
  });

  group('failures', () {
    const nameTooLong = ApiException(
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      fields: [
        ApiFieldError(
          field: 'body.title',
          msg: 'String should have at most 255 characters',
          type: 'string_too_long',
        ),
      ],
    );

    test('a 4xx other than 408 and 429 fails the job at once, with the field',
        () async {
      final pano = await writePano();
      assets['a1'] = makeAsset('a1', panoPath: pano);
      api.tourError = nameTooLong;
      await queue.enqueue(assets['a1']!);
      await queue.pump();

      final job = (await store.readAll('upload_queue')).single;
      expect(job['step'], 'failed');
      expect(job['attempts'], 0, reason: 'no backoff retry for a 422');
      expect(job['lastError'], 'title: String should have at most 255 characters');
      expect(assets['a1']!.status, AssetStatus.failed);
    });

    test('a 429 is retried and its Retry-After is honoured', () async {
      final pano = await writePano();
      assets['a1'] = makeAsset('a1', panoPath: pano);
      api.tourError = const ApiException(
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        retryAfter: Duration(seconds: 120),
      );
      await queue.enqueue(assets['a1']!);
      await queue.pump();

      final job = (await store.readAll('upload_queue')).single;
      expect(job['step'], 'createTour');
      expect(job['attempts'], greaterThan(0));
      final wait = (job['nextRetryAt'] as int) -
          DateTime.now().millisecondsSinceEpoch;
      expect(wait, greaterThan(100 * 1000),
          reason: 'the server asked for 120 s; the backoff would be 10 s');
    });

    test('a 404 is terminal and the stored text is the envelope message',
        () async {
      final pano = await writePano();
      assets['a1'] = makeAsset('a1', panoPath: pano, tourId: 'tour-1');
      api.sceneError = const ApiException(
          statusCode: 404, code: 'NOT_FOUND', message: 'Tour not found');
      await queue.enqueue(assets['a1']!);
      await queue.pump();
      final job = (await store.readAll('upload_queue')).single;
      expect(job['step'], 'failed');
      expect(job['lastError'], 'Tour not found');
      expect(job['lastError'], isNot(contains('DioException')));
    });

    test('a network failure reads as a connection problem, never Dio text',
        () async {
      final pano = await writePano();
      assets['a1'] = makeAsset('a1', panoPath: pano);
      api.tourError = const ApiException(
        message: 'Could not reach the server. Check your connection and try '
            'again.',
        isNetwork: true,
      );
      await queue.enqueue(assets['a1']!);
      await queue.pump();
      final job = (await store.readAll('upload_queue')).single;
      expect(job['step'], 'createTour');
      expect(job['lastError'], contains('Check your connection'));
    });

    test('a rejected Cloudinary signature signs again instead of failing',
        () async {
      final pano = await writePano();
      assets['a1'] = makeAsset('a1', panoPath: pano);
      api.uploadError = const ApiException(
          statusCode: 401, message: 'Invalid Signature', fromStorage: true);
      await queue.enqueue(assets['a1']!);
      await queue.pump();
      await queue.pump();

      expect(api.calls.where((c) => c == 'presign').length, 2);
      expect(assets['a1']!.status, AssetStatus.ready);
      expect((await store.readAll('upload_queue')).single['step'], 'done',
          reason: 'a Cloudinary 401 is not an expired session');
    });

    test('a stored presign that cannot be read is signed again', () async {
      final pano = await writePano();
      assets['a1'] = makeAsset('a1', panoPath: pano, tourId: 'tour-1');
      await store.upsert('upload_queue', {
        'id': 'a1',
        'kind': 'asset',
        'assetId': 'a1',
        'step': 'putCloudinary',
        'tourId': 'tour-1',
        'presigned': {'upload_id': 'old', 'token': 'old-shape'},
        'presignedAt': DateTime.now().millisecondsSinceEpoch,
        'attempts': 0,
      });
      await queue.pump();
      expect(api.calls.first, 'presign');
      expect(assets['a1']!.status, AssetStatus.ready);
    });
  });

  group('idempotency', () {
    test('creates carry a key that is the same on every retry', () async {
      final pano = await writePano();
      assets['a1'] = makeAsset('a1', panoPath: pano);
      api.sceneError = const ApiException(statusCode: 503, message: 'down');
      await queue.enqueue(assets['a1']!);
      await queue.pump();
      await queue.pump();

      expect(api.tourKeys, ['tour-a1']);
      expect(api.sceneKeys, ['scene-a1', 'scene-a1']);
    });

    test('a retry after a lost scene response adopts the scene it finds',
        () async {
      final pano = await writePano();
      assets['a1'] = makeAsset('a1', panoPath: pano);
      // The server created the scene, then the response was lost.
      api.sceneError = const ApiException(message: 'timeout', isNetwork: true);
      api.tourScenes.add(const SceneDto(
        id: 'scene-77',
        tourId: 'tour-1',
        title: null,
        imageUrl: 'https://res.cloudinary.example/pano.jpg',
        orderIndex: 0,
      ));
      await queue.enqueue(assets['a1']!);
      await queue.pump();
      await queue.pump();

      expect(api.calls.where((c) => c.startsWith('createScene')), isEmpty,
          reason: 'the scene already exists on the server');
      expect(assets['a1']!.remoteSceneId, 'scene-77');
      expect(assets['a1']!.status, AssetStatus.ready);
    });
  });

  group('account scope', () {
    test('the queue runs only the signed-in account jobs', () async {
      final pano = await writePano();
      assets['a1'] = makeAsset('a1', panoPath: pano); // owned by u1
      String? owner = 'u2';
      final scoped = UploadQueue(
        store,
        api,
        getAsset: (id) async => assets[id],
        saveAsset: (a) async => assets[a.id] = a,
        currentOwnerId: () => owner,
        connectivityChanges: const Stream.empty(),
      );
      await scoped.enqueue(assets['a1']!);
      await scoped.pump();
      expect(api.calls, isEmpty, reason: 'u2 must not upload u1 scans');

      owner = null; // signed out
      await scoped.pump();
      expect(api.calls, isEmpty);

      owner = 'u1';
      await scoped.pump();
      expect(assets['a1']!.status, AssetStatus.ready);
      await scoped.dispose();
    });
  });
}
