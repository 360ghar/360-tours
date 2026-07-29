import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/storage/local_store.dart';
import 'package:tours360/features/assets/data/local_asset_repository.dart';

void main() {
  late Directory dir;
  late LocalStore store;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('tours360_test');
    store = LocalStore(dir);
  });

  tearDown(() => dir.delete(recursive: true));

  test('upsert / readAll / delete round-trip', () async {
    await store.upsert('things', {'id': 'a', 'v': 1});
    await store.upsert('things', {'id': 'b', 'v': 2});
    await store.upsert('things', {'id': 'a', 'v': 3}); // update
    final all = await store.readAll('things');
    expect(all.length, 2);
    expect(all.firstWhere((e) => e['id'] == 'a')['v'], 3);
    await store.delete('things', 'a');
    expect((await store.readAll('things')).length, 1);
  });

  test('survives a fresh instance (persisted to disk)', () async {
    await store.upsert('things', {'id': 'a', 'v': 1});
    final fresh = LocalStore(dir);
    final all = await fresh.readAll('things');
    expect(all.single['v'], 1);
  });

  test('corrupt file resets instead of crashing', () async {
    await File('${dir.path}/bad.json').writeAsString('{not json');
    expect(await store.readAll('bad'), isEmpty);
  });

  test('watch emits current contents then updates', () async {
    await store.upsert('things', {'id': 'a'});
    final emissions = <int>[];
    final sub = store.watch('things').listen((l) => emissions.add(l.length));
    await Future<void>.delayed(const Duration(milliseconds: 10));
    await store.upsert('things', {'id': 'b'});
    await Future<void>.delayed(const Duration(milliseconds: 10));
    expect(emissions, [1, 2]);
    await sub.cancel();
  });

  test('concurrent upserts to the same collection do not lose updates',
      () async {
    await Future.wait([
      store.upsert('things', {'id': 'a', 'v': 1}),
      store.upsert('things', {'id': 'b', 'v': 2}),
    ]);
    final all = await store.readAll('things');
    expect(all.length, 2);
    expect(all.map((e) => e['id']).toSet(), {'a', 'b'});
  });

  group('LocalAssetRepository', () {
    late LocalAssetRepository repo;

    setUp(() => repo = LocalAssetRepository(store));

    ScanAsset asset(String id, {String owner = 'u1'}) => ScanAsset(
          id: id,
          ownerId: owner,
          name: 'Room $id',
          createdAt: DateTime(2026, 7, 23),
        );

    test('save / get / delete asset with rooms', () async {
      await repo.saveAsset(asset('a1'));
      await repo.saveRoom(const Room(id: 'r1', assetId: 'a1', name: 'Kitchen'));
      expect((await repo.getAsset('a1'))!.name, 'Room a1');
      expect((await repo.getRooms('a1')).single.name, 'Kitchen');
      await repo.deleteAsset('a1');
      expect(await repo.getAsset('a1'), isNull);
      expect(await repo.getRooms('a1'), isEmpty);
    });

    test('watchAssets filters by owner and sorts newest first', () async {
      await repo.saveAsset(asset('a1'));
      await repo.saveAsset(ScanAsset(
        id: 'a2',
        ownerId: 'u1',
        name: 'Newer',
        createdAt: DateTime(2026, 7, 24),
      ));
      await repo.saveAsset(asset('other', owner: 'u2'));
      final list = await repo.watchAssets('u1').first;
      expect(list.map((a) => a.id), ['a2', 'a1']);
    });

    test('model JSON round-trips including new fields', () {
      final a = ScanAsset(
        id: 'x',
        ownerId: 'u',
        name: 'n',
        createdAt: DateTime(2026, 1, 1),
        remoteTourId: 'tour-1',
        shareCode: 'abc123',
        frameOrientations: const [
          FrameOrientation(yaw: 10, pitch: -5, roll: 1),
        ],
      );
      final back = ScanAsset.fromJson(a.toJson());
      expect(back.remoteTourId, 'tour-1');
      expect(back.shareCode, 'abc123');
      expect(back.frameOrientations.single.pitch, -5);

      const room = Room(
          id: 'r', assetId: 'x', name: 'R', remoteSceneId: 'scene-9');
      expect(Room.fromJson(room.toJson()).remoteSceneId, 'scene-9');

      const h = Hotspot(
          id: 'h',
          targetRoomId: 'r2',
          label: 'Door',
          yawDeg: 5,
          pitchDeg: -2,
          remoteId: 'hs-1');
      expect(Hotspot.fromJson(h.toJson()).remoteId, 'hs-1');
    });
  });
}
