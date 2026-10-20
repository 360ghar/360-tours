import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:tours360/core/api/api_exception.dart';
import 'package:tours360/core/api/backend_api.dart';
import 'package:tours360/core/models/api_dtos.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/models/wire_enums.dart';
import 'package:tours360/core/repositories/repositories.dart';
import 'package:tours360/core/storage/local_store.dart';
import 'package:tours360/features/assets/data/local_asset_repository.dart';

/// In-memory [LocalStore] — deterministic for widget tests (no disk IO).
/// Mirrors LocalStore's broadcast semantics: every write re-emits the full
/// list to watchers.
class InMemoryStore extends LocalStore {
  InMemoryStore() : super(Directory(''));

  final Map<String, List<Map<String, dynamic>>> _data = {};
  final Map<String, StreamController<List<Map<String, dynamic>>>>
      _controllers = {};

  @override
  Future<List<Map<String, dynamic>>> readAll(String collection) async =>
      List.of(_data[collection] ?? const []);

  @override
  Future<void> writeAll(
      String collection, List<Map<String, dynamic>> items) async {
    _data[collection] = List.of(items);
    _controllers[collection]?.add(List.of(items));
  }

  @override
  Future<void> upsert(String collection, Map<String, dynamic> item) async {
    final items =
        List<Map<String, dynamic>>.from(_data[collection] ?? const []);
    final i = items.indexWhere((e) => e['id'] == item['id']);
    if (i >= 0) {
      items[i] = item;
    } else {
      items.add(item);
    }
    await writeAll(collection, items);
  }

  @override
  Future<void> delete(String collection, String id) async {
    final items =
        List<Map<String, dynamic>>.from(_data[collection] ?? const []);
    items.removeWhere((e) => e['id'] == id);
    await writeAll(collection, items);
  }

  @override
  Stream<List<Map<String, dynamic>>> watch(String collection) {
    final controller =
        _controllers.putIfAbsent(collection, StreamController.broadcast);
    late final StreamController<List<Map<String, dynamic>>> seeded;
    StreamSubscription<List<Map<String, dynamic>>>? sub;
    seeded = StreamController<List<Map<String, dynamic>>>(
      onListen: () async {
        seeded.add(List.of(_data[collection] ?? const []));
        sub = controller.stream.listen(seeded.add);
      },
      onCancel: () {
        sub?.cancel();
        sub = null;
      },
    );
    return seeded.stream;
  }
}

/// In-memory asset repository backed by [InMemoryStore]. Extends
/// [LocalAssetRepository] so the concrete methods (room-job watch, 3D job
/// persistence, room retry) are available to screens under test.
class FakeAssetRepository extends LocalAssetRepository {
  FakeAssetRepository() : super(InMemoryStore());
}

/// Minimal auth repository: no session, no events. Screens under test only
/// read `currentUser` (assetProvider skips the tick stream when null).
class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({this.user});

  AppUser? user;

  @override
  AppUser? get currentUser => user;

  @override
  Stream<AppUser?> authStateChanges() => const Stream.empty();

  @override
  Future<AppUser> signInWithEmail(String email, String password) =>
      throw UnimplementedError();

  @override
  Future<AppUser> signUpWithEmail(String email, String password) =>
      throw UnimplementedError();

  @override
  Future<AppUser> signInWithApple() => throw UnimplementedError();

  @override
  Future<AppUser> signInWithGoogle() => throw UnimplementedError();

  @override
  Future<void> signOut() async {}
}

/// Scriptable [BackendApi]: records every call and answers with typed DTOs.
/// Set the public fields to make a call fail or answer differently.
class FakeBackendApi extends BackendApi {
  FakeBackendApi() : super(Dio());

  final calls = <String>[];
  final folderTypes = <StorageFolderType>[];

  /// `Idempotency-Key` of each create call, in call order.
  final tourKeys = <String?>[];
  final sceneKeys = <String?>[];

  /// Scenes `getTour` reports (the lookup after a lost create response).
  final tourScenes = <SceneDto>[];

  /// Statuses `getAiJob` returns in order. The last one repeats.
  final jobStatuses = <AIJobStatus>[AIJobStatus.completed];
  String? jobError;

  int _scenesCreated = 0;

  /// Hotspots `getHotspots` returns, for any scene.
  final hotspotList = <HotspotDto>[];

  /// Floor plans `getFloorPlans` returns, for any tour. `generateFloorPlan`
  /// appends the plan it answers with, so a refetch sees the new row.
  final floorPlanList = <FloorPlanDto>[];

  /// Plan `generateFloorPlan` answers with; null uses a canned AI-estimated one.
  FloorPlanDto? generatedFloorPlan;

  /// Thrown (once) by `generateFloorPlan`.
  Object? generateFloorPlanError;

  /// Thrown (once) by `updateHotspot`, `createHotspot` and `deleteHotspot`.
  Object? updateError;
  Object? createError;
  Object? deleteError;

  /// `updateHotspot` answers with no target, as the server does for a hotspot
  /// that is not a navigation hotspot.
  bool updateDropsTarget = false;

  bool failPublishOnce = false;
  bool failWithAuth = false;
  bool failScene = false;

  /// Thrown by `createTour`, `createScene` or `uploadToCloudinary` when set.
  Object? tourError;
  Object? sceneError;
  Object? uploadError;

  @override
  Future<TourDto> createTour({
    required String title,
    String? description,
    String? idempotencyKey,
  }) async {
    tourKeys.add(idempotencyKey);
    if (failWithAuth) throw const ApiException(statusCode: 401, message: 'no');
    final error = tourError;
    if (error != null) throw error;
    calls.add('createTour');
    return TourDto(
      id: 'tour-1',
      title: title,
      status: TourStatus.draft,
      visibility: TourVisibility.unlisted,
      shortCode: null,
    );
  }

  @override
  Future<PresignedUploadDto> createPresignedUpload({
    required String filename,
    required StorageFolderType folderType,
    required String tourId,
    required int fileSize,
    String? sceneId,
  }) async {
    calls.add('presign');
    folderTypes.add(folderType);
    return const PresignedUploadDto(
      uploadId: 'up-1',
      signedUrl: 'https://cloudinary.example/upload',
      signature: 'sig',
      apiKey: 'key',
      timestamp: 1,
      publicId: 'pid',
      path: 'p',
      publicUrl: 'https://res.cloudinary.example/pano.jpg',
    );
  }

  @override
  Future<void> uploadToCloudinary({
    required PresignedUploadDto presigned,
    required File file,
  }) async {
    final error = uploadError;
    if (error != null) {
      uploadError = null;
      throw error;
    }
    calls.add('putCloudinary');
  }

  @override
  Future<UploadConfirmDto> confirmUpload(String uploadId) async {
    calls.add('confirm:$uploadId');
    return const UploadConfirmDto(
      mediaId: 'm-1',
      fileUrl: 'https://res.cloudinary.example/pano.jpg',
      uploadStatus: UploadStatus.complete,
    );
  }

  @override
  Future<TourDetailDto> getTour(String tourId) async {
    calls.add('getTour');
    return TourDetailDto(
      tour: TourDto(
        id: tourId,
        title: 't',
        status: TourStatus.draft,
        visibility: TourVisibility.unlisted,
        shortCode: null,
      ),
      mainSceneId: tourScenes.isEmpty ? null : tourScenes.first.id,
      scenes: List.of(tourScenes),
      floorPlans: const [],
    );
  }

  @override
  Future<SceneDto> createScene({
    required String tourId,
    required String imageUrl,
    String? title,
    String? idempotencyKey,
  }) async {
    sceneKeys.add(idempotencyKey);
    if (failScene) throw Exception('scene boom');
    final error = sceneError;
    if (error != null) {
      sceneError = null;
      throw error;
    }
    calls.add('createScene:$tourId');
    return SceneDto(
      id: 'scene-${++_scenesCreated}',
      tourId: tourId,
      title: title,
      imageUrl: imageUrl,
      orderIndex: 0,
    );
  }

  @override
  Future<TourDto> publishTour(String tourId) async {
    if (failPublishOnce) {
      failPublishOnce = false;
      throw const ApiException(statusCode: 500, message: 'publish boom');
    }
    calls.add('publish:$tourId');
    return TourDto(
      id: tourId,
      title: 't',
      status: TourStatus.published,
      visibility: TourVisibility.unlisted,
      shortCode: 'abc12',
    );
  }

  @override
  Future<AiJobSnapshotDto> requestCloudStitch({
    required String sceneId,
    required List<String> frameUrls,
  }) async {
    calls.add('requestStitch:$sceneId:${frameUrls.length}');
    return const AiJobSnapshotDto(
      job: AiJobDto(
        id: 'job-1',
        jobType: AIJobType.panoramaStitch,
        status: AIJobStatus.pending,
        progress: 0,
        errorMessage: null,
      ),
    );
  }

  @override
  Future<AiJobSnapshotDto> getAiJob(String jobId) async {
    calls.add('getAiJob');
    final status =
        jobStatuses.length > 1 ? jobStatuses.removeAt(0) : jobStatuses.first;
    return AiJobSnapshotDto(
      job: AiJobDto(
        id: jobId,
        jobType: AIJobType.panoramaStitch,
        status: status,
        progress: 0,
        errorMessage: status == AIJobStatus.failed ? jobError : null,
      ),
    );
  }

  @override
  Future<List<HotspotDto>> getHotspots(String sceneId) async {
    calls.add('getHotspots:$sceneId');
    return List.of(hotspotList);
  }

  @override
  Future<HotspotDto> createHotspot({
    required String sceneId,
    required double yaw,
    required double pitch,
    required String targetSceneId,
    String? title,
  }) async {
    final error = createError;
    if (error != null) {
      createError = null;
      throw error;
    }
    calls.add('createHotspot:$sceneId:$targetSceneId');
    return HotspotDto(
      id: 'h-new',
      sceneId: sceneId,
      type: HotspotType.navigation,
      title: title,
      yawDeg: yaw,
      pitchDeg: pitch,
      targetSceneId: targetSceneId,
      isActive: true,
    );
  }

  @override
  Future<HotspotDto> updateHotspot(
    String hotspotId, {
    required String targetSceneId,
    String? title,
  }) async {
    final error = updateError;
    if (error != null) {
      updateError = null;
      throw error;
    }
    calls.add('updateHotspot:$hotspotId:$targetSceneId');
    return HotspotDto(
      id: hotspotId,
      sceneId: 'scene-main',
      type: HotspotType.navigation,
      title: title,
      yawDeg: 10,
      pitchDeg: 0,
      targetSceneId: updateDropsTarget ? null : targetSceneId,
      isActive: true,
    );
  }

  @override
  Future<void> deleteHotspot(String hotspotId) async {
    final error = deleteError;
    if (error != null) {
      deleteError = null;
      throw error;
    }
    calls.add('deleteHotspot:$hotspotId');
  }

  @override
  Future<List<FloorPlanDto>> getFloorPlans(String tourId) async {
    calls.add('getFloorPlans:$tourId');
    return List.of(floorPlanList);
  }

  @override
  Future<FloorPlanDto> generateFloorPlan(String tourId) async {
    final error = generateFloorPlanError;
    if (error != null) {
      generateFloorPlanError = null;
      throw error;
    }
    calls.add('generateFloorPlan:$tourId');
    final plan = generatedFloorPlan ??
        const FloorPlanDto(
          id: 'fp-generated',
          tourId: 'tour-1',
          name: 'Estimated layout (AI)',
          imageUrl: 'https://cdn.example.com/estimated.png',
          floorNumber: 1,
          markers: [
            FloorPlanMarkerDto(
                sceneId: 'scene-main', x: 30, y: 40, label: 'Living room'),
          ],
        );
    floorPlanList.add(plan);
    return plan;
  }
}
