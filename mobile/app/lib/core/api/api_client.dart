import 'dart:async';

import 'package:dio/dio.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../env.dart';

/// Session-expired state: `true` once the single 401 refresh has failed (the
/// session can no longer be refreshed and the user must sign in again), `false`
/// again after the next successful authenticated response. UI listens to show a
/// "Session expired" banner; the upload queue holds jobs in `waiting-auth`
/// instead of burning retry attempts.
final StreamController<bool> _authExpired = StreamController<bool>.broadcast();

/// The current state first, then every change. A listener that arrives after
/// the expiry (a screen opened later) still sees it.
Stream<bool> get authExpiredStream async* {
  yield _authExpiredSignaled;
  yield* _authExpired.stream;
}

bool _authExpiredSignaled = false;

/// Emit the session-expired signal at most once per expiry episode (reset by
/// the next successful authenticated response).
void _signalAuthExpired() {
  if (_authExpiredSignaled) return;
  _authExpiredSignaled = true;
  _authExpired.add(true);
}

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
    onResponse: (response, handler) {
      // A successful authed request means the session is healthy again;
      // allow the next expiry episode to signal once more.
      if (response.requestOptions.headers.containsKey('Authorization') &&
          _authExpiredSignaled) {
        _authExpiredSignaled = false;
        _authExpired.add(false);
      }
      handler.next(response);
    },
    onError: (error, handler) async {
      final auth = client()?.auth;
      final alreadyRetried = error.requestOptions.extra['retried'] == true;
      if (error.response?.statusCode == 401 &&
          auth != null &&
          !alreadyRetried) {
        String? token;
        try {
          final refresh = inflightRefresh ??= () async {
            try {
              final refreshed = await auth.refreshSession();
              return refreshed.session?.accessToken;
            } finally {
              inflightRefresh = null;
            }
          }();
          token = await refresh;
        } catch (_) {
          // Refresh failed (network or expired refresh token): the session
          // is dead. Signal once per expiry episode so the UI can prompt
          // re-auth and the queue can pause retrying.
          _signalAuthExpired();
          return handler.next(error);
        }
        if (token == null) {
          // refreshSession() resolved without a session/token: the refresh
          // token is gone. That is an expiry exactly like a thrown refresh.
          _signalAuthExpired();
          return handler.next(error);
        }
        // Only the refresh decides expiry. A failure of the replayed request
        // is its own error and goes to the caller unchanged.
        final opts = error.requestOptions
          ..headers['Authorization'] = 'Bearer $token'
          ..extra['retried'] = true;
        try {
          return handler.resolve(await dio.fetch<dynamic>(opts));
        } on DioException catch (replayError) {
          return handler.next(replayError);
        }
      }
      handler.next(error);
    },
  ));

  return dio;
}
