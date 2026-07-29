import 'dart:io';

import 'package:dio/dio.dart';

/// Thin typed wrappers over the 360ghar backend (see 360ghar-backend repo).
/// Every call assumes the dio client already carries the Supabase JWT.
class BackendApi {
  BackendApi(this._dio);

  final Dio _dio;

  // ---- Tours -------------------------------------------------------------

  Future<Map<String, dynamic>> createTour({
    required String title,
    String? description,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>('/tours', data: {
      'title': title,
      'description': ?description,
      'visibility': 'unlisted',
      'is_public': true,
    });
    return res.data ?? {};
  }

  Future<Map<String, dynamic>> getTour(String tourId) async {
    final res = await _dio.get<Map<String, dynamic>>('/tours/$tourId');
    return res.data ?? {};
  }

  Future<Map<String, dynamic>> publishTour(String tourId) async {
    final res =
        await _dio.post<Map<String, dynamic>>('/tours/$tourId/publish');
    return res.data ?? {};
  }

  Future<void> deleteTour(String tourId) => _dio.delete('/tours/$tourId');

  Future<Map<String, dynamic>> getAnalytics(String tourId) async {
    final res =
        await _dio.get<Map<String, dynamic>>('/tours/$tourId/analytics');
    return res.data ?? {};
  }

  Future<List<int>> getQrCode(String tourId) async {
    final res = await _dio.get<List<int>>(
      '/tours/$tourId/qr-code',
      options: Options(responseType: ResponseType.bytes),
    );
    return res.data ?? <int>[];
  }

  // ---- Scenes & hotspots ---------------------------------------------------

  Future<Map<String, dynamic>> createScene({
    required String tourId,
    required String imageUrl,
    String? title,
    int? orderIndex,
  }) async {
    final res = await _dio
        .post<Map<String, dynamic>>('/tours/$tourId/scenes', data: {
      'image_url': imageUrl,
      'title': ?title,
      'order_index': ?orderIndex,
    });
    return res.data ?? {};
  }

  Future<Map<String, dynamic>> createHotspot({
    required String sceneId,
    required double yaw,
    required double pitch,
    required String targetSceneId,
    String? title,
  }) async {
    final res = await _dio
        .post<Map<String, dynamic>>('/scenes/$sceneId/hotspots', data: {
      'type': 'navigation',
      'position': {'yaw': yaw, 'pitch': pitch},
      'target_scene_id': targetSceneId,
      'title': ?title,
    });
    return res.data ?? {};
  }

  Future<void> deleteHotspot(String hotspotId) =>
      _dio.delete('/hotspots/$hotspotId');

  Future<void> deleteScene(String sceneId) =>
      _dio.delete('/scenes/$sceneId');

  // ---- Floor plans ---------------------------------------------------------

  Future<List<dynamic>> getFloorPlans(String tourId) async {
    final res = await _dio.get<dynamic>('/tours/$tourId/floor-plans');
    final data = res.data;
    if (data is List) return data;
    if (data is Map && data['items'] is List) return data['items'] as List;
    return const [];
  }

  // ---- Uploads (presigned → Cloudinary → confirm) --------------------------

  /// Returns the presigned item map (upload_id, signed_url, token, api_key,
  /// timestamp, public_id, public_url).
  Future<Map<String, dynamic>> createPresignedUpload({
    required String filename,
    required String folderType, // 'tour' | 'scene' | ...
    String? tourId,
    String? sceneId,
    int? fileSize,
  }) async {
    final res =
        await _dio.post<Map<String, dynamic>>('/upload/presigned', data: {
      'files': [
        {
          'filename': filename,
          'content_type': 'image/jpeg',
          'file_size': ?fileSize,
          'folder_type': folderType,
          'tour_id': ?tourId,
          'scene_id': ?sceneId,
        }
      ],
    });
    final items = (res.data ?? {})['items'] as List? ?? const [];
    if (items.isEmpty) {
      throw StateError(
          'createPresignedUpload: backend returned no presigned items');
    }
    return Map<String, dynamic>.from(items.first as Map);
  }

  /// Direct multipart upload to Cloudinary using the presigned params.
  Future<void> uploadToCloudinary({
    required Map<String, dynamic> presigned,
    required File file,
  }) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(file.path),
      'api_key': presigned['api_key'],
      'signature': presigned['token'],
      'timestamp': presigned['timestamp'],
      'public_id': presigned['public_id'],
    });
    // Bare Dio: Cloudinary must not receive our Authorization header.
    await Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 60),
      sendTimeout: const Duration(seconds: 60),
    )).post<dynamic>(presigned['signed_url'] as String, data: form);
  }

  Future<Map<String, dynamic>> confirmUpload(String uploadId) async {
    final res =
        await _dio.post<Map<String, dynamic>>('/upload/confirm/$uploadId');
    return res.data ?? {};
  }

  // ---- AI jobs (stitch fallback, generate-3d) -------------------------------

  Future<Map<String, dynamic>> requestCloudStitch({
    required String sceneId,
    required List<String> frameUrls,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/scenes/$sceneId/stitch',
      data: {'frame_urls': frameUrls},
    );
    final m = res.data ?? {};
    return Map<String, dynamic>.from((m['job'] as Map?) ?? m);
  }

  Future<Map<String, dynamic>> generate3dWorld(String tourId) async {
    final res =
        await _dio.post<Map<String, dynamic>>('/tours/$tourId/generate-3d');
    final m = res.data ?? {};
    return Map<String, dynamic>.from((m['job'] as Map?) ?? m);
  }

  Future<Map<String, dynamic>> getAiJob(String jobId) async {
    final res = await _dio.get<Map<String, dynamic>>('/ai/jobs/$jobId');
    final m = res.data ?? {};
    final job = Map<String, dynamic>.from((m['job'] as Map?) ?? m);
    if (m['result'] is Map) {
      job['result'] = m['result'];
    }
    return job;
  }

  // ---- Auth helpers ----------------------------------------------------------

  /// Public endpoint returning Google client IDs for native sign-in.
  Future<Map<String, dynamic>> getAuthConfig() async {
    final res = await _dio.get<Map<String, dynamic>>('/auth/config');
    return res.data ?? {};
  }
}
