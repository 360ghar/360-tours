import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/env.dart';

void main() {
  test('the link root is the API host: no /api/v1, no trailing slash', () {
    // Run without dart-defines: the root follows API_BASE, so a build that
    // overrides only API_BASE never builds share links to production.
    expect(Env.apiBase, 'https://api.360ghar.com/api/v1');
    expect(Env.apiRoot, 'https://api.360ghar.com');
  });
}
