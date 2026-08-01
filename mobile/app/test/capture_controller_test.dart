import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/api/backend_api.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/storage/local_store.dart';
import 'package:tours360/core/upload/upload_queue.dart';
import 'package:tours360/features/assets/data/local_asset_repository.dart';
import 'package:tours360/features/capture/domain/capture_targets.dart';
import 'package:tours360/features/capture/domain/stitcher_service.dart';
import 'package:tours360/features/capture/presentation/capture_controller.dart';

class _FakeStitcher extends StitcherService {
  _FakeStitcher({required this.outDir, this.fail = false});

  final String outDir;
  final bool fail;

  @override
  Future<StitchResult> stitch({
    required List<String> framePaths,
    required List<FrameOrientation> orientations,
    required String outDir,
    bool preferDevice = true,
  }) async {
    if (fail) throw StateError('stitch boom');
    final pano = '$outDir/panorama.jpg';
    await File(pano).writeAsBytes([0xFF, 0xD8, 0xFF, 0xD9]);
    await File('$outDir/thumb.jpg').writeAsBytes([0xFF, 0xD8, 0xFF, 0xD9]);
    return StitchResult(panoramaPath: pano, thumbnailPath: '$outDir/thumb.jpg');
  }
}

class _FakeApi extends BackendApi {
  _FakeApi() : super(Dio());

  final calls = <String>[];

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
    calls.add('createScene');
    return {'id': 'scene-1', 'image_url': imageUrl};
  }

  @override
  Future<Map<String, dynamic>> publishTour(String tourId) async {
    calls.add('publish');
    return {'id': tourId, 'status': 'published', 'short_code': 'abc12'};
  }
}

void main() {
  late ProviderContainer container;
  late CaptureController controller;

  setUp(() {
    container = ProviderContainer();
    controller = container.read(captureControllerProvider.notifier);
  });

  tearDown(() => container.dispose());

  test('skip on last target with too few frames sets needMoreShots', () {
    controller.setStateForTest(CaptureState(
      phase: CapturePhase.aiming,
      targetIndex: kCaptureTargets.length - 1,
      framePaths: const ['a', 'b', 'c'],
    ));
    controller.skipTarget();
    final state = container.read(captureControllerProvider);
    expect(state.phase, CapturePhase.aiming);
    expect(state.needMoreShots, isTrue);
    expect(state.targetIndex, kCaptureTargets.length - 1);
  });

  test('skip on last target with >= 4 frames goes to review', () {
    controller.setStateForTest(CaptureState(
      phase: CapturePhase.aiming,
      targetIndex: kCaptureTargets.length - 1,
      framePaths: const ['a', 'b', 'c', 'd'],
    ));
    controller.skipTarget();
    final state = container.read(captureControllerProvider);
    expect(state.phase, CapturePhase.review);
    expect(state.needMoreShots, isFalse);
  });

  test('skip mid-sequence advances targetIndex without review', () {
    controller.setStateForTest(const CaptureState(
      phase: CapturePhase.aiming,
      targetIndex: 2,
      framePaths: ['a'],
    ));
    controller.skipTarget();
    final state = container.read(captureControllerProvider);
    expect(state.phase, CapturePhase.aiming);
    expect(state.targetIndex, 3);
    expect(state.needMoreShots, isFalse);
  });

  group('retryStitch', () {
    late Directory dir;
    late LocalStore store;
    late LocalAssetRepository repo;
    late UploadQueue queue;

    setUp(() async {
      dir = await Directory.systemTemp.createTemp('retry_test');
      store = LocalStore(dir);
      // Lazy closures: the queue and the repo are mutually wired, exactly
      // like main.dart's composition root.
      queue = UploadQueue(
        store,
        _FakeApi(),
        getAsset: (id) => repo.getAsset(id),
        saveAsset: (a) => repo.saveAsset(a),
        getRooms: (assetId) => repo.getRooms(assetId),
        saveRoom: (r) => repo.saveRoom(r),
        connectivityChanges: const Stream.empty(),
      );
      repo = LocalAssetRepository(store, enqueue: queue.enqueue);
    });

    tearDown(() => dir.delete(recursive: true));

    ScanAsset failedAsset() => ScanAsset(
          id: 'a1',
          ownerId: 'u1',
          name: 'Room a1',
          status: AssetStatus.failed,
          createdAt: DateTime(2026, 7, 23),
          framePaths: ['${dir.path}/frame_0.jpg'],
          frameOrientations: const [FrameOrientation(yaw: 0, pitch: 0)],
        );

    test('re-stitches a failed asset and enqueues the upload', () async {
      await repo.saveAsset(failedAsset());
      final error = await retryStitch(
        asset: failedAsset(),
        assets: repo,
        queue: queue,
        outDir: '${dir.path}/out',
        stitcher: _FakeStitcher(outDir: '${dir.path}/out'),
      );
      expect(error, isNull);
      final saved = await repo.getAsset('a1');
      expect(saved!.status, AssetStatus.stitching);
      expect(saved.panoramaPath, '${dir.path}/out/panorama.jpg');
      // The enqueued job runs the full pipeline to ready.
      await queue.pump();
      expect((await repo.getAsset('a1'))!.status, AssetStatus.ready);
    });

    test('surfaces a clear message when stitching fails again', () async {
      await repo.saveAsset(failedAsset());
      final error = await retryStitch(
        asset: failedAsset(),
        assets: repo,
        queue: queue,
        outDir: '${dir.path}/out',
        stitcher: _FakeStitcher(outDir: '${dir.path}/out', fail: true),
      );
      expect(error, contains('Stitching failed'));
      expect(error, contains('stitch boom'));
      expect((await repo.getAsset('a1'))!.status, AssetStatus.failed);
    });

    test('refuses an asset without captured frames', () async {
      await repo.saveAsset(failedAsset().copyWith(framePaths: []));
      final error = await retryStitch(
        asset: failedAsset().copyWith(framePaths: []),
        assets: repo,
        queue: queue,
      );
      expect(error, contains('No captured frames'));
      expect((await repo.getAsset('a1'))!.status, AssetStatus.failed);
    });
  });

  group('sweepOrphanedCaptures', () {
    test('deletes only old, unreferenced capture directories', () async {
      final dir = await Directory.systemTemp.createTemp('sweep_test');
      addTearDown(() => dir.delete(recursive: true));
      final captures = Directory('${dir.path}/captures');

      // Session dirs are named with their creation epoch-ms (the same scheme
      // capture_controller uses); old sessions get small/old timestamps.
      final oldOrphan = Directory('${captures.path}/1111');
      await oldOrphan.create(recursive: true);
      await File('${oldOrphan.path}/frame_0.jpg').writeAsBytes([1]);

      final young = Directory(
          '${captures.path}/${DateTime.now().millisecondsSinceEpoch}');
      await young.create(recursive: true);
      await File('${young.path}/frame_0.jpg').writeAsBytes([1]);

      final oldReferenced = Directory('${captures.path}/3333');
      await oldReferenced.create(recursive: true);
      final refPath = '${oldReferenced.path}/frame_0.jpg';
      await File(refPath).writeAsBytes([1]);

      final store = LocalStore(dir);
      await store.upsert('assets', {
        'id': 'a1',
        'ownerId': 'u1',
        'name': 'n',
        'type': 'pano360',
        'status': 'ready',
        'createdAt': DateTime(2026, 7, 23).toIso8601String(),
        'framePaths': [refPath],
      });

      await sweepOrphanedCaptures(store: store, docsDir: dir);

      expect(await oldOrphan.exists(), isFalse,
          reason: 'old + unreferenced capture dirs are swept');
      expect(await young.exists(), isTrue,
          reason: 'fresh sessions must never be swept');
      expect(await oldReferenced.exists(), isTrue,
          reason: 'frames referenced by an asset are kept for cloud re-stitch');
    });
  });
}
