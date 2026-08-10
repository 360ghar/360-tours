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
import 'package:tours360/features/viewer/presentation/viewer_screen.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart';

// ---------------------------------------------------------------------------
// Minimal WebViewPlatform fake: records loaded URLs, stores the navigation
// delegate callbacks so tests can fire onPageFinished / onWebResourceError /
// onHttpError exactly like the platform would.
// ---------------------------------------------------------------------------

class FakeWebViewPlatform extends WebViewPlatform {
  final loadedUrls = <Uri>[];
  final FakeNavigationDelegate navigationDelegate = FakeNavigationDelegate();

  @override
  PlatformWebViewController createPlatformWebViewController(
    PlatformWebViewControllerCreationParams params,
  ) => FakeWebViewController(params, this);

  @override
  PlatformNavigationDelegate createPlatformNavigationDelegate(
    PlatformNavigationDelegateCreationParams params,
  ) => navigationDelegate;

  @override
  PlatformWebViewWidget createPlatformWebViewWidget(
    PlatformWebViewWidgetCreationParams params,
  ) => FakeWebViewWidget(params);
}

class FakeWebViewController extends PlatformWebViewController {
  FakeWebViewController(
    super.params,
    this.platform,
  ) : super.implementation();

  final FakeWebViewPlatform platform;

  @override
  Future<void> loadRequest(LoadRequestParams params) async {
    platform.loadedUrls.add(params.uri);
  }

  @override
  Future<void> setJavaScriptMode(JavaScriptMode javaScriptMode) async {}

  @override
  Future<void> setBackgroundColor(Color backgroundColor) async {}

  @override
  Future<void> setPlatformNavigationDelegate(
    PlatformNavigationDelegate handler,
  ) async {}
}

class FakeNavigationDelegate extends PlatformNavigationDelegate {
  FakeNavigationDelegate() : super.implementation(const PlatformNavigationDelegateCreationParams());

  void Function(String url)? onPageStartedCb;
  void Function(String url)? onPageFinishedCb;
  void Function(WebResourceError error)? onWebResourceErrorCb;
  void Function(HttpResponseError error)? onHttpErrorCb;

  void firePageFinished(String url) => onPageFinishedCb?.call(url);

  void fireResourceError(WebResourceError error) =>
      onWebResourceErrorCb?.call(error);

  void fireHttpError(HttpResponseError error) => onHttpErrorCb?.call(error);

  @override
  Future<void> setOnPageStarted(PageEventCallback onPageStarted) async {
    onPageStartedCb = onPageStarted;
  }

  @override
  Future<void> setOnPageFinished(PageEventCallback onPageFinished) async {
    onPageFinishedCb = onPageFinished;
  }

  @override
  Future<void> setOnWebResourceError(
    WebResourceErrorCallback onWebResourceError,
  ) async {
    onWebResourceErrorCb = onWebResourceError;
  }

  @override
  Future<void> setOnHttpError(HttpResponseErrorCallback onHttpError) async {
    onHttpErrorCb = onHttpError;
  }
}

class FakeWebViewWidget extends PlatformWebViewWidget {
  FakeWebViewWidget(super.params) : super.implementation();

  @override
  Widget build(BuildContext context) => const SizedBox.expand();
}

// ---------------------------------------------------------------------------
// App fakes
// ---------------------------------------------------------------------------

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

class _FakeAssets extends AssetRepository {
  _FakeAssets(this._assets);

  final Map<String, ScanAsset> _assets;

  @override
  Stream<List<ScanAsset>> watchAssets(String ownerId) =>
      Stream.value(_assets.values.toList());

  @override
  Future<ScanAsset?> getAsset(String id) async => _assets[id];

  @override
  Future<void> saveAsset(ScanAsset asset) async => _assets[asset.id] = asset;

  @override
  Future<void> deleteAsset(String id) async => _assets.remove(id);

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
  late FakeWebViewPlatform platform;

  setUp(() async {
    platform = FakeWebViewPlatform();
    WebViewPlatform.instance = platform;
    dir = await Directory.systemTemp.createTemp('viewer_test');
    final store = LocalStore(dir);
    queue = UploadQueue(
      store,
      BackendApi(Dio()),
      getAsset: (_) async => null,
      saveAsset: (_) async {},
      connectivityChanges: const Stream.empty(),
    );
  });

  tearDown(() async {
    // Note: WebViewPlatform.instance cannot be reset to null (assert).
    await dir.delete(recursive: true);
  });

  ScanAsset asset({
    AssetStatus status = AssetStatus.ready,
    bool published = true,
    String? tourId = 'tour-1',
  }) => ScanAsset(
    id: 'a1',
    ownerId: 'u1',
    name: 'Living Room',
    status: status,
    createdAt: DateTime(2026, 7, 23),
    remoteTourId: tourId,
    published: published,
    panoramaUrl: 'https://res.cloudinary.example/p.jpg',
  );

  Future<void> pump(
    WidgetTester tester,
    ScanAsset a, {
    String mode = 'pano',
  }) => tester.pumpWidget(
    ProviderScope(
      overrides: [
        authRepositoryProvider.overrideWithValue(_FakeAuth()),
        assetRepositoryProvider.overrideWithValue(_FakeAssets({'a1': a})),
        uploadQueueProvider.overrideWithValue(queue),
      ],
      child: MaterialApp(
        home: ViewerScreen(assetId: 'a1', mode: mode),
      ),
    ),
  );

  testWidgets('valid tour loads the canonical embed URL and shows the '
      'loading state', (tester) async {
    await pump(tester, asset());
    await tester.pump();

    expect(
      platform.loadedUrls.single.toString(),
      'https://tours.360ghar.com/embed/tour-1?minimal=1&branding=0',
      reason: 'the canonical viewer host must be used (spec §9)',
    );
    expect(find.text('Loading panorama…'), findsOneWidget);
  });

  testWidgets('3d mode loads the /view3d route', (tester) async {
    await pump(tester, asset(), mode: '3d');
    await tester.pump();
    expect(
      platform.loadedUrls.single.toString(),
      'https://tours.360ghar.com/view3d/tour-1',
    );
  });

  testWidgets('web resource error shows a retry UI, and Retry reloads',
      (tester) async {
    await pump(tester, asset());
    await tester.pump();

    platform.navigationDelegate.fireResourceError(
      WebResourceError(
        errorCode: -2,
        description: 'net::ERR_NAME_NOT_RESOLVED',
        errorType: WebResourceErrorType.hostLookup,
        url: 'https://tours.360ghar.com/embed/tour-1',
      ),
    );
    await tester.pump();

    expect(find.text('Retry'), findsOneWidget);
    expect(
      find.textContaining('Could not load the tour'),
      findsOneWidget,
    );

    await tester.tap(find.text('Retry'));
    await tester.pump();
    expect(platform.loadedUrls.length, 2, reason: 'Retry reloads the tour');
  });

  testWidgets('http error shows a server-error message', (tester) async {
    await pump(tester, asset());
    await tester.pump();

    platform.navigationDelegate.fireHttpError(
      HttpResponseError(
        response: WebResourceResponse(
          uri: Uri.parse('https://tours.360ghar.com/embed/tour-1'),
          statusCode: 404,
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Retry'), findsOneWidget);
    expect(find.textContaining('HTTP 404'), findsOneWidget);
  });

  testWidgets('page finished clears the loading spinner', (tester) async {
    await pump(tester, asset());
    await tester.pump();
    platform.navigationDelegate.firePageFinished(
      'https://tours.360ghar.com/embed/tour-1',
    );
    await tester.pump();
    expect(find.text('Loading panorama…'), findsNothing);
    expect(find.text('Retry'), findsNothing);
  });

  testWidgets('no tour id yet: still-uploading state shows a message',
      (tester) async {
    await pump(
      tester,
      asset(status: AssetStatus.uploading, published: false, tourId: null),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(find.text('This tour is still uploading…'), findsOneWidget);
    expect(platform.loadedUrls, isEmpty);
  });

  testWidgets('failed upload shows the actionable message, not a spinner',
      (tester) async {
    await pump(
      tester,
      asset(status: AssetStatus.failed, published: false, tourId: null),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(find.textContaining('could not be uploaded'), findsOneWidget);
    expect(platform.loadedUrls, isEmpty);
  });
}
