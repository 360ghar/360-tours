import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import 'core/api/api_client.dart';
import 'core/api/backend_api.dart';
import 'core/deep_links.dart';
import 'core/env.dart';
import 'core/models/models.dart';
import 'core/providers.dart';
import 'core/router.dart';
import 'core/storage/local_store.dart';
import 'core/theme/app_theme.dart';
import 'core/upload/upload_queue.dart';
import 'features/assets/data/local_asset_repository.dart';
import 'features/auth/data/supabase_auth_repository.dart';
import 'features/share/data/api_share_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (!Env.hasSupabase) {
    // Fail loudly at startup instead of mysteriously at first sign-in.
    runApp(const _MissingEnvApp());
    return;
  }

  await Supabase.initialize(
    url: Env.supabaseUrl,
    // Legacy anon keys stay valid; the project still issues them.
    // ignore: deprecated_member_use
    anonKey: Env.supabaseAnonKey,
  );

  final docs = await getApplicationDocumentsDirectory();
  final store = LocalStore(docs);
  final api = BackendApi(createApiClient());

  // Wire the object graph once, here — everything else uses providers.
  late final LocalAssetRepository assets;
  final queue = UploadQueue(
    store,
    api,
    getAsset: (id) => assets.getAsset(id),
    saveAsset: (a) => assets.saveAsset(a),
    getRooms: (assetId) => assets.getRooms(assetId),
    saveRoom: (r) => assets.saveRoom(r),
  );
  assets = LocalAssetRepository(
    store,
    enqueue: queue.enqueue,
    enqueueRoom: queue.enqueueRoom,
    remoteDelete: (a) => api.deleteTour(a.remoteTourId!),
    remoteDeleteScene: (sceneId) async {
      try {
        await api.deleteScene(sceneId);
      } catch (_) {
        // best-effort
      }
    },
  );
  final auth = SupabaseAuthRepository(Supabase.instance.client, api);
  final share = ApiShareRepository(api, saveAsset: assets.saveAsset);

  // Resume any interrupted uploads from the last session.
  queue.pump();

  runApp(ProviderScope(
    overrides: [
      authRepositoryProvider.overrideWithValue(auth),
      assetRepositoryProvider.overrideWithValue(assets),
      shareRepositoryProvider.overrideWithValue(share),
      backendApiProvider.overrideWithValue(api),
      uploadQueueProvider.overrideWithValue(queue),
    ],
    child: const ToursApp(),
  ));
}

class ToursApp extends ConsumerStatefulWidget {
  const ToursApp({super.key});

  @override
  ConsumerState<ToursApp> createState() => _ToursAppState();
}

class _ToursAppState extends ConsumerState<ToursApp> {
  StreamSubscription<Uri>? _links;
  StreamSubscription<AppUser?>? _authSub;

  /// Cold-start / signed-out deep link waiting for a session.
  Uri? _pendingDeepLink;

  @override
  void initState() {
    super.initState();
    // Deep links: share links (/v/{code}) and viewer links (/view/{id},
    // /view3d/{id}) open the matching local asset when this device owns it.
    final appLinks = AppLinks();
    _links = appLinks.uriLinkStream.listen(_onLink);
    // Cold start: the URI that launched the app only arrives via
    // getInitialLink, never through the stream — without this the link that
    // opened the app is silently dropped.
    appLinks.getInitialLink().then((uri) {
      if (uri != null) _onLink(uri);
    }).catchError((Object _) {
      // No initial URI (normal cold start) — nothing to do.
    });
    // A deep link that arrives while signed out is stashed and re-runs once
    // a session exists (the router parks on /splash until then).
    _authSub =
        ref.read(authRepositoryProvider).authStateChanges().listen((user) {
      final pending = _pendingDeepLink;
      if (user != null && pending != null) {
        _pendingDeepLink = null;
        _onLink(pending);
      }
    });
  }

  Future<void> _onLink(Uri uri) async {
    final intent = parseDeepLink(uri);
    if (intent == null) return;
    final auth = ref.read(authRepositoryProvider);
    final user = auth.currentUser;
    if (user == null) {
      // Signed out: keep the link and navigate after sign-in.
      _pendingDeepLink = uri;
      return;
    }
    final all = await ref
        .read(assetRepositoryProvider)
        .watchAssets(user.id)
        .first;
    if (!mounted) return;

    ScanAsset? match;
    if (intent.toViewer) {
      match = all.where((a) => a.remoteTourId == intent.ref).firstOrNull;
    } else {
      match = all.where((a) => a.shareCode == intent.ref).firstOrNull;
    }
    if (match == null) {
      // Not owned by this device: open the web viewer in the system browser
      // instead of silently ignoring the link.
      try {
        await launchUrl(deepLinkBrowserUrl(uri),
            mode: LaunchMode.externalApplication);
      } catch (e) {
        debugPrint('Could not open deep link in browser: $e');
      }
      return;
    }
    final router = ref.read(routerProvider);
    if (intent.toViewer) {
      final mode =
          resolveViewerMode(intent.mode, hasModel3d: match.model3dUrl != null);
      router.go('/asset/${match.id}/view?mode=$mode');
    } else {
      router.go('/asset/${match.id}');
    }
  }

  @override
  void dispose() {
    _links?.cancel();
    _authSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: '360 Tours',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark(),
      routerConfig: router,
    );
  }
}

class _MissingEnvApp extends StatelessWidget {
  const _MissingEnvApp();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: AppTheme.dark(),
      home: const Scaffold(
        body: Center(
          child: Padding(
            padding: EdgeInsets.all(32),
            child: Text(
              'Missing SUPABASE_URL / SUPABASE_ANON_KEY.\n\n'
              'Run with:\nflutter run --dart-define=SUPABASE_URL=… '
              '--dart-define=SUPABASE_ANON_KEY=…',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    );
  }
}
