import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/api/backend_api.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/storage/local_store.dart';
import 'package:tours360/core/upload/upload_queue.dart';

class _FakeApi extends BackendApi {
  _FakeApi() : super(Dio());

  final calls = <String>[];
  final presignedFilenames = <String>[];
  bool failPublishOnce = false;
  bool sceneCreateFailOnce = false;
  int sceneReconcileCalls = 0;

  /// Throws a permanent 4xx once for every call matching [permanentFailPath]
  /// until [permanentFailRemaining] hits 0.
  String? permanentFailPath;
  int permanentFailRemaining = 0;

  /// Throws a transient 5xx [transientFailRemaining] times for calls matching
  /// [transientFailPath].
  String? transientFailPath;
  int transientFailRemaining = 0;

  /// Queue of job-status responses served by [getAiJob] (one per poll).
  final stitchPollResults = <Map<String, dynamic>>[];
  final stitchRequests = <Map<String, dynamic>>[];

  /// When set, [getAiJob] blocks on this gate before returning - lets tests
  /// freeze the pipeline mid-refinement and observe the asset state.
  Completer<void>? stitchPollGate;

  @override
  Future<Map<String, dynamic>> createTour({
    required String title,
    String? description,
  }) async {
    calls.add('createTour');
    _maybeFail('createTour');
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
    presignedFilenames.add(filename);
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

  /// Optional hook intercepting Cloudinary uploads (concurrency tests).
  Future<void> Function({
    required Map<String, dynamic> presigned,
    required File file,
    void Function(double fraction)? onProgress,
  })? cloudinaryHook;

  @override
  Future<void> uploadToCloudinary({
    required Map<String, dynamic> presigned,
    required File file,
    void Function(double fraction)? onProgress,
  }) async {
    final hook = cloudinaryHook;
    if (hook != null) {
      await hook(presigned: presigned, file: file, onProgress: onProgress);
      return;
    }
    calls.add('putCloudinary');
    _maybeFail(file.path.contains('frame_') ? 'putCloudinary:frame' : 'putCloudinary');
  }

  @override
  Future<Map<String, dynamic>> confirmUpload(String uploadId) async {
    calls.add('confirm:$uploadId');
    _maybeFail('confirm');
    return {'media': {}, 'message': 'ok'};
  }

  /// Applies the configured scripted failures and consumes one use each.
  void _maybeFail(String path) {
    if (path == permanentFailPath && permanentFailRemaining > 0) {
      permanentFailRemaining--;
      throw DioException(
        requestOptions: RequestOptions(path: '/x'),
        response: Response(
          requestOptions: RequestOptions(path: '/x'),
          statusCode: 400,
          data: {'detail': 'permanent validation failure'},
        ),
      );
    }
    if (path == transientFailPath && transientFailRemaining > 0) {
      transientFailRemaining--;
      throw DioException(
        requestOptions: RequestOptions(path: '/x'),
        response: Response(
          requestOptions: RequestOptions(path: '/x'),
          statusCode: 500,
        ),
      );
    }
  }

  @override
  Future<Map<String, dynamic>> createScene({
    required String tourId,
    required String imageUrl,
    String? title,
    int? orderIndex,
  }) async {
    calls.add('createScene:$tourId:$orderIndex');
    if (sceneCreateFailOnce) {
      sceneCreateFailOnce = false;
      throw DioException(
        requestOptions: RequestOptions(path: '/scenes'),
        response: Response(
          requestOptions: RequestOptions(path: '/scenes'),
          statusCode: 500,
        ),
      );
    }
    return {'id': 'scene-1', 'image_url': imageUrl};
  }

  @override
  Future<List<Map<String, dynamic>>> getTourScenes(String tourId) async {
    calls.add('getTourScenes:$tourId');
    sceneReconcileCalls++;
    return sceneReconcileCalls >= 2
        ? [
            {
              'id': 'scene-9',
              'image_url': 'https://res.cloudinary.example/pano.jpg',
            },
          ]
        : [];
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

  @override
  Future<Map<String, dynamic>> requestCloudStitch({
    required String sceneId,
    required List<String> frameUrls,
    List<Map<String, dynamic>>? frames,
    Map<String, dynamic>? cameraProfile,
  }) async {
    calls.add('requestStitch');
    stitchRequests.add({
      'sceneId': sceneId,
      'frameUrls': frameUrls,
      'frames': frames,
      'cameraProfile': cameraProfile,
    });
    return {'id': 'stitch-job-1', 'status': 'pending'};
  }

  @override
  Future<Map<String, dynamic>> getAiJob(String jobId) async {
    calls.add('pollStitch');
    final gate = stitchPollGate;
    if (gate != null) await gate.future;
    if (stitchPollResults.isEmpty) {
      return {'id': jobId, 'status': 'processing', 'progress': 50};
    }
    return stitchPollResults.removeAt(0);
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

  ScanAsset makeNaiveAsset(
    String id, {
    String? panoPath,
    List<String>? framePaths,
  }) => ScanAsset(
    id: id,
    ownerId: 'u1',
    name: 'Room $id',
    status: AssetStatus.pendingCloudStitch,
    createdAt: DateTime(2026, 7, 23),
    panoramaPath: panoPath,
    framePaths:
        framePaths ??
        [for (var i = 0; i < 3; i++) '${dir.path}/$id/frame_$i.jpg'],
    frameOrientations: [
      FrameOrientation(yaw: 0, pitch: 0, roll: 0.5),
      FrameOrientation(yaw: 120, pitch: 0, roll: -1),
      FrameOrientation(yaw: 240, pitch: 0, roll: 0),
    ],
    frameTargetIndices: const [0, 8, 16],
    frameLowQuality: const [false, true, false],
    captureHFovDeg: 55,
    captureVFovDeg: 69,
  );

  Future<void> writeFrameFiles(List<String> paths) async {
    for (final path in paths) {
      final f = File(path);
      await f.parent.create(recursive: true);
      await f.writeAsBytes([0xFF, 0xD8, 0xFF, 0xD9]);
    }
  }

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
      // Deterministic polls: the backoff cadence is covered by its own test.
      pollInterval: (_) => Duration.zero,
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
      'getTourScenes:tour-1',
      'createScene:tour-1:0',
      'publish:tour-1',
    ]);
    final done = assets['a1']!;
    expect(done.status, AssetStatus.ready);
    expect(done.remoteTourId, 'tour-1');
    expect(done.shareCode, 'abc12');
    expect(done.panoramaUrl, 'https://res.cloudinary.example/pano.jpg');
  });

  test(
    'recovers from a failed step without duplicating earlier ones',
    () async {
      final pano = await writePano();
      assets['a1'] = makeAsset('a1', panoPath: pano);
      api.failPublishOnce = true;

      await queue.enqueue(assets['a1']!);
      await queue.pump(); // publish fails once, retry succeeds
      await queue.pump();

      expect(
        api.calls.where((c) => c == 'createTour').length,
        1,
        reason: 'must not create a duplicate tour on retry',
      );
      expect(
        api.calls.where((c) => c == 'presign').length,
        1,
        reason: 'earlier steps must not repeat',
      );
      expect(api.calls.where((c) => c.startsWith('publish')).length, 1);
      expect(assets['a1']!.status, AssetStatus.ready);
    },
  );

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
    rooms.add(
      Room(id: 'r1', assetId: 'a1', name: 'Kitchen', panoramaPath: pano),
    );

    // Queue the room BEFORE the asset has a tour: it must not starve the
    // asset job that unblocks it.
    await queue.enqueueRoom(assets['a1']!, rooms.first);
    await queue.enqueue(assets['a1']!);
    await queue.pump();

    expect(api.calls, contains('createScene:tour-1:1'));
    expect(rooms.single.remoteSceneId, 'scene-1');
    expect(rooms.single.panoramaUrl, isNotNull);
  });

  group('cloud stitch refinement', () {
    test(
      'sends frame metadata, polls to completion, marks the asset ready',
      () async {
        final pano = await writePano();
        assets['a1'] = makeNaiveAsset('a1', panoPath: pano);
        await writeFrameFiles(assets['a1']!.framePaths);
        api.stitchPollResults.addAll([
          {'id': 'stitch-job-1', 'status': 'processing', 'progress': 40},
          {
            'id': 'stitch-job-1',
            'status': 'completed',
            'progress': 100,
            'result': {
              'image_url': 'https://res.cloudinary.example/refined.jpg',
              'width': 2048,
              'height': 1024,
              'quality': {'coverage_percent': 99.1},
            },
          },
        ]);

        await queue.enqueue(assets['a1']!);
        await queue.pump();

        expect(api.calls, contains('requestStitch'));
        expect(api.calls.where((c) => c == 'pollStitch').length, 2);
        final request = api.stitchRequests.single;
        expect(
          request['frames'],
          isNotNull,
          reason: 'captures with orientation metadata send frame metadata',
        );
        expect(request['frames'].length, 3);
        expect(request['frames'][0]['yaw'], 0.0);
        expect(request['frames'][0]['roll'], 0.5);
        expect(request['frames'][1]['low_quality'], isTrue);
        expect(request['frames'][1]['target_index'], 8);
        expect(request['cameraProfile'], {
          'horizontal_fov': 55.0,
          'vertical_fov': 69.0,
        });

        final done = assets['a1']!;
        expect(done.status, AssetStatus.ready);
        expect(done.cloudStitchFailed, isFalse);
        expect(done.panoramaUrl, 'https://res.cloudinary.example/refined.jpg');
        // The job finished: re-enqueuing does not re-request.
        await queue.enqueue(assets['a1']!);
        await queue.pump();
        expect(api.calls.where((c) => c == 'requestStitch').length, 1);
      },
    );

    test('legacy assets (no orientations) send frame_urls only', () async {
      final pano = await writePano();
      final asset = ScanAsset(
        id: 'legacy',
        ownerId: 'u1',
        name: 'Old room',
        status: AssetStatus.pendingCloudStitch,
        createdAt: DateTime(2026, 7, 23),
        panoramaPath: pano,
        framePaths: ['${dir.path}/legacy/f0.jpg', '${dir.path}/legacy/f1.jpg'],
      );
      await writeFrameFiles(asset.framePaths);
      assets['legacy'] = asset;
      api.stitchPollResults.add({
        'id': 'stitch-job-1',
        'status': 'completed',
        'result': {'image_url': 'https://res.cloudinary.example/refined.jpg'},
      });

      await queue.enqueue(asset);
      await queue.pump();

      final request = api.stitchRequests.single;
      expect(
        request['frames'],
        isNull,
        reason: 'legacy captures keep the old contract',
      );
      expect(request['cameraProfile'], isNull);
      expect(assets['legacy']!.status, AssetStatus.ready);
    });

    test(
      'job failure keeps the tour published and flags refinement failed',
      () async {
        final pano = await writePano();
        assets['a1'] = makeNaiveAsset('a1', panoPath: pano);
        await writeFrameFiles(assets['a1']!.framePaths);
        api.stitchPollResults.add({
          'id': 'stitch-job-1',
          'status': 'failed',
          'error_message':
              'Stitched panorama failed quality validation: coverage',
        });

        await queue.enqueue(assets['a1']!);
        await queue.pump();

        final done = assets['a1']!;
        expect(
          done.status,
          AssetStatus.ready,
          reason: 'the naive pano is live — never AssetStatus.failed',
        );
        expect(done.cloudStitchFailed, isTrue);
      },
    );

    test('retry after refinement failure re-requests the stitch without '
        're-uploading frames', () async {
      final pano = await writePano();
      assets['a1'] = makeNaiveAsset('a1', panoPath: pano);
      await writeFrameFiles(assets['a1']!.framePaths);
      api.stitchPollResults.add({
        'id': 'stitch-job-1',
        'status': 'failed',
        'error_message': 'boom',
      });

      await queue.enqueue(assets['a1']!);
      await queue.pump();
      expect(assets['a1']!.cloudStitchFailed, isTrue);

      // Retry refinement: resume at a fresh stitch request.
      api.stitchPollResults.add({
        'id': 'stitch-job-1',
        'status': 'completed',
        'result': {'image_url': 'https://res.cloudinary.example/refined.jpg'},
      });
      await queue.enqueue(assets['a1']!);
      await queue.pump();

      expect(api.calls.where((c) => c == 'requestStitch').length, 2);
      expect(
        api.calls.where((c) => c == 'presign').length,
        4,
        reason:
            '1 panorama presign + 3 frame uploads, not re-uploaded '
            'on refinement retry',
      );
      expect(assets['a1']!.cloudStitchFailed, isFalse);
      expect(assets['a1']!.status, AssetStatus.ready);
    });

    test('polls respect the backoff interval (nextPollAt): early re-pumps '
        'do not burn the poll budget', () async {
      final pano = await writePano();
      assets['a1'] = makeNaiveAsset('a1', panoPath: pano);
      await writeFrameFiles(assets['a1']!.framePaths);
      api.stitchPollResults.add({
        'id': 'stitch-job-1',
        'status': 'processing',
        'progress': 50,
      });
      api.stitchPollResults.add({
        'id': 'stitch-job-1',
        'status': 'processing',
        'progress': 90,
      });

      final slowQueue = UploadQueue(
        store,
        api,
        getAsset: (id) async => assets[id],
        saveAsset: (a) async => assets[a.id] = a,
        connectivityChanges: const Stream.empty(),
        pollInterval: (_) => const Duration(milliseconds: 200),
      );

      await slowQueue.enqueue(assets['a1']!);
      await slowQueue.pump();
      expect(
        api.calls.where((c) => c == 'pollStitch').length,
        1,
        reason: 'one poll, then the job waits on its Timer',
      );

      // An early external pump must NOT re-poll before nextPollAt.
      await slowQueue.pump();
      expect(
        api.calls.where((c) => c == 'pollStitch').length,
        1,
        reason: 'early re-pump is deferred until the interval elapses',
      );

      // After the interval, the scheduled Timer fires and the job advances
      // (the NEXT poll is then due 200ms later — asserted before it fires).
      final deadline = DateTime.now().add(const Duration(seconds: 5));
      while (api.calls.where((c) => c == 'pollStitch').length < 2 &&
          DateTime.now().isBefore(deadline)) {
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
      expect(api.calls.where((c) => c == 'pollStitch').length, 2);
    });
  });

  group('phase 4 production hardening', () {
    test(
      'publish makes the tour viewable immediately: ready + published while '
      'refinement continues in the background',
      () async {
        final pano = await writePano();
        assets['a1'] = makeNaiveAsset('a1', panoPath: pano);
        await writeFrameFiles(assets['a1']!.framePaths);
        // Freeze the first stitch poll so the pipeline parks mid-refinement
        // and the asset's published-but-refining state can be observed.
        api.stitchPollGate = Completer<void>();

        await queue.enqueue(assets['a1']!);
        final pumpFuture = queue.pump();
        // Wait (deterministically) for publish to land — the drain is then
        // parked on the stitch-poll gate.
        final deadline = DateTime.now().add(const Duration(seconds: 3));
        while (!assets['a1']!.published &&
            DateTime.now().isBefore(deadline)) {
          await Future<void>.delayed(const Duration(milliseconds: 10));
        }

        // The moment publish succeeds (before frames are uploaded) the tour
        // must be viewable — never gated on refinement state.
        final midPipeline = assets['a1']!;
        expect(midPipeline.status, AssetStatus.ready);
        expect(midPipeline.published, isTrue);
        expect(midPipeline.canViewTour, isTrue);
        expect(midPipeline.cloudStitchPending, isTrue);
        expect(midPipeline.remoteSceneId, 'scene-1');

        // ... and refinement completes in the background afterwards.
        api.stitchPollResults.add({
          'id': 'stitch-job-1',
          'status': 'completed',
          'progress': 100,
          'result': {
            'image_url': 'https://res.cloudinary.example/refined.jpg',
          },
        });
        api.stitchPollGate!.complete();
        api.stitchPollGate = null;
        await pumpFuture;

        final done = assets['a1']!;
        expect(done.cloudStitchPending, isFalse);
        expect(done.cloudStitchFailed, isFalse);
        expect(done.status, AssetStatus.ready);
        expect(done.published, isTrue);
        expect(done.panoramaUrl, 'https://res.cloudinary.example/refined.jpg');
      },
    );

    test(
      'frame upload give-up keeps the tour published and viewable '
      '(never AssetStatus.failed)',
      () async {
        final pano = await writePano();
        assets['a1'] = makeNaiveAsset('a1', panoPath: pano);
        await writeFrameFiles(assets['a1']!.framePaths);
        // Permanent 4xx on EVERY frame upload → the pipeline must give up on
        // the refinement input without touching the published tour.
        api.permanentFailPath = 'putCloudinary:frame';
        api.permanentFailRemaining = 100;

        await queue.enqueue(assets['a1']!);
        await queue.pump();

        final done = assets['a1']!;
        expect(done.published, isTrue, reason: 'tour was published');
        expect(
          done.status,
          AssetStatus.ready,
          reason: 'frame upload failure must not mark the asset failed',
        );
        expect(done.cloudStitchFailed, isTrue);
        expect(done.cloudStitchPending, isFalse);
        expect(done.canViewTour, isTrue);
      },
    );

    test('permanent 4xx fails immediately with the backend detail, no retry '
        'storm', () async {
      final pano = await writePano();
      assets['a1'] = makeAsset('a1', panoPath: pano);
      api.permanentFailPath = 'createTour';
      api.permanentFailRemaining = 100;

      await queue.enqueue(assets['a1']!);
      await queue.pump();

      expect(api.calls.where((c) => c == 'createTour').length, 1);
      final jobs = await store.readAll('upload_queue');
      expect(jobs.single['step'], 'failed');
      expect(jobs.single['attempts'], 1);
      expect(
        jobs.single['lastError'] as String,
        contains('permanent validation failure'),
      );
      expect(assets['a1']!.status, AssetStatus.failed);
      expect(assets['a1']!.canViewTour, isFalse);
    });

    test('5xx errors are retried with bounded backoff, then give up',
        () async {
      final pano = await writePano();
      assets['a1'] = makeAsset('a1', panoPath: pano);
      api.transientFailPath = 'createTour';
      api.transientFailRemaining = 100;

      await queue.enqueue(assets['a1']!);
      await queue.pump(); // enqueue's drain + the pump coalesce: 2 attempts
      final attemptsSoFar = api.calls.where((c) => c == 'createTour').length;
      expect(attemptsSoFar, 2);
      expect(assets['a1']!.status, AssetStatus.stitching,
          reason: 'still retrying, not failed yet');
      expect(assets['a1']!.canViewTour, isFalse);

      // Manual re-pumps drive the retries deterministically (the scheduled
      // Timer fires harmlessly later).
      for (var i = 0; i < 6; i++) {
        await queue.pump();
      }
      expect(api.calls.where((c) => c == 'createTour').length, 8);
      final jobs = await store.readAll('upload_queue');
      expect(jobs.single['step'], 'failed');
      expect(jobs.single['lastError'] as String, contains('HTTP 500'));
      expect(assets['a1']!.status, AssetStatus.failed);
    });

    test(
      'createScene timeout after server success reconciles the existing '
      'scene instead of duplicating it',
      () async {
        final pano = await writePano();
        assets['a1'] = makeAsset('a1', panoPath: pano);
        api.sceneCreateFailOnce = true;

        await queue.enqueue(assets['a1']!);
        await queue.pump(); // createScene times out (5xx)
        await queue.pump(); // retry: reconcile adopts scene-9

        expect(
          api.calls.where((c) => c.startsWith('createScene')).length,
          1,
          reason: 'the scene the server already created must be adopted',
        );
        expect(assets['a1']!.remoteSceneId, 'scene-9');
        expect(assets['a1']!.published, isTrue);
        expect(assets['a1']!.status, AssetStatus.ready);
      },
    );

    test(
      'a job survives process death: a fresh queue resumes from the '
      'persisted step without duplicating the tour',
      () async {
        final pano = await writePano();
        assets['a1'] = makeAsset('a1', panoPath: pano);
        api.failPublishOnce = true;

        final q1 = UploadQueue(
          store,
          api,
          getAsset: (id) async => assets[id],
          saveAsset: (a) async => assets[a.id] = a,
          connectivityChanges: const Stream.empty(),
          pollInterval: (_) => Duration.zero,
        );
        await q1.enqueue(assets['a1']!);
        await q1.pump(); // publish fails (5xx) → job stays pending

        // "App killed, relaunched": a brand-new queue over the same store.
        final q2 = UploadQueue(
          store,
          api,
          getAsset: (id) async => assets[id],
          saveAsset: (a) async => assets[a.id] = a,
          connectivityChanges: const Stream.empty(),
          pollInterval: (_) => Duration.zero,
        );
        await q2.pump();

        expect(
          api.calls.where((c) => c == 'createTour').length,
          1,
          reason: 'never create a second tour on restart',
        );
        expect(api.calls.where((c) => c == 'presign').length, 1);
        expect(assets['a1']!.published, isTrue);
        expect(assets['a1']!.status, AssetStatus.ready);
      },
    );

    test(
      'a persisted stitchJobId resumes polling without a fresh stitch '
      'request after restart',
      () async {
        final pano = await writePano();
        assets['a1'] = makeNaiveAsset('a1', panoPath: pano);
        await writeFrameFiles(assets['a1']!.framePaths);
        api.stitchPollResults.addAll([
          {'id': 'stitch-job-1', 'status': 'processing', 'progress': 40},
          {
            'id': 'stitch-job-1',
            'status': 'completed',
            'progress': 100,
            'result': {
              'image_url': 'https://res.cloudinary.example/refined.jpg',
            },
          },
        ]);

        final q1 = UploadQueue(
          store,
          api,
          getAsset: (id) async => assets[id],
          saveAsset: (a) async => assets[a.id] = a,
          connectivityChanges: const Stream.empty(),
          pollInterval: (_) => Duration.zero,
        );
        await q1.enqueue(assets['a1']!);
        await q1.pump();

        final q2 = UploadQueue(
          store,
          api,
          getAsset: (id) async => assets[id],
          saveAsset: (a) async => assets[a.id] = a,
          connectivityChanges: const Stream.empty(),
          pollInterval: (_) => Duration.zero,
        );
        await q2.pump();

        expect(
          api.calls.where((c) => c == 'requestStitch').length,
          1,
          reason: 'the stored stitch job id must be reused, not re-requested',
        );
        expect(api.calls.where((c) => c == 'pollStitch').length, 2);
        expect(assets['a1']!.panoramaUrl,
            'https://res.cloudinary.example/refined.jpg');
      },
    );

    test(
      'retry after a failed upload re-presigns (fresh Cloudinary signature) '
      'and resumes from the last successful step',
      () async {
        final pano = await writePano();
        assets['a1'] = makeAsset('a1', panoPath: pano);
        api.permanentFailPath = 'confirm';
        api.permanentFailRemaining = 1;

        await queue.enqueue(assets['a1']!);
        await queue.pump(); // confirm fails 4xx → job failed immediately
        expect(assets['a1']!.status, AssetStatus.failed);

        await queue.retry('a1');
        await queue.pump();

        expect(
          api.calls.where((c) => c == 'presign').length,
          2,
          reason: 'a fresh presigned URL is minted for the retry',
        );
        expect(api.calls.where((c) => c == 'putCloudinary').length, 2);
        expect(assets['a1']!.published, isTrue);
        expect(assets['a1']!.status, AssetStatus.ready);
      },
    );

    test(
      'frames upload with bounded concurrency (never more than 2 at a time)',
      () async {
        final pano = await writePano();
        final asset = ScanAsset(
          id: 'a6',
          ownerId: 'u1',
          name: 'Six frames',
          status: AssetStatus.pendingCloudStitch,
          createdAt: DateTime(2026, 7, 23),
          panoramaPath: pano,
          framePaths: [
            for (var i = 0; i < 6; i++) '${dir.path}/a6/frame_$i.jpg',
          ],
          frameOrientations: const [
            FrameOrientation(yaw: 0, pitch: 0),
            FrameOrientation(yaw: 60, pitch: 0),
            FrameOrientation(yaw: 120, pitch: 0),
            FrameOrientation(yaw: 180, pitch: 0),
            FrameOrientation(yaw: 240, pitch: 0),
            FrameOrientation(yaw: 300, pitch: 0),
          ],
        );
        await writeFrameFiles(asset.framePaths);
        assets['a6'] = asset;
        api.stitchPollResults.add({
          'id': 'stitch-job-1',
          'status': 'completed',
          'result': {'image_url': 'https://res.cloudinary.example/r.jpg'},
        });
        // Slow the Cloudinary PUTs so concurrent batch members overlap, and
        // record the observed peak concurrency.
        var active = 0;
        var maxActive = 0;
        api.cloudinaryHook = ({
          required Map<String, dynamic> presigned,
          required File file,
          void Function(double fraction)? onProgress,
        }) async {
          active++;
          maxActive = max(maxActive, active);
          await Future<void>.delayed(const Duration(milliseconds: 15));
          active--;
        };

        await queue.enqueue(assets['a6']!);
        await queue.pump();

        expect(maxActive, lessThanOrEqualTo(2),
            reason: 'bounded concurrency — never 24 parallel uploads');
        expect(maxActive, 2, reason: 'the batch actually overlaps');
        expect(assets['a6']!.panoramaUrl,
            'https://res.cloudinary.example/r.jpg');
      },
    );

    test(
      'a mid-batch failure resumes after restart without re-uploading '
      'completed frames',
      () async {
        final pano = await writePano();
        final asset = ScanAsset(
          id: 'a6',
          ownerId: 'u1',
          name: 'Six frames',
          status: AssetStatus.pendingCloudStitch,
          createdAt: DateTime(2026, 7, 23),
          panoramaPath: pano,
          framePaths: [
            for (var i = 0; i < 6; i++) '${dir.path}/a6/frame_$i.jpg',
          ],
          frameOrientations: const [
            FrameOrientation(yaw: 0, pitch: 0),
            FrameOrientation(yaw: 60, pitch: 0),
            FrameOrientation(yaw: 120, pitch: 0),
            FrameOrientation(yaw: 180, pitch: 0),
            FrameOrientation(yaw: 240, pitch: 0),
            FrameOrientation(yaw: 300, pitch: 0),
          ],
        );
        await writeFrameFiles(asset.framePaths);
        assets['a6'] = asset;
        api.stitchPollResults.add({
          'id': 'stitch-job-1',
          'status': 'completed',
          'result': {'image_url': 'https://res.cloudinary.example/r.jpg'},
        });
        // The first frame upload fails once with a 5xx (frames 0,1 are
        // presigned as batch 1; frame 0's PUT throws, frame 1 succeeds).
        api.transientFailPath = 'putCloudinary:frame';
        api.transientFailRemaining = 1;

        final q1 = UploadQueue(
          store,
          api,
          getAsset: (id) async => assets[id],
          saveAsset: (a) async => assets[a.id] = a,
          connectivityChanges: const Stream.empty(),
          pollInterval: (_) => Duration.zero,
        );
        await q1.enqueue(assets['a6']!);
        // Wait for the single first-pass attempt to fail and persist.
        final deadline = DateTime.now().add(const Duration(seconds: 3));
        while (DateTime.now().isBefore(deadline)) {
          final jobs = await store.readAll('upload_queue');
          final job = jobs.singleOrNull;
          if (job != null &&
              job['step'] == 'uploadFrames' &&
              (job['attempts'] as int? ?? 0) == 1) {
            break;
          }
          await Future<void>.delayed(const Duration(milliseconds: 10));
        }
        expect(
          api.presignedFilenames.where((f) => f.startsWith('frame_')).length,
          2,
          reason: 'batch of 2, not 6 parallel uploads',
        );

        // Restart: the remaining frames continue, 0/1 are never re-uploaded.
        final q2 = UploadQueue(
          store,
          api,
          getAsset: (id) async => assets[id],
          saveAsset: (a) async => assets[a.id] = a,
          connectivityChanges: const Stream.empty(),
          pollInterval: (_) => Duration.zero,
        );
        await q2.pump();

        final frameNames = api.presignedFilenames
            .where((f) => f.startsWith('frame_'))
            .toList();
        expect(frameNames, ['frame_0.jpg', 'frame_1.jpg', 'frame_2.jpg',
            'frame_3.jpg', 'frame_4.jpg', 'frame_5.jpg']);
        expect(assets['a6']!.panoramaUrl,
            'https://res.cloudinary.example/r.jpg');
      },
    );

    test('local panorama stays viewable after cloud refinement failure '
        '(canViewTour remains true)', () async {
      final pano = await writePano();
      assets['a1'] = makeNaiveAsset('a1', panoPath: pano);
      await writeFrameFiles(assets['a1']!.framePaths);
      api.stitchPollResults.add({
        'id': 'stitch-job-1',
        'status': 'failed',
        'error_message': 'quality gate failed',
      });

      await queue.enqueue(assets['a1']!);
      await queue.pump();

      final done = assets['a1']!;
      expect(done.published, isTrue);
      expect(done.cloudStitchFailed, isTrue);
      expect(done.canViewTour, isTrue,
          reason: 'the local panorama is the fallback — never a dead-end');
      expect(done.panoramaUrl, 'https://res.cloudinary.example/pano.jpg');
    });

    test('pipeline progress stream reports steps and frame counts', () async {
      final pano = await writePano();
      assets['a1'] = makeNaiveAsset('a1', panoPath: pano);
      await writeFrameFiles(assets['a1']!.framePaths);
      api.stitchPollResults.add({
        'id': 'stitch-job-1',
        'status': 'completed',
        'result': {'image_url': 'https://res.cloudinary.example/r.jpg'},
      });
      final steps = <String>[];
      final framesSeen = <int>[];
      final sub = queue.progress.listen((p) {
        steps.add(p.step);
        if (p.step == 'uploadFrames') framesSeen.add(p.framesUploaded);
      });

      await queue.enqueue(assets['a1']!);
      await queue.pump();
      await Future<void>.delayed(Duration.zero);
      await sub.cancel();

      expect(steps, contains('createTour'));
      expect(steps, contains('putCloudinary'));
      expect(steps, contains('publish'));
      expect(steps, contains('requestStitch'));
      expect(framesSeen, containsAll([2, 3]));
    });
  });
}
