import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/repositories/repositories.dart';
import '../../../core/theme/app_theme.dart';

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _signUp = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      // Router redirect takes over on auth state change.
    } catch (e) {
      final message = _friendly(e);
      if (mounted && message != null) setState(() => _error = message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Maps an error to a friendly user-facing message, or `null` when the
  /// error is a benign cancellation that should not be surfaced.
  String? _friendly(Object e) {
    final s = e.toString();
    if (s.contains('Invalid login credentials')) {
      return 'Wrong email or password.';
    }
    if (s.contains('email confirmation')) {
      return 'Check your inbox to confirm your email.';
    }
    if (s.contains('canceled') || s.contains('cancelled')) return null;
    return 'Sign-in failed. Check your connection and try again.';
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.read(authRepositoryProvider);
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: MediaQuery.sizeOf(context).height -
                  MediaQuery.paddingOf(context).vertical,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 96),
                // Wordmark: type only, no logo tile.
                Text(
                  '360 Tours',
                  style: Theme.of(context).textTheme.displaySmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: -1.5,
                      ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Capture a room. Share it in a minute.',
                  style: TextStyle(color: AppColors.inkDim, fontSize: 16),
                ),
                const SizedBox(height: 56),
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: const InputDecoration(hintText: 'Email'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _password,
                  obscureText: true,
                  decoration: const InputDecoration(hintText: 'Password'),
                  onSubmitted: (_) => _submitEmail(auth),
                ),
                if (_error != null && _error!.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(_error!,
                      style: const TextStyle(color: AppColors.danger)),
                ],
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _busy ? null : () => _submitEmail(auth),
                    child: _busy
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                                strokeWidth: 2),
                          )
                        : Text(_signUp ? 'Create account' : 'Sign in'),
                  ),
                ),
                TextButton(
                  onPressed: () => setState(() => _signUp = !_signUp),
                  child: Text(
                    _signUp
                        ? 'Have an account? Sign in'
                        : 'New here? Create an account',
                  ),
                ),
                const SizedBox(height: 28),
                const Row(
                  children: [
                    Expanded(child: Divider()),
                    Padding(
                      padding: EdgeInsets.symmetric(horizontal: 12),
                      child: Text('or',
                          style: TextStyle(color: AppColors.inkFaint)),
                    ),
                    Expanded(child: Divider()),
                  ],
                ),
                const SizedBox(height: 28),
                if (Platform.isIOS) ...[
                  _ProviderButton(
                    label: 'Continue with Apple',
                    icon: Icons.apple,
                    onPressed:
                        _busy ? null : () => _run(auth.signInWithApple),
                  ),
                  const SizedBox(height: 12),
                ],
                _ProviderButton(
                  label: 'Continue with Google',
                  icon: Icons.g_mobiledata,
                  onPressed: _busy ? null : () => _run(auth.signInWithGoogle),
                ),
                const SizedBox(height: 40),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _submitEmail(AuthRepository auth) {
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || password.isEmpty) return;
    _run(() async {
      if (_signUp) {
        await auth.signUpWithEmail(email, password);
      } else {
        await auth.signInWithEmail(email, password);
      }
    });
  }
}

class _ProviderButton extends StatelessWidget {
  const _ProviderButton({
    required this.label,
    required this.icon,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: FilledButton.tonal(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.surface,
          foregroundColor: AppColors.ink,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        onPressed: onPressed,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 22),
            const SizedBox(width: 10),
            Text(label,
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
