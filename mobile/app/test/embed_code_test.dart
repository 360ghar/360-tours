import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/env.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/features/share/domain/embed_code.dart';

/// Canonical cross-app embed snippet (root AGENTS.md contract). Both this
/// suite and web/src/test/utils/embedCode.test.ts read
/// docs/embed-parity-golden.html and assert byte-identical output for their
/// default options, with `__VIEWER_BASE__` resolved to each side's host.
void main() {
  test('embed url carries the viewer host and params', () {
    expect(generateEmbedUrl('t1'),
        'https://360viewer.360ghar.com/embed/t1');
    expect(generateEmbedUrl('t1', minimal: true, branding: false),
        'https://360viewer.360ghar.com/embed/t1?minimal=true&branding=false');
  });

  test('default iframe is byte-identical to the cross-app golden fixture',
      () {
    final golden = File('../../docs/embed-parity-golden.html')
        .readAsStringSync()
        .replaceAll('__VIEWER_BASE__', Env.viewerBase)
        .replaceAll('__TOUR_ID__', 't1');
    expect(generateEmbedCode('t1'), golden);
  });

  test('non-default options emit the web param surface with true/false values',
      () {
    expect(
      generateEmbedUrl('t1',
          scene: 's-1',
          autoplay: false,
          navbar: false,
          minimal: true,
          autohide: true,
          fullscreen: false,
          vr: false,
          rotate: true,
          branding: false),
      'https://360viewer.360ghar.com/embed/t1'
      '?scene=s-1&autoplay=false&navbar=false&minimal=true&autohide=true'
      '&fullscreen=false&vr=false&rotate=true&branding=false',
    );
  });

  test('custom dimensions render with the px suffix like the web generator',
      () {
    final code = generateEmbedCode('t1', height: 600, width: '800px');
    expect(code, contains('width="800px"'));
    expect(code, contains('height="600px"'));
  });

  test('share link URL points at the backend short-link route', () {
    final link = ShareLink(
        code: 'abc12', assetId: 'a', createdAt: DateTime(2026));
    expect(link.url, 'https://api.360ghar.com/v/abc12');
  });
}
