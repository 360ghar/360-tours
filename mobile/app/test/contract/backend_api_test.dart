// Contract tests for BackendApi on the wire: what it sends (declared keys only,
// the Idempotency-Key, PATCH with changed keys, paging) and how it reads
// answers and errors. A fake Dio adapter answers with the fixtures from
// tool/api_fixtures.py; request bodies are checked against the request schemas
// of the backend's OpenAPI document.

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/api/api_exception.dart';
import 'package:tours360/core/api/backend_api.dart';
import 'package:tours360/core/models/wire_enums.dart';

import 'support.dart';

void main() {
  final schemas = fixture('request_schemas');
  final hotspots = fixture('hotspots');
  final tours = fixture('tours');
  final uploads = fixture('uploads');

  BackendApi apiAnswering(
    ResponseBody Function(RequestOptions) respond, {
    List<RequestOptions>? log,
  }) {
    final adapter = FakeAdapter((o) {
      log?.add(o);
      return respond(o);
    });
    return BackendApi(dioWith(adapter));
  }

  Map<String, dynamic> bodyOf(RequestOptions o) => obj(o.data);

  group('requests carry only declared keys', () {
    test('POST /tours: title and visibility, no is_public, with the key',
        () async {
      final sent = <RequestOptions>[];
      final api = apiAnswering(
          (_) => jsonBody(tours['created'], status: 201),
          log: sent);
      final tour = await api.createTour(
          title: 'Flat 4B', idempotencyKey: 'tour-a1');

      final body = bodyOf(sent.single);
      expect(sent.single.method, 'POST');
      expect(sent.single.path, '/tours');
      expectDeclaredKeys(schemas, 'TourCreate', body);
      expect(body, {'title': 'Flat 4B', 'visibility': 'unlisted'});
      expect(sent.single.headers['Idempotency-Key'], 'tour-a1');
      expect(tour.shortCode, isNull);
    });

    test('POST /tours/{id}/scenes: no order_index, key on the call', () async {
      final sent = <RequestOptions>[];
      final api = apiAnswering(
          (_) => jsonBody(fixture('scenes')['created'], status: 201),
          log: sent);
      await api.createScene(
        tourId: 't1',
        imageUrl: 'https://res.cloudinary.com/x',
        title: 'Kitchen',
        idempotencyKey: 'scene-a1',
      );
      final body = bodyOf(sent.single);
      expectDeclaredKeys(schemas, 'SceneCreate', body);
      expect(body.containsKey('order_index'), isFalse);
      expect(body.containsKey('metadata'), isFalse);
      expect(sent.single.headers['Idempotency-Key'], 'scene-a1');
    });

    test('a create without a key sends no Idempotency-Key header', () async {
      final sent = <RequestOptions>[];
      final api = apiAnswering(
          (_) => jsonBody(fixture('scenes')['created'], status: 201),
          log: sent);
      await api.createScene(tourId: 't1', imageUrl: 'https://x');
      expect(sent.single.headers.containsKey('Idempotency-Key'), isFalse);
    });

    test('a title over 255 characters is cut before it is sent', () async {
      final sent = <RequestOptions>[];
      final api = apiAnswering(
          (_) => jsonBody(tours['created'], status: 201),
          log: sent);
      await api.createTour(title: 'a' * 400);
      expect((bodyOf(sent.single)['title'] as String).length, 255);
    });

    test('POST /scenes/{id}/hotspots: a navigation hotspot', () async {
      final sent = <RequestOptions>[];
      final api = apiAnswering(
          (_) => jsonBody(hotspots['created'], status: 201),
          log: sent);
      await api.createHotspot(
        sceneId: 's1',
        yaw: 45.5,
        pitch: -12.25,
        targetSceneId: 's2',
        title: 'Kitchen',
      );
      final body = bodyOf(sent.single);
      expectDeclaredKeys(schemas, 'HotspotCreate', body);
      expect(body['type'], 'navigation');
      expect(body['position'], {'yaw': 45.5, 'pitch': -12.25});
    });

    test('moving a hotspot is one PATCH with only the changed keys', () async {
      final sent = <RequestOptions>[];
      final api = apiAnswering((_) => jsonBody(hotspots['updated']), log: sent);
      final h = await api.updateHotspot('h-1',
          targetSceneId: 's2', title: 'Bedroom');

      expect(sent, hasLength(1), reason: 'no delete, no create');
      expect(sent.single.method, 'PATCH');
      expect(sent.single.path, '/hotspots/h-1');
      final body = bodyOf(sent.single);
      expectDeclaredKeys(schemas, 'HotspotUpdate', body);
      expect(body, {'target_scene_id': 's2', 'title': 'Bedroom'});
      expect(h.title, 'Bedroom');
    });

    test('a PATCH of a non-navigation hotspot answers with no target',
        () async {
      // The server keeps no target on such a hotspot but still writes the
      // title, so a caller must compare the answer with what it asked for.
      final api = apiAnswering((_) => jsonBody(hotspots['updated_info']));
      final h = await api.updateHotspot('h-2',
          targetSceneId: 's2', title: 'Bedroom');
      expect(h.targetSceneId, isNull);
      expect(h.title, 'Bedroom');
    });

    test('POST /upload/presigned: file_size and folder_type, no folder',
        () async {
      final sent = <RequestOptions>[];
      final api = apiAnswering(
          (_) => jsonBody(uploads['presigned'], status: 201),
          log: sent);
      final p = await api.createPresignedUpload(
        filename: 'panorama.jpg',
        folderType: StorageFolderType.tourOriginal,
        tourId: 't1',
        fileSize: 2483120,
      );
      final body = bodyOf(sent.single);
      expectDeclaredKeys(schemas, 'PresignedUploadRequest', body);
      final item = obj((body['files'] as List).single);
      expectDeclaredKeys(schemas, 'PresignedUploadItem', item);
      expect(item['file_size'], 2483120);
      expect(item['folder_type'], 'tour_original');
      expect(item.containsKey('folder'), isFalse);
      expect(p.uploadId, 'up-7f3e');
    });

    test('POST /scenes/{id}/stitch: frame_urls only', () async {
      final sent = <RequestOptions>[];
      final api = apiAnswering(
          (_) => jsonBody(fixture('ai_jobs')['stitch_started'], status: 202),
          log: sent);
      final started = await api.requestCloudStitch(
        sceneId: 's1',
        frameUrls: ['https://res.cloudinary.com/a', 'https://res.cloudinary.com/b'],
      );
      expectDeclaredKeys(schemas, 'SceneStitchRequest', bodyOf(sent.single));
      expect(started.job.id, isNotEmpty);
    });
  });

  group('lists follow next_cursor', () {
    test('hotspots: two pages, limit 100, the cursor passed back unchanged',
        () async {
      final sent = <RequestOptions>[];
      final api = apiAnswering((o) {
        final cursor = o.queryParameters['cursor'];
        return jsonBody(
            cursor == null ? hotspots['list_page'] : hotspots['list_last_page']);
      }, log: sent);

      final all = await api.getHotspots('s1');

      expect(all.map((h) => h.id), ['h-1', 'h-2', 'h-3']);
      expect(sent, hasLength(2));
      expect(sent.first.queryParameters, {'limit': 100});
      final next = (hotspots['list_page'] as Map)['next_cursor'];
      expect(sent.last.queryParameters, {'limit': 100, 'cursor': next});
    });

    test('floor plans: all pages', () async {
      final fp = fixture('floor_plans');
      final api = apiAnswering((o) => jsonBody(
          o.queryParameters['cursor'] == null
              ? fp['list_page']
              : fp['list_last_page']));
      final all = await api.getFloorPlans('t1');
      expect(all.map((p) => p.floorNumber), [1, 2]);
    });
    test('generate a floor plan: POST with no body, the plan comes back',
        () async {
      final fp = fixture('floor_plans');
      final sent = <RequestOptions>[];
      final stored = obj((obj(fp['list_last_page'])['items'] as List).single);
      final api = apiAnswering((_) => jsonBody(stored), log: sent);

      final generated = await api.generateFloorPlan('t1');

      expect(sent.single.method, 'POST');
      expect(sent.single.path, '/tours/t1/floor-plans/generate');
      // The server owns the layout, so the request carries no keys at all.
      expect(sent.single.data, anyOf(isNull, isEmpty));
      expect(generated.name, 'First floor');
      expect(generated.markers.single.x, 40.5);
    });

    test('a cursor that never ends stops with an error, not a hang', () async {
      final api = apiAnswering((_) => jsonBody(hotspots['list_page']));
      await expectLater(
        api.getHotspots('s1'),
        throwsA(isA<ApiException>()
            .having((e) => e.code, 'code', 'TOO_MANY_PAGES')),
      );
    });
  });

  group('answers and errors', () {
    test('GET /tours/{id} parses the owner shape', () async {
      final api = apiAnswering((_) => jsonBody(tours['detail']));
      final t = await api.getTour('t1');
      expect(t.mainSceneId, isNotNull);
      expect(t.scenes, hasLength(2));
    });

    test('a 204 delete succeeds with no body', () async {
      final api = apiAnswering((_) => ResponseBody.fromString('', 204));
      await api.deleteHotspot('h-1');
      await api.deleteScene('s1');
      await api.deleteTour('t1');
    });

    test('a failure is an ApiException from the envelope', () async {
      final api = apiAnswering(
          (_) => jsonBody(fixture('errors')['not_found'], status: 404));
      await expectLater(
        api.getTour('missing'),
        throwsA(isA<ApiException>()
            .having((e) => e.statusCode, 'status', 404)
            .having((e) => e.code, 'code', 'NOT_FOUND')
            .having((e) => e.message, 'message', 'Tour not found')),
      );
    });

    test('a 422 names the field the server rejected', () async {
      final api = apiAnswering(
          (_) => jsonBody(fixture('errors')['validation'], status: 422));
      await expectLater(
        api.createTour(title: 'x'),
        throwsA(isA<ApiException>().having((e) => e.userMessage, 'text',
            'title: String should have at most 255 characters')),
      );
    });

    test('a 503 keeps its Retry-After', () async {
      final api = apiAnswering((_) => jsonBody(
            {
              'error': {'code': 'STORAGE_LOOKUP_FAILED', 'message': 'later'}
            },
            status: 503,
            headers: {
              'retry-after': ['30'],
            },
          ));
      await expectLater(
        api.confirmUpload('up-1'),
        throwsA(isA<ApiException>()
            .having((e) => e.retryAfter, 'retryAfter',
                const Duration(seconds: 30))),
      );
    });

    test('a 2xx body that misses a required field is a BAD_RESPONSE',
        () async {
      final broken = obj(uploads['presigned']);
      (broken['items'] as List).first.remove('signature');
      final api = apiAnswering((_) => jsonBody(broken, status: 201));
      await expectLater(
        api.createPresignedUpload(
          filename: 'p.jpg',
          folderType: StorageFolderType.tourOriginal,
          tourId: 't1',
          fileSize: 1,
        ),
        throwsA(isA<ApiException>()
            .having((e) => e.code, 'code', 'BAD_RESPONSE')),
      );
    });

    test('a QR error body that arrives as bytes is parsed', () async {
      final api = apiAnswering((_) => ResponseBody.fromBytes(
            utf8.encode(jsonEncode(fixture('errors')['not_found'])),
            404,
            headers: {
              Headers.contentTypeHeader: ['application/json'],
            },
          ));
      await expectLater(api.getQrCode('t1'),
          throwsA(isA<ApiException>().having((e) => e.code, 'code', 'NOT_FOUND')));
    });
  });
}
