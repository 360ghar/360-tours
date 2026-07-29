import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/analytics/presentation/analytics_screen.dart';
import '../features/assets/presentation/asset_detail_screen.dart';
import '../features/assets/presentation/asset_list_screen.dart';
import '../features/auth/presentation/sign_in_screen.dart';
import '../features/capture/presentation/capture_screen.dart';
import '../features/lidar/presentation/lidar_scan_screen.dart';
import '../features/settings/presentation/settings_screen.dart';
import '../features/share/presentation/share_screen.dart';
import '../features/threed/presentation/generate_3d_screen.dart';
import '../features/tours/presentation/floor_plan_screen.dart';
import '../features/tours/presentation/hotspot_editor_screen.dart';
import '../features/tours/presentation/room_list_screen.dart';
import '../features/viewer/presentation/viewer_screen.dart';
import 'models/models.dart';
import 'providers.dart';

/// Bridges the auth stream into go_router's refreshListenable.
class AuthNotifier extends ChangeNotifier {
  AuthNotifier(Stream<AppUser?> stream, this.currentUser) {
    _sub = stream.listen(
      (user) {
        currentUser = user;
        restoring = false;
        notifyListeners();
      },
      onError: (Object e) {
        // A transient stream error (e.g. a dropped connection mid token
        // refresh) must not sign the user out. Keep the last known user and
        // just mark the restore as settled so routing can proceed.
        debugPrint('Auth stream error: $e');
        restoring = false;
        notifyListeners();
      },
    );
  }

  AppUser? currentUser;

  /// True until the first auth stream event settles. While restoring we must
  /// not redirect: a background token refresh can momentarily emit null and
  /// bounce a signed-in user to /signin.
  bool restoring = true;

  late final StreamSubscription<AppUser?> _sub;

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authRepositoryProvider);
  final notifier = AuthNotifier(auth.authStateChanges(), auth.currentUser);
  ref.onDispose(notifier.dispose);

  return GoRouter(
    refreshListenable: notifier,
    redirect: (context, state) {
      final onSignIn = state.matchedLocation == '/signin';
      final onSplash = state.matchedLocation == '/splash';
      // While the session is still restoring, never bounce the user around:
      // park them on the splash screen until the first auth event settles.
      if (notifier.restoring) {
        return onSplash ? null : '/splash';
      }
      final signedIn = notifier.currentUser != null;
      if (!signedIn && !onSignIn) return '/signin';
      if (signedIn && (onSignIn || onSplash)) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const _SplashScreen()),
      GoRoute(path: '/signin', builder: (_, _) => const SignInScreen()),
      GoRoute(path: '/', builder: (_, _) => const AssetListScreen()),
      GoRoute(
        path: '/capture',
        pageBuilder: (_, state) => MaterialPage(
          fullscreenDialog: true,
          child: CaptureScreen(
            assetId: state.uri.queryParameters['assetId'],
          ),
        ),
      ),
      GoRoute(
        path: '/lidar',
        builder: (_, _) => const LidarScanScreen(),
      ),
      GoRoute(
        path: '/settings',
        builder: (_, _) => const SettingsScreen(),
      ),
      GoRoute(
        path: '/asset/:id',
        builder: (_, state) =>
            AssetDetailScreen(assetId: state.pathParameters['id']!),
        routes: [
          GoRoute(
            path: 'view',
            builder: (_, state) => ViewerScreen(
              assetId: state.pathParameters['id']!,
              mode: state.uri.queryParameters['mode'] ?? 'pano',
            ),
          ),
          GoRoute(
            path: 'share',
            builder: (_, state) =>
                ShareScreen(assetId: state.pathParameters['id']!),
          ),
          GoRoute(
            path: 'rooms',
            builder: (_, state) =>
                RoomListScreen(assetId: state.pathParameters['id']!),
          ),
          GoRoute(
            path: 'rooms/:roomId/hotspots',
            builder: (_, state) => HotspotEditorScreen(
              assetId: state.pathParameters['id']!,
              roomId: state.pathParameters['roomId']!,
            ),
          ),
          GoRoute(
            path: 'generate3d',
            builder: (_, state) =>
                Generate3dScreen(assetId: state.pathParameters['id']!),
          ),
          GoRoute(
            path: 'floorplan',
            builder: (_, state) =>
                FloorPlanScreen(assetId: state.pathParameters['id']!),
          ),
          GoRoute(
            path: 'analytics',
            builder: (_, state) =>
                AnalyticsScreen(assetId: state.pathParameters['id']!),
          ),
        ],
      ),
    ],
  );
});

/// Minimal loading screen shown while the auth session restores, so the user
/// is never flashed the sign-in screen before the session is known.
class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
