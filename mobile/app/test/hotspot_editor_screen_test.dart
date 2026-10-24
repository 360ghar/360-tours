// The hotspot editor against a scripted API and a fake WebView. These tests
// pin the three defects the screen had: an edit that deleted the hotspot before
// it created the new one, a create that swallowed its error, and a main-room
// editor that listed nothing.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/api/api_exception.dart';
import 'package:tours360/core/models/api_dtos.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/models/wire_enums.dart';
import 'package:tours360/core/providers.dart';
import 'package:tours360/features/tours/presentation/hotspot_editor_screen.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart';

import 'fake_webview.dart';
import 'fakes.dart';

void main() {
  late FakeWebViewPlatform platform;
  late FakeBackendApi api;
  late FakeAssetRepository repo;

  const mainScene = 'scene-main';
  const kitchenScene = 'scene-kitchen';

  HotspotDto hotspot(String id, {String title = 'Kitchen'}) => HotspotDto(
        id: id,
        sceneId: mainScene,
        type: HotspotType.navigation,
        title: title,
        yawDeg: 45,
        pitchDeg: -10,
        targetSceneId: kitchenScene,
        isActive: true,
      );

  setUp(() async {
    platform = FakeWebViewPlatform();
    WebViewPlatform.instance = platform;
    api = FakeBackendApi()..hotspotList.add(hotspot('h-1'));
    repo = FakeAssetRepository();
    await repo.saveAsset(ScanAsset(
      id: 'a1',
      ownerId: 'u1',
      name: 'Living room',
      status: AssetStatus.ready,
      createdAt: DateTime(2026),
      remoteTourId: 'tour-1',
      remoteSceneId: mainScene,
    ));
    await repo.saveRoom(const Room(
      id: 'r1',
      assetId: 'a1',
      name: 'Kitchen',
      remoteSceneId: kitchenScene,
    ));
  });

  Future<void> open(WidgetTester tester, {String scene = mainScene}) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        assetRepositoryProvider.overrideWithValue(repo),
        backendApiProvider.overrideWithValue(api),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository(
            user: const AppUser(id: 'u1', email: 'a@example.com'))),
      ],
      child: MaterialApp(
        home: HotspotEditorScreen(assetId: 'a1', sceneId: scene),
      ),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('the main room lists its hotspots, read by its real scene id',
      (tester) async {
    await open(tester);
    expect(api.calls, contains('getHotspots:$mainScene'));
    expect(find.text('Kitchen'), findsOneWidget);
    expect(find.textContaining('navigation'), findsOneWidget);
  });

  testWidgets('the viewer opens on the edited scene', (tester) async {
    await open(tester);
    final url = platform.controller!.loaded.single;
    expect(url.path, '/embed/tour-1');
    expect(url.queryParameters['scene'], mainScene);
    expect(url.queryParameters['editmode'], '1');
  });

  testWidgets('editing a destination is one PATCH, never delete then create',
      (tester) async {
    await open(tester);
    await tester.tap(find.byTooltip('Edit destination'));
    await tester.pumpAndSettle();

    // The scene the hotspot sits in is not offered as a destination.
    expect(find.text('Living room (main)'), findsNothing);
    await tester.tap(find.text('Kitchen').last);
    await tester.pumpAndSettle();

    final writes = api.calls.where((c) =>
        c.startsWith('updateHotspot') ||
        c.startsWith('deleteHotspot') ||
        c.startsWith('createHotspot'));
    expect(writes, ['updateHotspot:h-1:$kitchenScene']);
  });

  testWidgets('a failed edit says why and leaves the hotspot in place',
      (tester) async {
    await open(tester);
    api.updateError = const ApiException(
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'Target scene belongs to another tour');
    await tester.tap(find.byTooltip('Edit destination'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Kitchen').last);
    await tester.pumpAndSettle();

    expect(find.textContaining('Target scene belongs to another tour'),
        findsOneWidget);
    expect(api.calls.where((c) => c.startsWith('deleteHotspot')), isEmpty,
        reason: 'the old hotspot must survive a failed edit');
    expect(find.text('Kitchen'), findsOneWidget,
        reason: 'the list still shows the hotspot');
  });

  testWidgets('a hotspot that is not navigation has no edit action',
      (tester) async {
    api.hotspotList
      ..clear()
      ..add(const HotspotDto(
        id: 'h-9',
        sceneId: mainScene,
        type: HotspotType.info,
        title: 'Notice board',
        yawDeg: 20,
        pitchDeg: 0,
        targetSceneId: null,
        isActive: true,
      ));
    await open(tester);
    expect(find.text('Notice board'), findsOneWidget);
    expect(find.byTooltip('Edit destination'), findsNothing,
        reason: 'the server drops a target on a non-navigation hotspot');
    expect(find.byTooltip('Delete hotspot'), findsOneWidget);
    expect(api.calls.where((c) => c.startsWith('updateHotspot')), isEmpty);
  });

  testWidgets('an answer without the chosen target is a failure, not success',
      (tester) async {
    await open(tester);
    api.updateDropsTarget = true;
    await tester.tap(find.byTooltip('Edit destination'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Kitchen').last);
    await tester.pumpAndSettle();

    expect(find.textContaining('Could not update the hotspot.'),
        findsOneWidget);
    expect(find.textContaining('Hotspot now leads to'), findsNothing);
    expect(api.calls.where((c) => c == 'getHotspots:$mainScene'), hasLength(2),
        reason: 'the list is read again after the refused edit');
  });

  String click({String scene = mainScene}) => jsonEncode({
        'type': 'panoramaClick',
        'data': {'yaw': 12.5, 'pitch': -3.0, 'sceneId': scene},
      });

  testWidgets('a tap in the viewer places a hotspot on the tapped scene',
      (tester) async {
    await open(tester);
    platform.controller!.post('FlutterBridge', click());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Kitchen').last);
    await tester.pumpAndSettle();
    expect(api.calls, contains('createHotspot:$mainScene:$kitchenScene'));
  });

  testWidgets('a failed placement is shown, not swallowed', (tester) async {
    await open(tester);
    api.createError = const ApiException(
        statusCode: 422,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        fields: [
          ApiFieldError(
              field: 'body.position.yaw',
              msg: 'Input should be less than or equal to 180',
              type: 'less_than_equal'),
        ]);
    platform.controller!.post('FlutterBridge', click());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Kitchen').last);
    await tester.pumpAndSettle();

    expect(find.textContaining('Could not place the hotspot.'), findsOneWidget);
    expect(find.textContaining('position.yaw'), findsOneWidget);
    expect(api.calls.where((c) => c.startsWith('createHotspot')), isEmpty);
  });

  testWidgets('with no other scene, a tap explains instead of calling the API',
      (tester) async {
    await repo.deleteRoom('a1', 'r1');
    await open(tester);
    platform.controller!.post('FlutterBridge', click());
    await tester.pumpAndSettle();
    expect(find.textContaining('Add another room first'), findsOneWidget);
    expect(api.calls.where((c) => c.startsWith('createHotspot')), isEmpty);
  });

  testWidgets('delete asks first, then calls the API and drops the row',
      (tester) async {
    await open(tester);
    await tester.tap(find.byTooltip('Delete hotspot'));
    await tester.pumpAndSettle();
    expect(api.calls.where((c) => c.startsWith('deleteHotspot')), isEmpty);
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(api.calls, contains('deleteHotspot:h-1'));
    expect(find.text('Hotspot deleted'), findsOneWidget);
  });

  testWidgets('a failed delete says why and reads the list again',
      (tester) async {
    await open(tester);
    api.deleteError = const ApiException(
        statusCode: 404, code: 'NOT_FOUND', message: 'Hotspot not found');
    await tester.tap(find.byTooltip('Delete hotspot'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Hotspot not found'), findsOneWidget);
    expect(api.calls.where((c) => c == 'getHotspots:$mainScene'), hasLength(2),
        reason: 'a stale row must not stay until the screen is reopened');
  });

  testWidgets('a hotspot with no stored position still lists', (tester) async {
    api.hotspotList
      ..clear()
      ..add(const HotspotDto(
        id: 'h-9',
        sceneId: mainScene,
        type: HotspotType.info,
        title: null,
        yawDeg: null,
        pitchDeg: null,
        targetSceneId: null,
        isActive: true,
      ));
    await open(tester);
    expect(find.text('Untitled hotspot'), findsOneWidget);
    expect(find.text('info'), findsOneWidget);
  });
}
