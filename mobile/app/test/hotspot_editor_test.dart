import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/providers.dart';
import 'package:tours360/features/tours/presentation/hotspot_editor_screen.dart';

import 'fakes.dart';

void main() {
  group('hotspotDestinations', () {
    final asset = ScanAsset(
      id: 'a1',
      ownerId: 'u1',
      name: 'Living room',
      remoteTourId: 'tour-1',
      remoteSceneId: 'scene-main',
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
      expect(out.map((d) => d.sceneId), ['scene-main', 'scene-b']);
      expect(out.map((d) => d.label), ['Living room (main)', 'Bedroom']);
    });

    test('excludes the scene the hotspot sits in, the main scene included',
        () {
      final out = hotspotDestinations(
          currentSceneId: 'scene-main', asset: asset, rooms: rooms);
      expect(out.map((d) => d.sceneId), ['scene-k', 'scene-b']);
    });

    test('a hotspot can never lead to its own scene', () {
      for (final current in ['scene-main', 'scene-k', 'scene-b']) {
        final out = hotspotDestinations(
            currentSceneId: current, asset: asset, rooms: rooms);
        expect(out.any((d) => d.sceneId == current), isFalse);
      }
    });

    test('the main scene is offered only once its id is stored', () {
      final out = hotspotDestinations(
        currentSceneId: 'scene-k',
        asset: asset.copyWith(remoteSceneId: null),
        rooms: rooms,
      );
      expect(out.map((d) => d.sceneId), ['scene-b']);
      expect(out.map((d) => d.sceneId), isNot(contains('__main__')));
    });

    test('empty when there is nowhere to go', () {
      final out = hotspotDestinations(
          currentSceneId: 'x', asset: null, rooms: const []);
      expect(out, isEmpty);
    });

    test('unuploaded rooms never appear as destinations', () {
      final out = hotspotDestinations(
          currentSceneId: 'scene-main', asset: asset, rooms: rooms);
      expect(out.any((d) => d.label == 'Not uploaded'), isFalse);
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
          home: HotspotEditorScreen(assetId: 'a1', sceneId: 's1'),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Not uploaded yet'), findsOneWidget);
    });
  });
}
