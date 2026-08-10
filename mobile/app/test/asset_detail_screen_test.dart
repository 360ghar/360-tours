import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/api/backend_api.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/providers.dart';
import 'package:tours360/core/repositories/repositories.dart';
import 'package:tours360/core/storage/local_store.dart';
import 'package:tours360/core/upload/upload_queue.dart';
import 'package:tours360/features/assets/presentation/asset_detail_screen.dart';

/// Minimal auth repo: a signed-in user whose stream never changes.
class _FakeAuth extends AuthRepository {
  @override
  AppUser get currentUser =>
      const AppUser(id: 'u1', email: 'u@example.com', displayName: 'U');

  final _stream = StreamController<AppUser?>.broadcast();
  @override
  Stream<AppUser?> authStateChanges() => _stream.stream;

  @override
  Future<AppUser> signInWithEmail(String email, String password) =>
      Future.value(currentUser);

  @override
  Future<AppUser> signUpWithEmail(String email, String password) =>
      Future.value(currentUser);

  @override
  Future<AppUser> signInWithApple() => Future.value(currentUser);

  @override
  Future<AppUser> signInWithGoogle() => Future.value(currentUser);

  @override
  Future<void> signOut() async {}
}

/// In-memory asset repository with a broadcast watch stream.
class _FakeAssets extends AssetRepository {
  _FakeAssets(this._assets);

  final Map<String, ScanAsset> _assets;
  final _tick = StreamController<List<ScanAsset>>.broadcast();

  @override
  Stream<List<ScanAsset>> watchAssets(String ownerId) =>
      Stream.value(_assets.values.toList());

  @override
  Future<ScanAsset?> getAsset(String id) async => _assets[id];

  @override
  Future<void> saveAsset(ScanAsset asset) async {
    _assets[asset.id] = asset;
    _tick.add(_assets.values.toList());
  }

  @override
  Future<void> deleteAsset(String id) async {
    _assets.remove(id);
    _tick.add(_assets.values.toList());
  }

  @override
  Future<List<Room>> getRooms(String assetId) async => const [];

  @override
  Stream<List<Room>> watchRooms(String assetId) => Stream.value(const []);

  @override
  Future<void> saveRoom(Room room) async {}

  @override
  Future<void> deleteRoom(String assetId, String roomId) async {}

  @override
  Future<void> enqueueUpload(ScanAsset asset) async {}
}

void main() {
  late Directory dir;
  late UploadQueue queue;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('asset_detail_test');
    final store = LocalStore(dir);
    queue = UploadQueue(
      store,
      BackendApi(Dio()),
      getAsset: (_) async => null,
      saveAsset: (_) async {},
      connectivityChanges: const Stream.empty(),
    );
  });

  tearDown(() => dir.delete(recursive: true));

  ScanAsset asset({
    AssetStatus status = AssetStatus.ready,
    bool published = true,
    bool cloudStitchFailed = false,
    bool cloudStitchPending = false,
    String? tourId = 'tour-1',
    String? panoPath,
  }) => ScanAsset(
    id: 'a1',
    ownerId: 'u1',
    name: 'Living Room',
    status: status,
    createdAt: DateTime(2026, 7, 23),
    remoteTourId: tourId,
    published: published,
    cloudStitchFailed: cloudStitchFailed,
    cloudStitchPending: cloudStitchPending,
    panoramaPath: panoPath,
    panoramaUrl: panoPath == null ? 'https://res.cloudinary.example/p.jpg' : null,
  );

  Future<void> pump(WidgetTester tester, ScanAsset a) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(_FakeAuth()),
          assetRepositoryProvider.overrideWithValue(_FakeAssets({'a1': a})),
          uploadQueueProvider.overrideWithValue(queue),
        ],
        child: const MaterialApp(home: AssetDetailScreen(assetId: 'a1')),
      ),
    );
    // Let the asset FutureProvider resolve (first frame shows a spinner).
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
  }

  /// Scrolls the action list until the View tile is built, then reports its
  /// enabled state (banners above push it below the lazy ListView viewport).
  Future<bool> viewEnabled(WidgetTester tester) async {
    final tileFinder = find.text('View 360°');
    await tester.scrollUntilVisible(
      tileFinder,
      150,
      scrollable: find.byType(Scrollable).first,
    );
    final tile = tester.widget<ListTile>(
      find.ancestor(of: tileFinder, matching: find.byType(ListTile)),
    );
    return tile.enabled;
  }

  group('View 360 button predicate (spec §8)', () {
    testWidgets('enabled when the tour is published and ready', (tester) async {
      await pump(tester, asset());
      expect(await viewEnabled(tester), isTrue);
    });

    testWidgets(
        'enabled when refinement failed but the tour exists — the local '
        'panorama is the fallback', (tester) async {
      await pump(tester, asset(cloudStitchFailed: true));
      expect(await viewEnabled(tester), isTrue);
      expect(find.text('Retry refinement'), findsOneWidget);
      expect(find.text('Use current panorama'), findsOneWidget);
      expect(
        find.textContaining('Panorama refinement could not be completed'),
        findsWidgets,
      );
    });

    testWidgets(
        'enabled while refinement is running in the background (publish '
        'happened)', (tester) async {
      await pump(tester, asset(cloudStitchPending: true));
      expect(await viewEnabled(tester), isTrue);
      expect(
        find.textContaining('refinement is running in the background'),
        findsOneWidget,
      );
    });

    testWidgets('disabled when no tour exists yet (still uploading)',
        (tester) async {
      await pump(
        tester,
        asset(status: AssetStatus.uploading, published: false, tourId: null),
      );
      expect(await viewEnabled(tester), isFalse);
      expect(find.text('Retry upload'), findsNothing);
      expect(find.text('Retry refinement'), findsNothing);
    });

    testWidgets('disabled when upload failed before the tour was created',
        (tester) async {
      await pump(
        tester,
        asset(status: AssetStatus.failed, published: false, tourId: null),
      );
      expect(await viewEnabled(tester), isFalse);
      expect(find.text('Retry upload'), findsOneWidget);
    });
  });

  group('state-specific UX (spec §14)', () {
    testWidgets('ready tour shows "Virtual tour ready" and no retry buttons',
        (tester) async {
      await pump(tester, asset());
      expect(find.text('Virtual tour ready'), findsOneWidget);
      expect(find.text('Retry upload'), findsNothing);
      expect(find.text('Retry refinement'), findsNothing);
    });

    testWidgets('upload failed pre-publish shows the failure banner',
        (tester) async {
      // NOTE: the "saved on this device" variant of this copy requires
      // rendering Image.file, and image decoding is unavailable in this
      // test environment (instantiateImageCodec stalls headless Windows
      // flutter_tester) — the semantic is covered at the queue level by
      // "local panorama stays viewable after cloud refinement failure".
      await pump(
        tester,
        asset(status: AssetStatus.failed, published: false, tourId: null),
      );
      expect(
        find.textContaining('Upload could not be completed'),
        findsWidgets,
      );
      expect(find.text('Retry upload'), findsOneWidget);
    });

    testWidgets('published tour with a failed upload job still shows View',
        (tester) async {
      // Legacy state: publish succeeded but the queue later failed.
      await pump(
        tester,
        asset(
          status: AssetStatus.failed,
          published: true,
          tourId: 'tour-1',
          cloudStitchFailed: true,
        ),
      );
      expect(await viewEnabled(tester), isTrue);
    });
  });
}
