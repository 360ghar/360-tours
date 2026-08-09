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

  /// Queue of job-status responses served by [getAiJob] (one per poll).
  final stitchPollResults = <Map<String, dynamic>>[];
  final stitchRequests = <Map<String, dynamic>>[];

  @override
  Future<Map<String, dynamic>> createTour({
    required String title,
    String? description,
  }) async {
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
      final deadline = DateTime.now().add(const Duration(seconds: 2));
      while (api.calls.where((c) => c == 'pollStitch').length < 2 &&
          DateTime.now().isBefore(deadline)) {
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
      expect(api.calls.where((c) => c == 'pollStitch').length, 2);
    });
  });
}
