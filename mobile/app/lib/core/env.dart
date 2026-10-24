// Build-time environment. Override with --dart-define; defaults point at prod.
class Env {
  static const apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'https://api.360ghar.com/api/v1',
  );

  static const _apiRootDefine = String.fromEnvironment('API_ROOT');

  /// Root of the API host (share links live at /v/{code}, not under /api/v1).
  /// `API_ROOT` when set, else [apiBase] without `/api/v1`, so a build that
  /// overrides only `API_BASE` (staging) never builds links to production. A
  /// release build must name the same host as the backend's `PUBLIC_BASE_URL`,
  /// because the backend renders the QR code with that host.
  static String get apiRoot => _apiRootDefine.isNotEmpty
      ? _apiRootDefine
      : apiBase.replaceFirst(RegExp(r'/api/v1/?$'), '');

  static const viewerBase = String.fromEnvironment(
    'VIEWER_BASE',
    defaultValue: 'https://tours.360ghar.com',
  );

  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  static bool get hasSupabase =>
      supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;
}
