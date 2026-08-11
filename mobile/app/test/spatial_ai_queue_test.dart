import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/api/backend_api.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/storage/local_store.dart';
import 'package:tours360/core/upload/upload_queue.dart';

/// Phase 5 AI spatial-navigation queue tests.
///
/// The spatial job is a SEPARATE, non-fatal job kind: it is enqueued at
/// publish, polls the backend job, and its failure NEVER marks the asset
/// failed or hides the published tour (regression).
class _FakeApi extends BackendApi {
  _FakeApi() : super(Dio());

  final calls = <String>[];
  final spatialRequests = <Map<String, dynamic>>[];

  /// Served by [getAiJob] for 'spatial-*' job ids (one per poll).
  final spatialPollResults = <Map<String, dynamic>>[];

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
    void Function(double fraction)? onProgress,
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
    calls.add('createScene');
    return {'id': 'scene-1', 'image_url': imageUrl};
  }

  @override
  Future<List<Map<String, dynamic>>> getTourScenes(String tourId) async {
    calls.add('getTourScenes');
    return [];
  }

  @override
  Future<Map<String, dynamic>> publishTour(String tourId) async {
    calls.add('publish');
    return {'id': tourId, 'status': 'published', 'short_code': 'abc12'};
  }

  @override
  Future<Map<String, dynamic>> requestSpatialAi(
    String tourId, {
    List<Map<String, dynamic>>? captureMetrics,
  }) async {
    calls.add('requestSpatial');
    spatialRequests.add({'tourId': tourId, 'captureMetrics': captureMetrics});
    return {'id': 'spatial-job-1', 'status': 'pending'};
  }

  @override
  Future<Map<String, dynamic>> getAiJob(String jobId) async {
    calls.add('getAiJob:$jobId');
    if (jobId.startsWith('spatial')) {
      if (spatialPollResults.isEmpty) {
        return {'id': jobId, 'status': 'processing', 'progress': 40};
      }
      return spatialPollResults.removeAt(0);
    }
    return {'id': jobId, 'status': 'processing'};
  }
}

void main() {
  late Directory dir;
  late LocalStore store;
  late _FakeApi api;
  late Map<String, ScanAsset> assets;
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

  void setUpQueue({required bool spatialAiEnabled}) {
    queue = UploadQueue(
      store,
      api,
      getAsset: (id) async => assets[id],
      saveAsset: (a) async => assets[a.id] = a,
      connectivityChanges: const Stream.empty(),
      pollInterval: (_) => Duration.zero,
      spatialAiEnabled: spatialAiEnabled,
    );
  }

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('spatial_queue_test');
    store = LocalStore(dir);
    api = _FakeApi();
    assets = {};
  });

  tearDown(() => dir.delete(recursive: true));

  Future<String> writePano() async {
    final f = File('${dir.path}/pano.jpg');
    await f.writeAsBytes([0xFF, 0xD8, 0xFF, 0xD9]);
    return f.path;
  }

  test('spatial job runs after publish when enabled and stores the score',
      () async {
    setUpQueue(spatialAiEnabled: true);
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano);
    api.spatialPollResults.add({
      'id': 'spatial-job-1',
      'status': 'completed',
      'result': {
        'quality': {'overall_score': 88.4},
      },
    });

    await queue.enqueue(assets['a1']!);
    await queue.pump();
    await queue.pump(); // drive the spatial job (poll timer)

    expect(api.calls, contains('publish'));
    expect(api.calls, contains('requestSpatial'));
    expect(api.spatialRequests.single['tourId'], 'tour-1');

    final done = assets['a1']!;
    expect(done.status, AssetStatus.ready);
    expect(done.published, isTrue);
    expect(done.spatialAiPending, isFalse);
    expect(done.spatialAiFailed, isFalse);
    expect(done.spatialQualityScore, 88.4);
    expect(done.canViewTour, isTrue);
  });

  test('spatial job is NOT enqueued when disabled', () async {
    setUpQueue(spatialAiEnabled: false); // default
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano);

    await queue.enqueue(assets['a1']!);
    await queue.pump();

    expect(api.calls, isNot(contains('requestSpatial')));
    final jobs = await store.readAll('upload_queue');
    expect(jobs.where((j) => j['kind'] == 'spatial'), isEmpty);
    final done = assets['a1']!;
    expect(done.status, AssetStatus.ready);
    expect(done.spatialAiPending, isFalse);
  });

  test('spatial job failure is non-fatal: tour stays published and viewable',
      () async {
    setUpQueue(spatialAiEnabled: true);
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano);
    api.spatialPollResults.add({
      'id': 'spatial-job-1',
      'status': 'failed',
      'error_message': 'AI provider unavailable',
    });

    await queue.enqueue(assets['a1']!);
    await queue.pump();
    await queue.pump();

    final done = assets['a1']!;
    // Regression: AI failure never hides or breaks the published tour.
    expect(done.status, AssetStatus.ready);
    expect(done.published, isTrue);
    expect(done.canViewTour, isTrue);
    expect(done.spatialAiPending, isFalse);
    expect(done.spatialAiFailed, isTrue);
    final jobs = await store.readAll('upload_queue');
    final spatialJob = jobs.singleWhere((j) => j['kind'] == 'spatial');
    expect(spatialJob['step'], 'spatialFailed');
  });

  test('retry after spatial failure re-requests and recovers', () async {
    setUpQueue(spatialAiEnabled: true);
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano);
    api.spatialPollResults.add({'id': 'spatial-job-1', 'status': 'failed'});

    await queue.enqueue(assets['a1']!);
    await queue.pump();
    await queue.pump();
    expect(assets['a1']!.spatialAiFailed, isTrue);

    // Manual retry: a fresh spatial job is requested and completes.
    api.spatialPollResults.add({
      'id': 'spatial-job-2',
      'status': 'completed',
      'result': {
        'quality': {'overall_score': 91.0},
      },
    });
    await queue.retry('a1');
    await queue.pump();
    await queue.pump();

    expect(api.spatialRequests.length, 2);
    final done = assets['a1']!;
    expect(done.spatialAiFailed, isFalse);
    expect(done.spatialQualityScore, 91.0);
    expect(done.canViewTour, isTrue);
  });

  test('resumes polling an existing spatial job without re-requesting',
      () async {
    setUpQueue(spatialAiEnabled: true);
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano, tourId: 'tour-1');
    // Simulate a crash after the request landed: job id persisted, step
    // still 'requestSpatial'.
    await store.upsert('upload_queue', {
      'id': 'spatial-a1',
      'kind': 'spatial',
      'assetId': 'a1',
      'step': 'requestSpatial',
      'attempts': 0,
      'spatialJobId': 'spatial-job-1',
    });
    api.spatialPollResults.add({
      'id': 'spatial-job-1',
      'status': 'completed',
      'result': {
        'quality': {'overall_score': 77.0},
      },
    });

    await queue.pump();
    await queue.pump();

    expect(api.calls.where((c) => c == 'requestSpatial'), isEmpty);
    expect(assets['a1']!.spatialQualityScore, 77.0);
  });

  test('poll give-up marks spatialAiFailed but keeps the tour live', () async {
    setUpQueue(spatialAiEnabled: true);
    final pano = await writePano();
    assets['a1'] = makeAsset('a1', panoPath: pano);
    // The fake returns 'processing' forever: the poll budget is exhausted.
    await queue.enqueue(assets['a1']!);
    // Drive the drain until the spatial job reaches its terminal state.
    var spatialDone = false;
    for (var i = 0; i < 200 && !spatialDone; i++) {
      await queue.pump();
      await Future<void>.delayed(const Duration(milliseconds: 1));
      final jobs = await store.readAll('upload_queue');
      spatialDone = jobs.any(
        (j) => j['kind'] == 'spatial' && j['step'] == 'spatialFailed',
      );
    }

    final done = assets['a1']!;
    expect(done.spatialAiFailed, isTrue);
    expect(done.status, AssetStatus.ready);
    expect(done.canViewTour, isTrue);
    final jobs = await store.readAll('upload_queue');
    final spatialJob = jobs.singleWhere((j) => j['kind'] == 'spatial');
    expect(spatialJob['step'], 'spatialFailed');
  });

  test('sends capture metrics with the spatial request', () async {
    setUpQueue(spatialAiEnabled: true);
    final pano = await writePano();
    assets['a1'] = ScanAsset(
      id: 'a1',
      ownerId: 'u1',
      name: 'Room a1',
      status: AssetStatus.stitching,
      createdAt: DateTime(2026, 7, 23),
      panoramaPath: pano,
      remoteSceneId: 'scene-1',
      captureCoveragePercent: 96.2,
      captureSeamScore: 81.0,
      captureExposureScore: 88.0,
      captureSharpnessScore: 60.0,
      captureFrameCount: 24,
      captureLowQualityCount: 2,
      capturePlanTargetCount: 24,
      captureSkippedCount: 1,
    );
    api.spatialPollResults.add({
      'id': 'spatial-job-1',
      'status': 'completed',
      'result': {
        'quality': {'overall_score': 90.0},
      },
    });

    await queue.enqueue(assets['a1']!);
    await queue.pump();
    await queue.pump();

    final entry = api.spatialRequests.single['captureMetrics'] as List;
    final first = Map<String, dynamic>.from(entry.single as Map);
    expect(first['scene_id'], 'scene-1');
    expect(first['coverage_percent'], 96.2);
    expect(first['seam_score'], 81.0);
    expect((first['low_quality'] as Map)['total'], 24);
    expect((first['low_quality'] as Map)['low_quality'], 2);
    expect((first['skipped'] as Map)['total'], 24);
    expect((first['skipped'] as Map)['skipped'], 1);
  });

  test('ScanAsset round-trips capture metrics and spatial state', () {
    final asset = ScanAsset(
      id: 'a1',
      ownerId: 'u1',
      name: 'Room',
      status: AssetStatus.ready,
      createdAt: DateTime(2026, 7, 23),
      captureCoveragePercent: 96.2,
      captureSeamScore: 81.0,
      captureExposureScore: 88.0,
      captureSharpnessScore: 60.0,
      captureFrameCount: 24,
      captureLowQualityCount: 2,
      capturePlanTargetCount: 24,
      captureSkippedCount: 1,
      spatialAiPending: true,
      spatialAiFailed: false,
      spatialQualityScore: 88.4,
      published: true,
    );

    final restored = ScanAsset.fromJson(asset.toJson());
    expect(restored.captureCoveragePercent, 96.2);
    expect(restored.captureSeamScore, 81.0);
    expect(restored.captureExposureScore, 88.0);
    expect(restored.captureSharpnessScore, 60.0);
    expect(restored.captureFrameCount, 24);
    expect(restored.captureLowQualityCount, 2);
    expect(restored.capturePlanTargetCount, 24);
    expect(restored.captureSkippedCount, 1);
    expect(restored.spatialAiPending, isTrue);
    expect(restored.spatialAiFailed, isFalse);
    expect(restored.spatialQualityScore, 88.4);
  });

  test('legacy ScanAsset JSON defaults the new fields safely', () {
    final restored = ScanAsset.fromJson({
      'id': 'a1',
      'ownerId': 'u1',
      'name': 'Room',
      'status': 'ready',
      'createdAt': '2026-07-23T00:00:00.000Z',
      'published': true,
    });
    expect(restored.captureCoveragePercent, isNull);
    expect(restored.captureFrameCount, isNull);
    expect(restored.spatialAiPending, isFalse);
    expect(restored.spatialAiFailed, isFalse);
    expect(restored.spatialQualityScore, isNull);
    expect(restored.published, isTrue);
  });
}
