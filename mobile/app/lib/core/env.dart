// Build-time environment. Override with --dart-define; defaults point at prod.
class Env {
  static const apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'https://api.360ghar.com/api/v1',
  );

  /// Root of the API host (share links live at /v/{code}, not under /api/v1).
  static const apiRoot = String.fromEnvironment(
    'API_ROOT',
    defaultValue: 'https://api.360ghar.com',
  );

  static const viewerBase = String.fromEnvironment(
    'VIEWER_BASE',
    defaultValue: 'https://360viewer.360ghar.com',
  );

  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  static bool get hasSupabase =>
      supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;
}
