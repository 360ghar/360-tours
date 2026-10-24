import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide Headers;
import 'package:tours360/core/api/api_client.dart';

Session _session(String token) => Session(
      accessToken: token,
      tokenType: 'bearer',
      user: const User(
        id: 'u1',
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '2026-01-01T00:00:00Z',
      ),
    );

class _Auth extends Fake implements GoTrueClient {
  _Auth(this.onRefresh);

  final Future<AuthResponse> Function() onRefresh;
  var _token = 'old';

  @override
  Session? get currentSession => _session(_token);

  /// Like the SDK: a successful refresh makes the new token the current one.
  @override
  Future<AuthResponse> refreshSession([String? refreshToken]) async {
    final response = await onRefresh();
    final fresh = response.session?.accessToken;
    if (fresh != null) _token = fresh;
    return response;
  }
}

class _Supabase extends Fake implements SupabaseClient {
  _Supabase(this._auth);

  final _Auth _auth;

  @override
  GoTrueClient get auth => _auth;
}

/// Answers by token: the stale one gets 401, the fresh one gets [freshStatus].
class _Adapter implements HttpClientAdapter {
  _Adapter({this.freshStatus = 200});

  final int freshStatus;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final fresh = options.headers['Authorization'] == 'Bearer new';
    final status = fresh ? freshStatus : 401;
    return ResponseBody.fromString('{}', status,
        headers: {'content-type': ['application/json']});
  }
}

void main() {
  Dio client({
    required Future<AuthResponse> Function() onRefresh,
    int freshStatus = 200,
  }) {
    final dio = createApiClient(supabase: _Supabase(_Auth(onRefresh)));
    dio.httpClientAdapter = _Adapter(freshStatus: freshStatus);
    return dio;
  }

  Future<bool> expired() => authExpiredStream.first;

  // A healthy authenticated response clears the state between tests.
  setUp(() async {
    final ok = client(
      onRefresh: () async => AuthResponse(session: _session('new')),
    );
    await ok.get<dynamic>('/ping');
  });

  test('a refresh that throws signals expiry and the caller sees the 401',
      () async {
    final dio = client(onRefresh: () async => throw StateError('no network'));
    await expectLater(
      dio.get<dynamic>('/tours'),
      throwsA(isA<DioException>()
          .having((e) => e.response?.statusCode, 'status', 401)),
    );
    expect(await expired(), isTrue);
  });

  test('a refresh with no session signals expiry', () async {
    final dio = client(onRefresh: () async => AuthResponse());
    await expectLater(dio.get<dynamic>('/tours'), throwsA(isA<DioException>()));
    expect(await expired(), isTrue);
  });

  test('a failed replay does not signal expiry and reaches the caller',
      () async {
    final dio = client(
      onRefresh: () async => AuthResponse(session: _session('new')),
      freshStatus: 500,
    );
    await expectLater(
      dio.get<dynamic>('/tours'),
      throwsA(isA<DioException>()
          .having((e) => e.response?.statusCode, 'status', 500)),
    );
    expect(await expired(), isFalse);
  });

  test('the stream yields the current state first, then false on recovery',
      () async {
    final failing = client(onRefresh: () async => throw StateError('x'));
    await expectLater(failing.get<dynamic>('/a'), throwsA(isA<DioException>()));

    final seen = <bool>[];
    final sub = authExpiredStream.listen(seen.add);
    await Future<void>.delayed(Duration.zero);
    expect(seen, [true], reason: 'a late listener still sees the expiry');

    final healthy = client(
      onRefresh: () async => AuthResponse(session: _session('new')),
    );
    await healthy.get<dynamic>('/b'); // 401, refresh, replay 200
    await Future<void>.delayed(Duration.zero);
    expect(seen, [true, false]);
    await sub.cancel();
  });
}
