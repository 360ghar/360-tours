import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart' as apple;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/api/backend_api.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/repositories.dart';

/// Auth via Supabase (the backend verifies the Supabase JWT). Google and
/// Apple use native sign-in and hand the id token to Supabase.
class SupabaseAuthRepository implements AuthRepository {
  SupabaseAuthRepository(this._client, this._api);

  final SupabaseClient _client;
  final BackendApi _api;
  Future<void>? _googleInit;

  AppUser? _map(User? user) => user == null
      ? null
      : AppUser(
          id: user.id,
          email: user.email ?? '',
          displayName: (user.userMetadata?['full_name'] ??
              user.userMetadata?['name']) as String?,
          photoUrl: user.userMetadata?['avatar_url'] as String?,
        );

  @override
  AppUser? get currentUser => _map(_client.auth.currentUser);

  @override
  Stream<AppUser?> authStateChanges() =>
      _client.auth.onAuthStateChange.map((s) => _map(s.session?.user));

  @override
  Future<AppUser> signInWithEmail(String email, String password) async {
    final res = await _client.auth
        .signInWithPassword(email: email, password: password);
    final user = _map(res.user);
    if (user == null) {
      throw const AuthException('Sign-in did not return a user.');
    }
    return user;
  }

  @override
  Future<AppUser> signUpWithEmail(String email, String password) async {
    final res = await _client.auth.signUp(email: email, password: password);
    final user = _map(res.user);
    if (user == null) {
      throw const AuthException('Sign-up requires email confirmation.');
    }
    return user;
  }

  Future<void> _initGoogle() async {
    final google = GoogleSignIn.instance;
    // Client IDs come from the backend so they aren't baked into the app.
    final config = await _api.getAuthConfig();
    final iosClientId = config['google_ios_client_id'] as String?;
    if (Platform.isIOS && (iosClientId == null || iosClientId.isEmpty)) {
      throw const AuthException(
          "Google sign-in isn't available on this device yet.");
    }
    await google.initialize(
      clientId: iosClientId,
      serverClientId: config['google_web_client_id'] as String?,
    );
  }

  @override
  Future<AppUser> signInWithGoogle() async {
    final google = GoogleSignIn.instance;
    // Guard against concurrent taps both entering initialization. On failure
    // we clear the cached future so the next tap retries instead of replaying
    // a permanently failed init (e.g. a transient getAuthConfig network error).
    final init = _googleInit ??= _initGoogle();
    try {
      await init;
    } catch (e) {
      _googleInit = null;
      rethrow;
    }
    final account = await google.authenticate();
    final idToken = account.authentication.idToken;
    if (idToken == null) {
      throw const AuthException('Google sign-in returned no idToken');
    }
    final res = await _client.auth.signInWithIdToken(
      provider: OAuthProvider.google,
      idToken: idToken,
    );
    final user = _map(res.user);
    if (user == null) {
      throw const AuthException('Sign-in did not return a user.');
    }
    return user;
  }

  String _generateRawNonce([int length = 32]) {
    final random = Random.secure();
    final bytes = List<int>.generate(length, (_) => random.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }

  String _sha256Hex(String input) {
    final digest = sha256.convert(utf8.encode(input));
    return digest.bytes
        .map((b) => b.toRadixString(16).padLeft(2, '0'))
        .join();
  }

  @override
  Future<AppUser> signInWithApple() async {
    final rawNonce = _generateRawNonce();
    final hashedNonce = _sha256Hex(rawNonce);
    final credential = await apple.SignInWithApple.getAppleIDCredential(
      scopes: [
        apple.AppleIDAuthorizationScopes.email,
        apple.AppleIDAuthorizationScopes.fullName,
      ],
      nonce: hashedNonce,
    );
    final idToken = credential.identityToken;
    if (idToken == null) {
      throw const AuthException('Apple sign-in returned no identityToken');
    }
    final res = await _client.auth.signInWithIdToken(
      provider: OAuthProvider.apple,
      idToken: idToken,
      nonce: rawNonce,
    );
    final user = _map(res.user);
    if (user == null) {
      throw const AuthException('Sign-in did not return a user.');
    }
    return user;
  }

  @override
  Future<void> signOut() => _client.auth.signOut();
}
