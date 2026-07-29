import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/models/models.dart';
import 'package:tours360/features/share/domain/embed_code.dart';

void main() {
  test('embed url carries the viewer host and params', () {
    expect(generateEmbedUrl('t1'),
        'https://360viewer.360ghar.com/embed/t1');
    expect(generateEmbedUrl('t1', minimal: true, branding: false),
        'https://360viewer.360ghar.com/embed/t1?minimal=1&branding=0');
  });

  test('iframe matches the web viewer generator attributes', () {
    final code = generateEmbedCode('t1');
    // Attribute values mirror 360-viewer/src/utils/embedCode.ts constants.
    expect(code, contains('src="https://360viewer.360ghar.com/embed/t1"'));
    expect(code, contains('width="100%"'));
    expect(code, contains('height="480"'));
    expect(
        code,
        contains(
            'allow="fullscreen; xr-spatial-tracking; accelerometer; gyroscope"'));
    expect(
        code,
        contains(
            'sandbox="allow-scripts allow-same-origin allow-popups allow-forms"'));
    expect(code,
        contains('referrerpolicy="strict-origin-when-cross-origin"'));
    expect(code, contains('allowfullscreen'));
    expect(code, contains('loading="lazy"'));
  });

  test('share link URL points at the backend short-link route', () {
    final link = ShareLink(
        code: 'abc12', assetId: 'a', createdAt: DateTime(2026));
    expect(link.url, 'https://api.360ghar.com/v/abc12');
  });

  test('share link overrideUrl wins over code-derived URL', () {
    final link = ShareLink(
      code: '',
      assetId: 'a',
      createdAt: DateTime(2026),
      overrideUrl: 'https://360viewer.360ghar.com/view/tour-1',
    );
    expect(link.url, 'https://360viewer.360ghar.com/view/tour-1');
  });
}
