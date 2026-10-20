import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/deep_links.dart';
import 'package:tours360/core/env.dart';

void main() {
  group('parseDeepLink', () {
    test('v/{code} opens the asset detail (share link)', () {
      final intent = parseDeepLink(Uri.parse('tours360://v/abc12'))!;
      expect(intent.ref, 'abc12');
      expect(intent.toViewer, isFalse);
    });

    test('view/{tourId} opens the pano viewer', () {
      final intent = parseDeepLink(Uri.parse('tours360://view/tour-1'))!;
      expect(intent.ref, 'tour-1');
      expect(intent.toViewer, isTrue);
    });

    test('legacy view3d/{tourId} falls back to the pano viewer', () {
      final intent = parseDeepLink(Uri.parse('tours360://view3d/tour-1'))!;
      expect(intent.ref, 'tour-1');
      expect(intent.toViewer, isTrue);
    });

    test('https share links parse the same way', () {
      final intent = parseDeepLink(Uri.parse('https://api.360ghar.com/v/zz9'))!;
      expect(intent.ref, 'zz9');
      expect(intent.toViewer, isFalse);
    });

    test('trailing slashes are tolerated', () {
      final intent = parseDeepLink(Uri.parse('tours360://view/tour-1/'))!;
      expect(intent.ref, 'tour-1');
    });

    test('unknown paths are ignored', () {
      expect(parseDeepLink(Uri.parse('tours360://embed/tour-1')), isNull);
      expect(parseDeepLink(Uri.parse('tours360://settings')), isNull);
      expect(parseDeepLink(Uri.parse('tours360://')), isNull);
      expect(parseDeepLink(Uri.parse('https://example.com/other/x')), isNull);
    });
  });

  group('deepLinkBrowserUrl', () {
    test('http(s) URIs pass through unchanged', () {
      final uri = Uri.parse('https://api.360ghar.com/v/abc');
      expect(deepLinkBrowserUrl(uri), uri);
    });

    test('custom-scheme viewer link is rebuilt from segments', () {
      expect(
        deepLinkBrowserUrl(Uri.parse('tours360://view/tour-1')),
        Uri.parse('${Env.viewerBase}/view/tour-1'),
      );
    });

    test('custom-scheme legacy 3d link falls back to the pano viewer URL', () {
      expect(
        deepLinkBrowserUrl(Uri.parse('tours360://view3d/tour-1')),
        Uri.parse('${Env.viewerBase}/view/tour-1'),
      );
    });

    test('custom-scheme share link uses the API root', () {
      expect(
        deepLinkBrowserUrl(Uri.parse('tours360://v/abc12')),
        Uri.parse('${Env.apiRoot}/v/abc12'),
      );
    });
  });

}
