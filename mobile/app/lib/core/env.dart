import 'package:flutter/services.dart' show rootBundle;

// App environment, resolved in priority order:
//   1. --dart-define flags (build time)
//   2. the bundled `.env` asset (see pubspec.yaml), loaded by [load]
//   3. hardcoded default
// The bundled `.env` carries publishable Supabase keys only — see SECURITY.md.
class Env {
  static const apiBaseDefine = String.fromEnvironment('API_BASE');
  static const apiRootDefine = String.fromEnvironment('API_ROOT');
  static const viewerBaseDefine = String.fromEnvironment('VIEWER_BASE');
  static const supabaseUrlDefine = String.fromEnvironment('SUPABASE_URL');
  static const supabaseAnonKeyDefine =
      String.fromEnvironment('SUPABASE_ANON_KEY');
  static const spatialAiEnabledDefine =
      String.fromEnvironment('SPATIAL_AI_ENABLED');

  static Map<String, String>? _fileValues;

  /// Read the bundled `.env` asset. Safe to call once before use; missing
  /// asset (tests, old builds) just leaves file values empty.
  static Future<void> load() async {
    try {
      final raw = await rootBundle.loadString('.env');
      final values = <String, String>{};
      for (final line in raw.split('\n')) {
        final l = line.trim();
        if (l.isEmpty || l.startsWith('#')) continue;
        final eq = l.indexOf('=');
        if (eq <= 0) continue;
        values[l.substring(0, eq).trim()] = l.substring(eq + 1).trim();
      }
      _fileValues = values;
    } catch (_) {
      _fileValues = const {};
    }
  }

  static String _resolve(String define, String key, String fallback) =>
      define.isNotEmpty
          ? define
          : (_fileValues?[key] ?? fallback);

  static String get apiBase => _resolve(
      apiBaseDefine, 'API_BASE', 'https://api.360ghar.com/api/v1');

  /// Root of the API host (share links live at /v/{code}, not under /api/v1).
  static String get apiRoot =>
      _resolve(apiRootDefine, 'API_ROOT', 'https://api.360ghar.com');

  /// Canonical viewer host (verified live 2026-08-09: serves the deployed
  /// Vite viewer; `/view/:id`, `/embed/:id`, `/view3d/:id`). The legacy
  /// 360viewer.360ghar.com domain does NOT resolve in DNS and must never be
  /// used as a fallback.
  static String get viewerBase => _resolve(
      viewerBaseDefine, 'VIEWER_BASE', 'https://tours.360ghar.com');

  static String get supabaseUrl =>
      _resolve(supabaseUrlDefine, 'SUPABASE_URL', '');

  static String get supabaseAnonKey =>
      _resolve(supabaseAnonKeyDefine, 'SUPABASE_ANON_KEY', '');

  static bool get hasSupabase =>
      supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;

  /// Phase 5: automatically trigger AI spatial navigation after publish.
  /// Currently DISABLED by default — the backend endpoint
  /// (`POST /ai/tours/{tourId}/spatial`) is not deployed to production yet
  /// (canonical `main` lacks it; it exists only on
  /// `feat/metadata-stitching-v2`), so enabling it 404s the AI job on every
  /// publish. Set `SPATIAL_AI_ENABLED=true` to opt in once the backend
  /// deploys. The AI job is strictly non-fatal (the published tour never
  /// depends on it).
  static bool get spatialAiEnabled =>
      _resolve(spatialAiEnabledDefine, 'SPATIAL_AI_ENABLED', 'false') ==
      'true';
}
