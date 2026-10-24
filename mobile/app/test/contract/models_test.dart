// Contract tests: parse backend-shaped fixtures with the app's DTOs.
//
// The fixtures in test/fixtures/api/ come from the backend's own Pydantic
// response models (tool/api_fixtures.py), so they carry every field, default
// and computed value the backend sends.

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/api/api_exception.dart';
import 'package:tours360/core/models/api_dtos.dart';
import 'package:tours360/core/models/wire_enums.dart';

import 'support.dart';

DioException failure(int status, Object? body) => DioException(
      requestOptions: RequestOptions(path: '/x'),
      response: Response(
        requestOptions: RequestOptions(path: '/x'),
        statusCode: status,
        data: body,
      ),
    );

void main() {
  group('tours', () {
    final data = fixture('tours');

    test('POST /tours returns a draft tour', () {
      final tour = TourDto.fromJson(obj(data['created']));
      expect(tour.id, '3f0c7a52-6a77-4a46-8f37-2c1d9e7b0a11');
      expect(tour.title, 'Flat 4B, Sector 54');
      expect(tour.status, TourStatus.draft);
      expect(tour.visibility, TourVisibility.unlisted);
      expect(tour.shortCode, isNull);
    });

    test('publish returns the short code the public link is built from', () {
      final tour = TourDto.fromJson(obj(data['published']));
      expect(tour.status, TourStatus.published);
      expect(tour.shortCode, 'aB3xZ9');
      expect(TourDto.fromJson(obj(data['published_no_short_code'])).shortCode,
          isNull);
    });

    test('GET /tours/{id} carries main_scene_id, scenes and floor plans', () {
      final tour = TourDetailDto.fromJson(obj(data['detail']));
      expect(tour.mainSceneId, '6b1d2f10-5b5e-4c0e-9d0e-0a1f6a7c1001');
      expect(tour.scenes.map((s) => s.orderIndex), [0, 1]);
      expect(tour.scenes.first.id, tour.mainSceneId);
      expect(tour.scenes.first.imageUrl, contains('/originals/'));
      expect(tour.floorPlans.single.name, 'Ground floor');
    });

    test('a caller who does not own the tour gets the public shape', () {
      final json = obj(data['detail_public']);
      expect(json.containsKey('user_id'), isFalse);
      final tour = TourDetailDto.fromJson(json);
      expect(tour.mainSceneId, '6b1d2f10-5b5e-4c0e-9d0e-0a1f6a7c1001');
      expect(tour.scenes.single.orderIndex, 0);
      expect(tour.floorPlans.single.name, 'Ground floor');
      expect(tour.tour.shortCode, 'aB3xZ9');
    });

    test('a tour with no scenes has a null main_scene_id', () {
      final tour = TourDetailDto.fromJson(obj(data['detail_empty']));
      expect(tour.mainSceneId, isNull);
      expect(tour.scenes, isEmpty);
      expect(tour.floorPlans, isEmpty);
    });

    test('analytics: views, session durations, hotspot clicks', () {
      final a = TourAnalyticsDto.fromJson(obj(data['analytics']));
      expect(a.totalViews, 41);
      expect(a.sessionDurations, [30.0, 75.5, 52.0]);
      expect(a.hotspotClicks, {'h-1': 6, 'h-2': 4});
    });

    test('an unknown status reads as null, never as a real status', () {
      final json = obj(data['created'])..['status'] = 'frozen';
      expect(TourDto.fromJson(json).status, isNull);
    });
  });

  test('scenes: POST /tours/{id}/scenes returns the scene with its order', () {
    final scene = SceneDto.fromJson(obj(fixture('scenes')['created']));
    expect(scene.id, '6b1d2f10-5b5e-4c0e-9d0e-0a1f6a7c1001');
    expect(scene.tourId, '3f0c7a52-6a77-4a46-8f37-2c1d9e7b0a11');
    expect(scene.orderIndex, 0);
  });

  group('hotspots', () {
    final data = fixture('hotspots');

    test('the list is a CursorPage that says more follows', () {
      final page = CursorPage.fromJson(data['list_page'], HotspotDto.fromJson);
      expect(page.items.map((h) => h.id), ['h-1', 'h-2']);
      expect(page.hasMore, isTrue);
      expect(page.nextCursor, isNotEmpty);
      expect(page.limit, 100);
      expect(page.total, isNull);
    });

    test('the last page ends the list', () {
      final page =
          CursorPage.fromJson(data['list_last_page'], HotspotDto.fromJson);
      expect(page.hasMore, isFalse);
      expect(page.nextCursor, isNull);
    });

    test('a navigation hotspot reads its target and position', () {
      final h = HotspotDto.fromJson(obj(data['created']));
      expect(h.type, HotspotType.navigation);
      expect(h.targetSceneId, '6b1d2f10-5b5e-4c0e-9d0e-0a1f6a7c1002');
      expect(h.yawDeg, 45.5);
      expect(h.pitchDeg, -12.25);
      expect(h.title, 'Kitchen');
    });

    test('a hotspot with no position or title still parses', () {
      final page = CursorPage.fromJson(data['list_page'], HotspotDto.fromJson);
      final bare = page.items.last;
      expect(bare.type, HotspotType.info);
      expect(bare.yawDeg, isNull);
      expect(bare.pitchDeg, isNull);
      expect(bare.title, isNull);
      expect(bare.targetSceneId, isNull);
    });

    test('PATCH returns the updated hotspot', () {
      expect(HotspotDto.fromJson(obj(data['updated'])).title, 'Bedroom');
    });
  });

  test('floor plans: a CursorPage of FloorPlanResponse', () {
    final data = fixture('floor_plans');
    final page =
        CursorPage.fromJson(data['list_page'], FloorPlanDto.fromJson);
    expect(page.items.single.name, 'Ground floor');
    expect(page.items.single.floorNumber, 1);
    expect(page.items.single.imageUrl, startsWith('https://'));
    expect(page.hasMore, isTrue);
  });

  test('floor plan markers keep their percentage position and label', () {
    final data = fixture('floor_plans');
    final plan = FloorPlanDto.fromJson(
        obj((obj(data['list_page'])['items'] as List).single));
    final marker = plan.markers.single;
    expect(marker.sceneId, '6b1d2f10-5b5e-4c0e-9d0e-0a1f6a7c1001');
    expect(marker.x, 40.5);
    expect(marker.y, 22.0);
    expect(marker.label, 'Living room');
  });

  test('a plan with no markers parses to an empty list', () {
    final plan = FloorPlanDto.fromJson(const {
      'id': 'fp-1',
      'tour_id': 't1',
      'name': 'Ground floor',
      'image_url': 'https://cdn.example.com/plan.png',
      'floor_number': 1,
    });
    expect(plan.markers, isEmpty);
  });

  group('uploads', () {
    final data = fixture('uploads');
    final items = (data['presigned'] as Map)['items'] as List;

    test('presign: every Cloudinary field is present and typed', () {
      final p = PresignedUploadDto.fromJson(obj(items.single));
      expect(p.uploadId, 'up-7f3e');
      expect(p.signature, isNotEmpty);
      expect(p.apiKey, '123456789012345');
      expect(p.timestamp, 1760520600);
      expect(p.publicId, contains('/originals/'));
      expect(p.publicUrl, startsWith('https://res.cloudinary.com/'));
      expect(p.type, isNull);
    });

    test('presign: a document folder returns type authenticated', () {
      final auth = ((data['presigned_authenticated'] as Map)['items'] as List)
          .single;
      expect(PresignedUploadDto.fromJson(obj(auth)).type, 'authenticated');
    });

    test('confirm returns the media row', () {
      final c = UploadConfirmDto.fromJson(obj(data['confirmed']));
      expect(c.uploadStatus, UploadStatus.complete);
      expect(c.mediaId, isNotEmpty);
      expect(c.fileUrl, contains('/originals/'));
    });
  });

  group('AI jobs', () {
    final data = fixture('ai_jobs');

    test('starting a stitch returns a pending panorama_stitch job', () {
      final s = AiJobSnapshotDto.fromJson(obj(data['stitch_started']));
      expect(s.job.status, AIJobStatus.pending);
      expect(s.job.jobType, AIJobType.panoramaStitch);
      expect(s.job.isTerminal, isFalse);
      expect(s.stitch, isNull);
    });

    test('a running job is not terminal', () {
      final s = AiJobSnapshotDto.fromJson(obj(data['stitch_processing']));
      expect(s.job.status, AIJobStatus.processing);
      expect(s.job.progress, 40);
      expect(s.job.isTerminal, isFalse);
    });

    test('a completed job carries the stitch result', () {
      final s = AiJobSnapshotDto.fromJson(obj(data['stitch_completed']));
      expect(s.job.status, AIJobStatus.completed);
      expect(s.job.isTerminal, isTrue);
      expect(s.stitch!.width, 8192);
      expect(s.stitch!.height, 4096);
      expect(s.stitch!.imageUrl, contains('/stitched'));
    });

    test('a failed job carries the reason', () {
      final s = AiJobSnapshotDto.fromJson(obj(data['stitch_failed']));
      expect(s.job.status, AIJobStatus.failed);
      expect(s.job.isTerminal, isTrue);
      expect(s.job.errorMessage, 'Not enough overlap between frames');
    });

    test('an unknown job status reads as null and is not terminal', () {
      final json = obj(data['stitch_started']);
      (json['job'] as Map)['status'] = 'paused';
      final s = AiJobSnapshotDto.fromJson(json);
      expect(s.job.status, isNull);
      expect(s.job.isTerminal, isFalse);
    });
  });

  test('auth config: Google client ids', () {
    final c = AuthConfigDto.fromJson(obj(fixture('auth')['config']));
    expect(c.googleWebClientId, 'web-client.apps.googleusercontent.com');
    expect(c.googleIosClientId, isNull);
  });

  group('error envelope', () {
    final data = fixture('errors');

    test('a non-2xx body is read from error.code and error.message', () {
      final e = ApiException.fromDio(failure(404, data['not_found']));
      expect(e.statusCode, 404);
      expect(e.code, 'NOT_FOUND');
      expect(e.message, 'Tour not found');
      expect(e.userMessage, 'Tour not found');
      expect(e.fields, isEmpty);
    });

    test('a 422 lists the rejected fields from details.fields', () {
      final e = ApiException.fromDio(failure(422, data['validation']));
      expect(e.code, 'VALIDATION_ERROR');
      expect(e.fields.single.field, 'body.title');
      expect(e.fields.single.type, 'string_too_long');
      expect(e.userMessage, 'title: String should have at most 255 characters');
    });

    test('the legacy {"detail": ...} shape is not read', () {
      final e = ApiException.fromDio(failure(400, {'detail': 'old shape'}));
      expect(e.code, isNull);
      expect(e.message, isNot(contains('old shape')));
      expect(e.message, contains('HTTP 400'));
    });

    test('an envelope that arrives as bytes (the QR route) is parsed', () {
      final bytes = '{"error":{"code":"NOT_FOUND","message":"Tour not found"}}'
          .codeUnits;
      final e = ApiException.fromDio(failure(404, bytes));
      expect(e.code, 'NOT_FOUND');
    });

    test('Retry-After is read from the headers', () {
      final res = Response<dynamic>(
        requestOptions: RequestOptions(path: '/x'),
        statusCode: 503,
        data: {
          'error': {'code': 'STORAGE_LOOKUP_FAILED', 'message': 'try later'}
        },
        headers: Headers.fromMap({
          'retry-after': ['30'],
        }),
      );
      final e = ApiException.fromDio(
          DioException(requestOptions: res.requestOptions, response: res));
      expect(e.retryAfter, const Duration(seconds: 30));
    });

    test('no response is a connection problem, with no Dio text', () {
      final e = ApiException.fromDio(DioException(
        requestOptions: RequestOptions(path: '/x'),
        type: DioExceptionType.connectionTimeout,
      ));
      expect(e.isNetwork, isTrue);
      expect(e.statusCode, isNull);
      expect(e.userMessage, contains('Check your connection'));
      expect(e.userMessage, isNot(contains('DioException')));
    });

    test('describeError never returns raw Dio output', () {
      final raw = DioException(
        requestOptions: RequestOptions(path: '/x'),
        type: DioExceptionType.connectionError,
      );
      expect(describeError(raw), isNot(contains('DioException')));
      expect(describeError(StateError('panorama file is missing')),
          'panorama file is missing');
    });
  });

  group('a missing required field is a broken response, never a default', () {
    final tours = fixture('tours');
    final hotspots = fixture('hotspots');
    final jobs = fixture('ai_jobs');

    void expectBroken(void Function() parse, String field) {
      expect(
        parse,
        throwsA(isA<FormatException>()
            .having((e) => e.message, 'message', contains(field))),
      );
    }

    test('tour without status or visibility', () {
      for (final key in ['status', 'visibility']) {
        final json = obj(tours['created'])..remove(key);
        expectBroken(() => TourDto.fromJson(json), key);
      }
    });

    test('hotspot without type or is_active', () {
      for (final key in ['type', 'is_active']) {
        final json = obj(hotspots['created'])..remove(key);
        expectBroken(() => HotspotDto.fromJson(json), key);
      }
    });

    test('page without has_more', () {
      final json = obj(hotspots['list_page'])..remove('has_more');
      expectBroken(
          () => CursorPage.fromJson(json, HotspotDto.fromJson), 'has_more');
    });

    test('job without status or progress', () {
      for (final key in ['status', 'progress']) {
        // The fixture is shared: copy it deeply before removing a key.
        final json = obj(jsonDecode(jsonEncode(jobs['stitch_started'])));
        (json['job'] as Map).remove(key);
        expectBroken(() => AiJobSnapshotDto.fromJson(json), key);
      }
    });
  });

  test('clampName cuts to 255 characters and keeps surrogate pairs whole', () {
    expect(clampName('Kitchen'), 'Kitchen');
    expect(clampName('a' * 300).length, 255);
    final emoji = '😀' * 300; // each one is two UTF-16 units, one character
    final clamped = clampName(emoji);
    expect(clamped.runes.length, 255);
    expect(clamped.codeUnits.length, 510);
  });
}
