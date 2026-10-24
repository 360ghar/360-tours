import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/api/api_exception.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/storage/local_store.dart';
import 'package:tours360/features/assets/data/local_asset_repository.dart';

Map<String, dynamic> assetJson(String id,
        {String owner = 'u1', Map<String, dynamic>? patch}) =>
    {
      'id': id,
      'ownerId': owner,
      'name': 'Room $id',
      'type': 'pano360',
      'status': 'ready',
      'createdAt': DateTime(2026, 7, 23).toIso8601String(),
      ...?patch,
    };

void main() {
  late Directory dir;
  late LocalStore store;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('store_schema_test');
    store = LocalStore(dir);
  });

  tearDown(() => dir.delete(recursive: true));

  List<String> corruptFiles(String name) => dir
      .listSync()
      .map((e) => e.path.split('/').last)
      .where((n) => n.startsWith('$name.json.corrupt-'))
      .toList();

  group('schema header', () {
    test('every collection file carries schemaVersion and items', () async {
      await store.upsert('things', {'id': 'a'});
      final raw = jsonDecode(File('${dir.path}/things.json').readAsStringSync())
          as Map<String, dynamic>;
      expect(raw['schemaVersion'], LocalStore.schemaVersion);
      expect((raw['items'] as List).single['id'], 'a');
    });

    test('a plain list from before the header loads, then gains the header',
        () async {
      await File('${dir.path}/things.json').writeAsString('[{"id":"old"}]');
      expect((await store.readAll('things')).single['id'], 'old');
      await store.upsert('things', {'id': 'new'});
      final raw = jsonDecode(File('${dir.path}/things.json').readAsStringSync())
          as Map<String, dynamic>;
      expect(raw['schemaVersion'], LocalStore.schemaVersion);
      expect((raw['items'] as List).length, 2);
    });

    test('a file from a newer app is set aside whole, not rewritten',
        () async {
      await File('${dir.path}/things.json').writeAsString(jsonEncode({
        'schemaVersion': LocalStore.schemaVersion + 1,
        'items': [
          {'id': 'future'}
        ],
      }));
      expect(await store.readAll('things'), isEmpty);
      expect(corruptFiles('things'), hasLength(1));
      final kept = File('${dir.path}/${corruptFiles('things').single}');
      expect(kept.readAsStringSync(), contains('future'));
    });

    test('a header with no items list is quarantined', () async {
      await File('${dir.path}/things.json')
          .writeAsString('{"schemaVersion": 1}');
      expect(await store.readAll('things'), isEmpty);
      expect(corruptFiles('things'), hasLength(1));
    });

    test('only the newest quarantined files are kept', () async {
      for (var i = 0; i < 5; i++) {
        await File('${dir.path}/things.json').writeAsString('{not json $i');
        await LocalStore(dir).readAll('things'); // quarantines it
        await Future<void>.delayed(const Duration(milliseconds: 3));
      }
      expect(corruptFiles('things'), hasLength(LocalStore.maxQuarantineFiles));
    });
  });

  group('record quarantine', () {
    test('one unreadable record moves aside and the rest stay', () async {
      await store.upsert('things', {'id': 'good'});
      await store.upsert('things', {'id': 'bad'});
      final bad = (await store.readAll('things'))
          .firstWhere((e) => e['id'] == 'bad');

      await store.quarantineRecord('things', bad, 'test reason');

      expect((await store.readAll('things')).map((e) => e['id']), ['good']);
      final held = (await store.readAll('things_quarantine')).single;
      expect(held['reason'], 'test reason');
      expect((held['record'] as Map)['id'], 'bad');
    });

    test('only the newest records are kept', () async {
      for (var i = 0; i < LocalStore.maxQuarantinedRecords + 5; i++) {
        await store.quarantineRecord('things', {'id': 'r$i'}, 'x');
      }
      final held = await store.readAll('things_quarantine');
      expect(held, hasLength(LocalStore.maxQuarantinedRecords));
      expect((held.last['record'] as Map)['id'],
          'r${LocalStore.maxQuarantinedRecords + 4}');
    });
  });

  group('recovery of quarantined data', () {
    test('a quarantined record that reads now goes back, the rest stay',
        () async {
      await store.quarantineRecord('things', {'id': 'fixable'}, 'old parser');
      await store.quarantineRecord('things', {'id': 'hopeless'}, 'old parser');

      final restored = await store.restoreQuarantinedRecords(
          'things', (r) => r['id'] == 'fixable');

      expect(restored, 1);
      expect((await store.readAll('things')).map((e) => e['id']), ['fixable']);
      final held = await store.readAll('things_quarantine');
      expect(held.map((e) => (e['record'] as Map)['id']), ['hopeless']);
    });

    test('a live record with the same id is never overwritten', () async {
      await store.upsert('things', {'id': 'a', 'v': 'live'});
      await store.quarantineRecord('things', {'id': 'a', 'v': 'old'}, 'x');
      await store.upsert('things', {'id': 'a', 'v': 'live'});

      expect(await store.restoreQuarantinedRecords('things', (_) => true), 0);

      expect((await store.readAll('things')).single['v'], 'live');
      expect(await store.readAll('things_quarantine'), hasLength(1));
    });

    test('an identical copy of a live record is dropped from quarantine',
        () async {
      await store.upsert('things', {'id': 'a'});
      await store.upsert('things_quarantine', {
        'id': 'q1',
        'reason': 'x',
        'record': {'id': 'a'},
      });
      expect(await store.restoreQuarantinedRecords('things', (_) => true), 0);
      expect(await store.readAll('things_quarantine'), isEmpty);
      expect(await store.readAll('things'), hasLength(1));
    });

    test('a file set aside as unreadable is merged back once it reads',
        () async {
      // A copy a newer build wrote and this build set aside. Rewritten here
      // with a version this build reads, as if the build had caught up.
      await File('${dir.path}/things.json.corrupt-100').writeAsString(
          jsonEncode({
        'schemaVersion': LocalStore.schemaVersion,
        'items': [
          {'id': 'old-1'},
          {'id': 'live'},
        ],
      }));
      await store.upsert('things', {'id': 'live', 'v': 'kept'});

      expect(await store.restoreQuarantinedFiles('things'), 1);

      final ids = (await store.readAll('things')).map((e) => e['id']);
      expect(ids, containsAll(['old-1', 'live']));
      expect(
          (await store.readAll('things')).firstWhere((e) => e['id'] == 'live')['v'],
          'kept');
      expect(corruptFiles('things'), isEmpty);
    });

    test('a file that is still unreadable stays where it is', () async {
      await File('${dir.path}/things.json.corrupt-100')
          .writeAsString('{not json');
      await File('${dir.path}/things.json.corrupt-200').writeAsString(
          jsonEncode({
        'schemaVersion': LocalStore.schemaVersion + 1,
        'items': [
          {'id': 'future'}
        ],
      }));
      expect(await store.restoreQuarantinedFiles('things'), 0);
      expect(corruptFiles('things'), hasLength(2));
      expect(await store.readAll('things'), isEmpty);
    });
  });

  group('LocalAssetRepository reads', () {
    late LocalAssetRepository repo;

    setUp(() => repo = LocalAssetRepository(store));

    test('one malformed record is quarantined, the list still loads',
        () async {
      await store.upsert('assets', assetJson('good'));
      await store.upsert('assets', {'id': 'broken', 'ownerId': 'u1'});

      final list = await repo.watchAssets('u1').first;

      expect(list.map((a) => a.id), ['good']);
      expect((await store.readAll('assets')).map((e) => e['id']), ['good']);
      final held = (await store.readAll('assets_quarantine')).single;
      expect((held['record'] as Map)['id'], 'broken');
    });

    test('another account\'s record is never parsed or quarantined', () async {
      await store.upsert('assets', assetJson('mine'));
      // A record of u2 that u1's app could not read: it is not u1's to judge.
      await store.upsert('assets', {'id': 'theirs', 'ownerId': 'u2'});

      final list = await repo.watchAssets('u1').first;

      expect(list.map((a) => a.id), ['mine']);
      expect((await store.readAll('assets')).map((e) => e['id']),
          containsAll(['mine', 'theirs']));
      expect(await store.readAll('assets_quarantine'), isEmpty);
    });

    test('an unknown status fails closed: quarantined, never ready', () async {
      await store.upsert(
          'assets', assetJson('odd', patch: {'status': 'archived-v9'}));
      final list = await repo.watchAssets('u1').first;
      expect(list, isEmpty);
      expect(await store.readAll('assets_quarantine'), hasLength(1));
    });

    test('a missing createdAt is an error, not "now"', () async {
      final json = assetJson('nodate')..remove('createdAt');
      await store.upsert('assets', json);
      expect(await repo.watchAssets('u1').first, isEmpty);
      expect(() => ScanAsset.fromJson(json), throwsFormatException);
    });

    test('a record with no owner is quarantined, not shown to anyone',
        () async {
      await store.upsert(
          'assets', assetJson('orphan', patch: {'ownerId': null}));
      expect(await repo.watchAssets('u1').first, isEmpty);
      expect(await store.readAll('assets_quarantine'), hasLength(1));
    });

    test('the list order does not change between reads', () async {
      await store.upsert('assets', assetJson('a1'));
      await store.upsert(
          'assets',
          assetJson('a2', patch: {
            'createdAt': DateTime(2026, 7, 24).toIso8601String(),
          }));
      final first = (await repo.watchAssets('u1').first).map((a) => a.id);
      final second = (await repo.watchAssets('u1').first).map((a) => a.id);
      expect(first.toList(), ['a2', 'a1']);
      expect(second.toList(), first.toList());
    });

    test('getAsset on an unreadable record returns null', () async {
      await store.upsert('assets', {'id': 'broken', 'ownerId': 'u1'});
      expect(await repo.getAsset('broken'), isNull);
      expect(await store.readAll('assets_quarantine'), hasLength(1));
    });

    test('a room with no id is quarantined and the other rooms load',
        () async {
      await store.upsert('rooms', {'id': 'r1', 'assetId': 'a1', 'name': 'K'});
      await store.upsert('rooms', {'id': '', 'assetId': 'a1'});
      final rooms = await repo.getRooms('a1');
      expect(rooms.map((r) => r.id), ['r1']);
    });

    test('the asset keeps the main scene id through a save and a read',
        () async {
      final a = ScanAsset(
        id: 'x',
        ownerId: 'u1',
        name: 'n',
        createdAt: DateTime(2026),
        remoteTourId: 'tour-1',
        remoteSceneId: 'scene-0',
      );
      await repo.saveAsset(a);
      expect((await repo.getAsset('x'))!.remoteSceneId, 'scene-0');
    });
  });

  group('LocalAssetRepository.deleteRoom', () {
    Future<LocalAssetRepository> repoWith(
        Future<void> Function(String) deleteScene) async {
      final repo =
          LocalAssetRepository(store, remoteDeleteScene: deleteScene);
      await repo.saveRoom(const Room(
          id: 'r1', assetId: 'a1', name: 'Kitchen', remoteSceneId: 'scene-k'));
      return repo;
    }

    test('deletes the scene on the server, then the local room', () async {
      final deleted = <String>[];
      final repo = await repoWith((id) async => deleted.add(id));
      await repo.deleteRoom('a1', 'r1');
      expect(deleted, ['scene-k']);
      expect(await repo.getRooms('a1'), isEmpty);
    });

    test('a failed remote delete throws and the room stays', () async {
      final repo = await repoWith((_) async =>
          throw const ApiException(statusCode: 500, message: 'down'));
      await expectLater(
          repo.deleteRoom('a1', 'r1'), throwsA(isA<ApiException>()));
      expect(await repo.getRooms('a1'), hasLength(1));
    });

    test('a 404 means the scene is already gone: the room is removed',
        () async {
      final repo = await repoWith((_) async =>
          throw const ApiException(statusCode: 404, message: 'gone'));
      await repo.deleteRoom('a1', 'r1');
      expect(await repo.getRooms('a1'), isEmpty);
    });

    test('a room that never uploaded needs no remote call', () async {
      var called = false;
      final repo = LocalAssetRepository(store,
          remoteDeleteScene: (_) async => called = true);
      await repo.saveRoom(const Room(id: 'r2', assetId: 'a1', name: 'New'));
      await repo.deleteRoom('a1', 'r2');
      expect(called, isFalse);
      expect(await repo.getRooms('a1'), isEmpty);
    });
  });
}
