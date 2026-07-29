import 'package:dio/dio.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../env.dart';

/// Dio client for api.360ghar.com with the Supabase JWT attached.
/// The Supabase SDK refreshes sessions itself; on a 401 we force one refresh
/// and replay the request once.
Dio createApiClient({SupabaseClient? supabase}) {
  final dio = Dio(BaseOptions(
    baseUrl: Env.apiBase,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 30),
    sendTimeout: const Duration(seconds: 30),
  ));

  SupabaseClient? client() {
    if (supabase != null) return supabase;
    try {
      return Supabase.instance.client;
    } catch (_) {
      return null; // Supabase not initialized (tests, missing env)
    }
  }

  // Single-flight the 401 refresh: concurrent 401s share one in-flight
  // refreshSession() call instead of each triggering its own.
  Future<String?>? inflightRefresh;

  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      final token = client()?.auth.currentSession?.accessToken;
      if (token != null) {
        options.headers['Authorization'] = 'Bearer $token';
      }
      handler.next(options);
    },
    onError: (error, handler) async {
      final auth = client()?.auth;
      final alreadyRetried = error.requestOptions.extra['retried'] == true;
      if (error.response?.statusCode == 401 &&
          auth != null &&
          !alreadyRetried) {
        try {
          final refresh = inflightRefresh ??= () async {
            try {
              final refreshed = await auth.refreshSession();
              return refreshed.session?.accessToken;
            } finally {
              inflightRefresh = null;
            }
          }();
          final token = await refresh;
          if (token != null) {
            final opts = error.requestOptions
              ..headers['Authorization'] = 'Bearer $token'
              ..extra['retried'] = true;
            final response = await dio.fetch<dynamic>(opts);
            return handler.resolve(response);
          }
        } catch (_) {
          // fall through to the original 401
        }
      }
      handler.next(error);
    },
  ));

  return dio;
}
