import '../../../core/env.dart';

/// Dart port of the web viewer's embed-code generator
/// (web/src/utils/embedCode.ts) — keep the iframe attributes in sync.
///
/// The cross-app byte-parity contract (root AGENTS.md) is enforced by
/// docs/embed-parity-golden.html: both this file and the web generator must
/// produce exactly that snippet (with `__VIEWER_BASE__`/`__TOUR_ID__`
/// substituted) for their default options. Each app's unit suite asserts it.
const _iframeAllow = 'fullscreen; xr-spatial-tracking; accelerometer; gyroscope';
const _iframeSandbox = 'allow-scripts allow-same-origin allow-popups allow-forms';
const _iframeReferrerPolicy = 'strict-origin-when-cross-origin';

/// Web's DEFAULT_OPTIONS (web/src/utils/embedCode.ts) — the default output of
/// `generateEmbedCode` must be byte-identical to the web generator's default
/// output, so these defaults mirror it exactly (including explicit `false`
/// params, which the web generator emits for its full param surface).
const _defaultAutoplay = true;
const _defaultNavbar = true;
const _defaultMinimal = false;
const _defaultAutohide = false;
const _defaultFullscreen = true;
const _defaultVR = true;
const _defaultRotate = false;
const _defaultBranding = true;

/// Builds the embed URL for a tour. Mirrors the web generator's raw
/// `generateEmbedUrl`: `null` params are omitted, nothing is merged in, and
/// booleans serialize as lowercase `true`/`false` (URLSearchParams format).
/// Host comes from `Env.viewerBase` (the web side resolves the embedding
/// page's origin at runtime — see the golden fixture's `__VIEWER_BASE__`).
String generateEmbedUrl(
  String tourId, {
  String? scene,
  bool? autoplay,
  bool? navbar,
  bool? minimal,
  bool? autohide,
  bool? fullscreen,
  bool? vr,
  bool? rotate,
  bool? branding,
}) {
  final params = <String>[
    if (scene != null && scene.isNotEmpty)
      'scene=${Uri.encodeQueryComponent(scene)}',
    if (autoplay != null) 'autoplay=${autoplay ? 'true' : 'false'}',
    if (navbar != null) 'navbar=${navbar ? 'true' : 'false'}',
    if (minimal != null) 'minimal=${minimal ? 'true' : 'false'}',
    if (autohide != null) 'autohide=${autohide ? 'true' : 'false'}',
    if (fullscreen != null) 'fullscreen=${fullscreen ? 'true' : 'false'}',
    if (vr != null) 'vr=${vr ? 'true' : 'false'}',
    if (rotate != null) 'rotate=${rotate ? 'true' : 'false'}',
    if (branding != null) 'branding=${branding ? 'true' : 'false'}',
  ];
  final query = params.isEmpty ? '' : '?${params.join('&')}';
  return '${Env.viewerBase}/embed/$tourId$query';
}

/// Generates the full iframe embed snippet. Defaults mirror web's
/// DEFAULT_OPTIONS so the default output is byte-identical to
/// web/src/utils/embedCode.ts `generateIframeCode` (pinned by
/// docs/embed-parity-golden.html). Like the web generator, the URL is
/// interpolated as-is — tour ids are server-minted UUIDs.
String generateEmbedCode(
  String tourId, {
  String width = '100%',
  int height = 500,
  String? scene,
  bool autoplay = _defaultAutoplay,
  bool navbar = _defaultNavbar,
  bool minimal = _defaultMinimal,
  bool autohide = _defaultAutohide,
  bool fullscreen = _defaultFullscreen,
  bool vr = _defaultVR,
  bool rotate = _defaultRotate,
  bool branding = _defaultBranding,
}) {
  final url = generateEmbedUrl(
    tourId,
    scene: scene,
    autoplay: autoplay,
    navbar: navbar,
    minimal: minimal,
    autohide: autohide,
    fullscreen: fullscreen,
    vr: vr,
    rotate: rotate,
    branding: branding,
  );
  return '<iframe\n'
      '  src="$url"\n'
      '  width="$width"\n'
      '  height="${height}px"\n'
      '  frameborder="0"\n'
      '  allow="$_iframeAllow"\n'
      '  allowfullscreen\n'
      '  loading="lazy"\n'
      '  sandbox="$_iframeSandbox"\n'
      '  referrerpolicy="$_iframeReferrerPolicy"\n'
      '  style="border: none; border-radius: 8px;"\n'
      '></iframe>';
}
