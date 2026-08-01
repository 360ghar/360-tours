import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/providers.dart';
import 'package:tours360/features/tours/presentation/hotspot_editor_screen.dart';

import 'fakes.dart';

void main() {
  group('HotspotEntry.fromJson', () {
    test('parses backend hotspot fields', () {
      final e = HotspotEntry.fromJson({
        'id': 'h1',
        'type': 'navigation',
        'title': 'Kitchen',
        'position': {'yaw': 45.5, 'pitch': -12.25},
        'target_scene_id': 'scene-2',
      });
      expect(e.id, 'h1');
      expect(e.type, 'navigation');
      expect(e.title, 'Kitchen');
      expect(e.yawDeg, 45.5);
      expect(e.pitchDeg, -12.25);
      expect(e.targetSceneId, 'scene-2');
    });

    test('defaults for sparse records', () {
      final e = HotspotEntry.fromJson({'id': 'h1'});
      expect(e.title, 'Untitled hotspot');
      expect(e.type, 'navigation');
      expect(e.yawDeg, 0);
      expect(e.pitchDeg, 0);
    });
  });

  group('hotspotDestinations', () {
    final asset = ScanAsset(
      id: 'a1',
      ownerId: 'u1',
      name: 'Living room',
      remoteTourId: 'tour-1',
      createdAt: DateTime(2026),
      status: AssetStatus.ready,
    );
    final rooms = [
      Room(
          id: 'r1',
          assetId: 'a1',
          name: 'Kitchen',
          remoteSceneId: 'scene-k'),
      Room(
          id: 'r2',
          assetId: 'a1',
          name: 'Bedroom',
          remoteSceneId: 'scene-b'),
      const Room(id: 'r3', assetId: 'a1', name: 'Not uploaded'),
    ];

    test('lists the main scene plus uploaded rooms, minus the current one',
        () {
      final out = hotspotDestinations(
          currentSceneId: 'scene-k', asset: asset, rooms: rooms);
      expect(out.map((d) => d.sceneId), ['__main__', 'scene-b']);
      expect(out.map((d) => d.label), ['Living room (main)', 'Bedroom']);
    });

    test('excludes the tapped scene itself', () {
      final out = hotspotDestinations(
          currentSceneId: '__main__', asset: asset, rooms: rooms);
      expect(out.map((d) => d.sceneId), ['scene-k', 'scene-b']);
    });

    test('empty when there is nowhere to go', () {
      final out = hotspotDestinations(
          currentSceneId: 'x', asset: null, rooms: const []);
      expect(out, isEmpty);
    });

    test('unuploaded rooms never appear as destinations', () {
      final out = hotspotDestinations(
          currentSceneId: '__main__', asset: asset, rooms: rooms);
      expect(out.any((d) => d.label == 'Not uploaded'), isFalse);
    });
  });

  group('resolveMainSceneId', () {
    test('picks the lowest order_index', () {
      final scenes = [
        {'id': 's2', 'order_index': 2},
        {'id': 's0', 'order_index': 0},
        {'id': 's1', 'order_index': 1},
      ];
      expect(resolveMainSceneId(scenes), 's0');
    });

    test('null for an empty tour', () {
      expect(resolveMainSceneId(const []), isNull);
    });
  });

  group('HotspotEditorScreen', () {
    testWidgets('shows the not-uploaded hint without a WebView',
        (tester) async {
      final repo = FakeAssetRepository();
      final asset = ScanAsset(
        id: 'a1',
        ownerId: 'u1',
        name: 'Living room',
        createdAt: DateTime(2026),
      );
      await repo.saveAsset(asset);
      await tester.pumpWidget(ProviderScope(
        overrides: [
          assetRepositoryProvider.overrideWithValue(repo),
          authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
        ],
        child: const MaterialApp(
          home: HotspotEditorScreen(assetId: 'a1', roomId: 'r1'),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Not uploaded yet'), findsOneWidget);
    });
  });
}
