import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/api/api_client.dart';
import 'core/api/backend_api.dart';
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

  @override
  void initState() {
    super.initState();
    // Deep links: share links (/v/{code}) and viewer links (/view/{id})
    // open the matching local asset when this device owns it.
    _links = AppLinks().uriLinkStream.listen(_onLink);
  }

  Future<void> _onLink(Uri uri) async {
    final segments = uri.pathSegments;
    if (segments.length < 2) return;
    final assets = ref.read(assetRepositoryProvider);
    final user = ref.read(authRepositoryProvider).currentUser;
    if (user == null) return;
    final all = await assets.watchAssets(user.id).first;

    ScanAsset? match;
    if (segments[0] == 'v') {
      match = all.where((a) => a.shareCode == segments[1]).firstOrNull;
    } else if (segments[0] == 'view' || segments[0] == 'view3d') {
      match = all.where((a) => a.remoteTourId == segments[1]).firstOrNull;
    }
    if (match != null && mounted) {
      ref.read(routerProvider).go('/asset/${match.id}');
    }
  }

  @override
  void dispose() {
    _links?.cancel();
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
