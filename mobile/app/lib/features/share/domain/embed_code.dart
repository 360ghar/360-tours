import '../../../core/env.dart';

/// Dart port of the web viewer's embed-code generator
/// (360-viewer/src/utils/embedCode.ts) — keep the iframe attributes in sync.
const _iframeAllow =
    'fullscreen; xr-spatial-tracking; accelerometer; gyroscope';
const _iframeSandbox =
    'allow-scripts allow-same-origin allow-popups allow-forms';
const _iframeReferrerPolicy = 'strict-origin-when-cross-origin';

String generateEmbedUrl(
  String tourId, {
  bool minimal = false,
  bool branding = true,
  bool autoplay = false,
}) {
  final params = <String>[
    if (minimal) 'minimal=1',
    if (!branding) 'branding=0',
    if (autoplay) 'autoplay=1',
  ];
  final query = params.isEmpty ? '' : '?${params.join('&')}';
  return '${Env.viewerBase}/embed/$tourId$query';
}

String generateEmbedCode(
  String tourId, {
  String width = '100%',
  int height = 480,
}) {
  final url = _escapeHtmlAttr(generateEmbedUrl(tourId));
  return '<iframe\n'
      '  src="$url"\n'
      '  width="$width"\n'
      '  height="$height"\n'
      '  frameborder="0"\n'
      '  allow="$_iframeAllow"\n'
      '  allowfullscreen\n'
      '  loading="lazy"\n'
      '  sandbox="$_iframeSandbox"\n'
      '  referrerpolicy="$_iframeReferrerPolicy"\n'
      '  style="border: none; border-radius: 8px;"\n'
      '></iframe>';
}

/// Escapes characters that would break out of an HTML double-quoted
/// attribute value. Defense-in-depth: tour ids are server-minted UUIDs, but
/// this keeps the iframe `src` safe if that ever changes. `&` must be
/// escaped first to avoid double-encoding the other entities.
String _escapeHtmlAttr(String value) => value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
