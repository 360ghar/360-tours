import 'dart:io';

import 'package:dio/dio.dart';

import '../models/api_dtos.dart';
import '../models/wire_enums.dart';
import 'api_exception.dart';

/// Typed wrappers over the 360ghar backend (see 360ghar-backend repo). Every
/// call assumes the dio client already carries the Supabase JWT.
///
/// Contract rules held here:
/// - Every response is parsed into a DTO (`core/models/api_dtos.dart`).
/// - Every failure is thrown as an [ApiException] read from the error envelope
///   `{"error": {"code", "message", "details"}}`.
/// - Lists are `CursorPage`s: [getHotspots] and [getFloorPlans] follow
///   `next_cursor` until `has_more` is false (limit 100).
/// - Bodies carry only keys the OpenAPI request schema declares (the backend
///   answers 422 to any other key). PATCH sends only the keys that change.
/// - Creates carry an `Idempotency-Key` when the caller passes one. The key
///   stays the same on every retry of the same job step.
class BackendApi {
  BackendApi(this._dio);

  final Dio _dio;

  static const _pageLimit = 100;

  /// Upper bound on pages for one list. A cursor loop must not run forever.
  static const _maxPages = 50;

  /// Runs [request], maps a failure to [ApiException] and parses a success.
  Future<T> _send<T>(
    Future<Response<dynamic>> Function() request,
    T Function(dynamic data) parse,
  ) async {
    final Response<dynamic> res;
    try {
      res = await request();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
    try {
      return parse(res.data);
    } on FormatException catch (e) {
      throw ApiException.badResponse(res.statusCode, e.message);
    } on TypeError catch (e) {
      throw ApiException.badResponse(res.statusCode, '$e');
    }
  }

  Future<void> _sendVoid(Future<Response<dynamic>> Function() request) =>
      _send<void>(request, (_) {});

  /// Reads every page of a `CursorPage` list.
  Future<List<T>> _listAll<T>(
    String path,
    T Function(Map<String, dynamic>) parse,
  ) async {
    final out = <T>[];
    String? cursor;
    for (var i = 0; i < _maxPages; i++) {
      final page = await _send(
        () => _dio.get<dynamic>(
          path,
          queryParameters: {'limit': _pageLimit, 'cursor': ?cursor},
        ),
        (data) => CursorPage.fromJson(data, parse),
      );
      out.addAll(page.items);
      final next = page.nextCursor;
      if (!page.hasMore || next == null) return out;
      cursor = next;
    }
    throw const ApiException(
      code: 'TOO_MANY_PAGES',
      message: 'The list is too long to load in the app.',
    );
  }

  static Options? _idempotency(String? key) =>
      key == null ? null : Options(headers: {'Idempotency-Key': key});

  // ---- Tours -------------------------------------------------------------

  Future<TourDto> createTour({
    required String title,
    String? description,
    String? idempotencyKey,
  }) =>
      _send(
        () => _dio.post<dynamic>(
          '/tours',
          data: {
            'title': clampName(title),
            'description': ?description,
            // The backend derives is_public from visibility. Do not send it.
            'visibility': TourVisibility.unlisted.toJson(),
          },
          options: _idempotency(idempotencyKey),
        ),
        (data) => TourDto.fromJson(asJsonMap(data, 'tour')),
      );

  Future<TourDetailDto> getTour(String tourId) => _send(
        () => _dio.get<dynamic>('/tours/$tourId'),
        (data) => TourDetailDto.fromJson(asJsonMap(data, 'tour')),
      );

  Future<TourDto> publishTour(String tourId) => _send(
        () => _dio.post<dynamic>('/tours/$tourId/publish'),
        (data) => TourDto.fromJson(asJsonMap(data, 'tour')),
      );

  Future<void> deleteTour(String tourId) =>
      _sendVoid(() => _dio.delete<dynamic>('/tours/$tourId'));

  Future<TourAnalyticsDto> getAnalytics(String tourId) => _send(
        () => _dio.get<dynamic>('/tours/$tourId/analytics'),
        (data) => TourAnalyticsDto.fromJson(asJsonMap(data, 'analytics')),
      );

  Future<List<int>> getQrCode(String tourId) => _send(
        () => _dio.get<List<int>>(
          '/tours/$tourId/qr-code',
          options: Options(responseType: ResponseType.bytes),
        ),
        (data) => data is List<int> ? data : const <int>[],
      );

  // ---- Scenes & hotspots ---------------------------------------------------

  /// The server appends the scene. `order_index` is not a request key.
  Future<SceneDto> createScene({
    required String tourId,
    required String imageUrl,
    String? title,
    String? idempotencyKey,
  }) =>
      _send(
        () => _dio.post<dynamic>(
          '/tours/$tourId/scenes',
          data: {
            'image_url': imageUrl,
            'title': ?(title == null ? null : clampName(title)),
          },
          options: _idempotency(idempotencyKey),
        ),
        (data) => SceneDto.fromJson(asJsonMap(data, 'scene')),
      );

  Future<HotspotDto> createHotspot({
    required String sceneId,
    required double yaw,
    required double pitch,
    required String targetSceneId,
    String? title,
  }) =>
      _send(
        () => _dio.post<dynamic>(
          '/scenes/$sceneId/hotspots',
          data: {
            'type': HotspotType.navigation.toJson(),
            'position': {'yaw': yaw, 'pitch': pitch},
            'target_scene_id': targetSceneId,
            'title': ?(title == null ? null : clampName(title)),
          },
        ),
        (data) => HotspotDto.fromJson(asJsonMap(data, 'hotspot')),
      );

  /// One PATCH that moves a hotspot to another scene. Only the changed keys
  /// are sent.
  Future<HotspotDto> updateHotspot(
    String hotspotId, {
    required String targetSceneId,
    String? title,
  }) =>
      _send(
        () => _dio.patch<dynamic>(
          '/hotspots/$hotspotId',
          data: {
            'target_scene_id': targetSceneId,
            'title': ?(title == null ? null : clampName(title)),
          },
        ),
        (data) => HotspotDto.fromJson(asJsonMap(data, 'hotspot')),
      );

  /// Every hotspot of a scene (all pages).
  Future<List<HotspotDto>> getHotspots(String sceneId) =>
      _listAll('/scenes/$sceneId/hotspots', HotspotDto.fromJson);

  Future<void> deleteHotspot(String hotspotId) =>
      _sendVoid(() => _dio.delete<dynamic>('/hotspots/$hotspotId'));

  Future<void> deleteScene(String sceneId) =>
      _sendVoid(() => _dio.delete<dynamic>('/scenes/$sceneId'));

  // ---- Floor plans ---------------------------------------------------------

  /// Floor plans of the tour (the `floor_plans` table; `settings.floor_plans`
  /// no longer exists).
  Future<List<FloorPlanDto>> getFloorPlans(String tourId) =>
      _listAll('/tours/$tourId/floor-plans', FloorPlanDto.fromJson);

  /// Draws a schematic plan from the tour's analyzed rooms and doorway links and
  /// returns it. No body: the server owns the layout, and generating again
  /// replaces the previous AI-estimated plan instead of adding another.
  Future<FloorPlanDto> generateFloorPlan(String tourId) => _send(
        () => _dio.post<dynamic>('/tours/$tourId/floor-plans/generate'),
        (data) => FloorPlanDto.fromJson(asJsonMap(data, 'floor plan')),
      );

  // ---- Uploads (presigned → Cloudinary → confirm) --------------------------

  /// `file_size` is required by the backend and checked again on confirm.
  Future<PresignedUploadDto> createPresignedUpload({
    required String filename,
    required StorageFolderType folderType,
    required String tourId,
    required int fileSize,
    String? sceneId,
  }) async {
    final items = await _send(
      () => _dio.post<dynamic>(
        '/upload/presigned',
        data: {
          'files': [
            {
              'filename': filename,
              'content_type': 'image/jpeg',
              'file_size': fileSize,
              'folder_type': folderType.toJson(),
              'tour_id': tourId,
              'scene_id': ?sceneId,
            },
          ],
        },
      ),
      (data) => [
        for (final item in (asJsonMap(data, 'presign')['items'] as List? ??
            const []))
          PresignedUploadDto.fromJson(asJsonMap(item, 'presign item')),
      ],
    );
    if (items.isEmpty) {
      throw ApiException.badResponse(201, 'no presigned item');
    }
    return items.first;
  }

  /// Direct multipart upload to Cloudinary using the presigned params.
  Future<void> uploadToCloudinary({
    required PresignedUploadDto presigned,
    required File file,
  }) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(file.path),
      ...signedUploadFields(presigned),
    });
    try {
      // Bare Dio: Cloudinary must not receive our Authorization header.
      await Dio(BaseOptions(
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 60),
        sendTimeout: const Duration(seconds: 60),
      )).post<dynamic>(presigned.signedUrl, data: form);
    } on DioException catch (e) {
      throw ApiException.fromDio(e, fromStorage: true);
    }
  }

  /// The signed fields Cloudinary needs next to the file. The backend names the
  /// signature `signature`. `type` is sent only when the backend returns it
  /// (the signature covers it).
  Map<String, dynamic> signedUploadFields(PresignedUploadDto presigned) => {
        'api_key': presigned.apiKey,
        'signature': presigned.signature,
        'timestamp': presigned.timestamp,
        'public_id': presigned.publicId,
        'type': ?presigned.type,
      };

  Future<UploadConfirmDto> confirmUpload(String uploadId) => _send(
        () => _dio.post<dynamic>('/upload/confirm/$uploadId'),
        (data) => UploadConfirmDto.fromJson(asJsonMap(data, 'confirm')),
      );

  // ---- AI jobs (cloud-stitch fallback) ---------------------------------------

  /// Starts a cloud stitch. The server answers 202 with the job.
  Future<AiJobSnapshotDto> requestCloudStitch({
    required String sceneId,
    required List<String> frameUrls,
  }) =>
      _send(
        () => _dio.post<dynamic>(
          '/scenes/$sceneId/stitch',
          data: {'frame_urls': frameUrls},
        ),
        (data) => AiJobSnapshotDto.fromJson(asJsonMap(data, 'job')),
      );

  /// Status of a job. The stitch outcome is read from here, never assumed.
  Future<AiJobSnapshotDto> getAiJob(String jobId) => _send(
        () => _dio.get<dynamic>('/ai/jobs/$jobId'),
        (data) => AiJobSnapshotDto.fromJson(asJsonMap(data, 'job')),
      );

  // ---- Auth helpers ----------------------------------------------------------

  /// Public endpoint returning Google client IDs for native sign-in.
  Future<AuthConfigDto> getAuthConfig() => _send(
        () => _dio.get<dynamic>('/auth/config'),
        (data) => AuthConfigDto.fromJson(asJsonMap(data, 'auth config')),
      );
}
