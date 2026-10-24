// The floor-plan screen: it draws the tour's plan with the markers the server
// stored, and it can ask the server to sketch a plan from the tour's rooms and
// doorway links.

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:tours360/core/api/api_exception.dart';
import 'package:tours360/core/models/api_dtos.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/providers.dart';
import 'package:tours360/features/tours/presentation/floor_plan_screen.dart';

import 'fakes.dart';

void main() {
  late FakeBackendApi api;
  late FakeAssetRepository repo;

  const tourId = 'tour-1';

  Future<void> open(WidgetTester tester) async {
    final router = GoRouter(routes: [
      GoRoute(
          path: '/',
          builder: (_, _) => const FloorPlanScreen(assetId: 'a1')),
      GoRoute(
        path: '/asset/:id/scenes/:sceneId/hotspots',
        builder: (_, state) =>
            Scaffold(body: Text('editor ${state.pathParameters['sceneId']}')),
      ),
    ]);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        backendApiProvider.overrideWithValue(api),
        assetRepositoryProvider.overrideWithValue(repo),
        authRepositoryProvider.overrideWithValue(
            FakeAuthRepository(user: const AppUser(id: 'u1', email: 'a@example.com'))),
      ],
      child: MaterialApp.router(routerConfig: router),
    ));
    await tester.pumpAndSettle();
  }

  setUp(() async {
    api = FakeBackendApi();
    repo = FakeAssetRepository();
    await repo.saveAsset(ScanAsset(
      id: 'a1',
      ownerId: 'u1',
      name: 'Flat 4B',
      status: AssetStatus.ready,
      createdAt: DateTime(2026),
      remoteTourId: tourId,
      remoteSceneId: 'scene-main',
    ));
  });

  testWidgets('draws the plan with a numbered marker that opens its scene',
      (tester) async {
    api.floorPlanList.add(const FloorPlanDto(
      id: 'fp-1',
      tourId: tourId,
      name: 'Ground floor',
      imageUrl: 'https://cdn.example.com/plan.png',
      floorNumber: 1,
      markers: [
        FloorPlanMarkerDto(
            sceneId: 'scene-main', x: 40.5, y: 22, label: 'Living room'),
        FloorPlanMarkerDto(
            sceneId: 'scene-kitchen', x: 70, y: 60, label: 'Kitchen'),
      ],
    ));

    await open(tester);

    expect(find.text('Ground floor'), findsOneWidget);
    expect(find.text('Floor 1'), findsOneWidget);
    // The markers are on the drawing (numbered) and listed by name below it.
    expect(find.text('1'), findsWidgets);
    expect(find.text('2'), findsWidgets);
    expect(find.text('Living room'), findsOneWidget);
    expect(find.text('Kitchen'), findsOneWidget);

    await tester.ensureVisible(find.text('Kitchen'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Kitchen'));
    await tester.pumpAndSettle();

    expect(find.text('editor scene-kitchen'), findsOneWidget);
  });

  testWidgets('a pin sits at the marker percentage of the drawing',
      (tester) async {
    api.floorPlanList.add(const FloorPlanDto(
      id: 'fp-1',
      tourId: tourId,
      name: 'Ground floor',
      imageUrl: 'https://cdn.example.com/plan.png',
      floorNumber: 1,
      markers: [
        FloorPlanMarkerDto(
            sceneId: 'scene-main', x: 40.5, y: 22, label: 'Living room'),
        FloorPlanMarkerDto(
            sceneId: 'scene-kitchen', x: 70, y: 60, label: 'Kitchen'),
      ],
    ));

    await open(tester);

    // In a widget test the image cannot load, so the drawing is the error
    // box (aspect 1.4). The pins must sit at their stored percentages of it.
    final drawing = tester.getRect(find.byType(CachedNetworkImage));
    for (final marker in [('Living room', 0.405, 0.22), ('Kitchen', 0.70, 0.60)]) {
      final centre = tester.getCenter(find.byTooltip(marker.$1));
      expect(centre.dx, closeTo(drawing.left + drawing.width * marker.$2, 0.5),
          reason: '${marker.$1} x');
      expect(centre.dy, closeTo(drawing.top + drawing.height * marker.$3, 0.5),
          reason: '${marker.$1} y');
    }
  });

  testWidgets('a marker with no label still reads as a room', (tester) async {    api.floorPlanList.add(const FloorPlanDto(
      id: 'fp-1',
      tourId: tourId,
      name: 'Ground floor',
      imageUrl: 'https://cdn.example.com/plan.png',
      floorNumber: 1,
      markers: [
        FloorPlanMarkerDto(sceneId: 'scene-main', x: 0, y: 0, label: null),
      ],
    ));

    await open(tester);

    expect(find.text('Room 1'), findsOneWidget);
  });

  testWidgets('an empty list offers to generate a plan from the tour',
      (tester) async {
    await open(tester);

    expect(find.text('No floor plan yet.'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Generate from tour'));
    await tester.pumpAndSettle();

    expect(api.calls, contains('generateFloorPlan:$tourId'));
    // The list is refetched, so the new plan is on screen.
    expect(find.text('Estimated layout (AI)'), findsOneWidget);
    expect(find.text('Living room'), findsOneWidget);
    expect(find.textContaining('schematic, not to scale'), findsOneWidget);
  });

  testWidgets('the app bar action generates too', (tester) async {
    api.floorPlanList.add(const FloorPlanDto(
      id: 'fp-1',
      tourId: tourId,
      name: 'Ground floor',
      imageUrl: 'https://cdn.example.com/plan.png',
      floorNumber: 1,
      markers: [],
    ));

    await open(tester);

    await tester.tap(find.byTooltip('Generate from tour'));
    await tester.pumpAndSettle();

    expect(api.calls, contains('generateFloorPlan:$tourId'));
  });

  testWidgets('a plan that cannot be generated says why', (tester) async {
    api.generateFloorPlanError = const ApiException(
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'A floor plan needs at least two scenes.',
    );

    await open(tester);

    await tester.tap(find.widgetWithText(FilledButton, 'Generate from tour'));
    await tester.pumpAndSettle();

    expect(find.textContaining('A floor plan needs at least two scenes.'),
        findsOneWidget);
    expect(find.text('No floor plan yet.'), findsOneWidget);
  });
}
