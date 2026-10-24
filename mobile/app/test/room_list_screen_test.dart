import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:tours360/core/api/api_exception.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/providers.dart';
import 'package:tours360/features/assets/data/local_asset_repository.dart';
import 'package:tours360/features/tours/presentation/room_list_screen.dart';

import 'fakes.dart';

void main() {
  late LocalAssetRepository repo;

  ScanAsset asset({String? sceneId, AssetStatus? status}) => ScanAsset(
        id: 'a1',
        ownerId: 'u1',
        name: 'Living room',
        status: status ?? AssetStatus.ready,
        createdAt: DateTime(2026),
        remoteTourId: 'tour-1',
        remoteSceneId: sceneId,
      );

  Future<void> open(WidgetTester tester) async {
    final router = GoRouter(routes: [
      GoRoute(
          path: '/', builder: (_, _) => const RoomListScreen(assetId: 'a1')),
      GoRoute(
        path: '/asset/:id/scenes/:sceneId/hotspots',
        builder: (_, state) =>
            Scaffold(body: Text('editor ${state.pathParameters['sceneId']}')),
      ),
    ]);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        assetRepositoryProvider.overrideWithValue(repo),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository(
            user: const AppUser(id: 'u1', email: 'a@example.com'))),
      ],
      child: MaterialApp.router(routerConfig: router),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('the main room opens its editor by the stored scene id',
      (tester) async {
    repo = LocalAssetRepository(InMemoryStore());
    await repo.saveAsset(asset(sceneId: 'scene-main'));
    await open(tester);

    await tester.tap(find.text('Living room (main)'));
    await tester.pumpAndSettle();

    expect(find.text('editor scene-main'), findsOneWidget);
    expect(find.textContaining('__main__'), findsNothing);
  });

  testWidgets('a room opens its editor by its own scene id', (tester) async {
    repo = LocalAssetRepository(InMemoryStore());
    await repo.saveAsset(asset(sceneId: 'scene-main'));
    await repo.saveRoom(const Room(
        id: 'r1', assetId: 'a1', name: 'Kitchen', remoteSceneId: 'scene-k'));
    await open(tester);

    await tester.tap(find.text('Kitchen'));
    await tester.pumpAndSettle();

    expect(find.text('editor scene-k'), findsOneWidget);
  });

  testWidgets('the main room is not open for editing until its scene exists',
      (tester) async {
    repo = LocalAssetRepository(InMemoryStore());
    await repo.saveAsset(asset(status: AssetStatus.stitching));
    await open(tester);

    expect(find.text('Uploading…'), findsOneWidget);
    await tester.tap(find.text('Living room (main)'));
    await tester.pumpAndSettle();
    expect(find.textContaining('editor'), findsNothing);
  });

  testWidgets('a failed main upload reads as failed, with no retry button',
      (tester) async {
    repo = LocalAssetRepository(InMemoryStore());
    await repo.saveAsset(asset(status: AssetStatus.failed));
    await open(tester);

    expect(find.text('Upload failed'), findsOneWidget);
    expect(find.byTooltip('Retry upload'), findsNothing);
    expect(find.byTooltip('Delete room'), findsNothing);
  });

  testWidgets('a room that cannot be deleted on the server stays, with a reason',
      (tester) async {
    repo = LocalAssetRepository(
      InMemoryStore(),
      remoteDeleteScene: (_) async => throw const ApiException(
          statusCode: 403, code: 'FORBIDDEN', message: 'Not your tour'),
    );
    await repo.saveAsset(asset(sceneId: 'scene-main'));
    await repo.saveRoom(const Room(
        id: 'r1', assetId: 'a1', name: 'Kitchen', remoteSceneId: 'scene-k'));
    await open(tester);

    await tester.tap(find.byTooltip('Delete room'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Could not delete the room. Not your tour'),
        findsOneWidget);
    expect(await repo.getRooms('a1'), hasLength(1));
  });
}
