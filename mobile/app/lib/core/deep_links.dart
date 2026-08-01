// Pure deep-link parsing for the app's share/viewer URLs. Kept free of
// platform channels so the routing logic is unit-testable.
//
// Recognized shapes (path segments):
//   v/{shareCode}   → open the matching asset (share link)
//   view/{tourId}   → open the pano viewer
//   view3d/{tourId} → open the 3D viewer
//
// Links the device does not own fall back to the system browser via
// [deepLinkBrowserUrl].

import 'env.dart';

/// A parsed deep link targeting an asset owned by this device.
class OpenAssetIntent {
  const OpenAssetIntent({
    required this.ref,
    required this.toViewer,
    required this.mode,
  });

  /// Share code (for `v`) or remote tour id (for `view`/`view3d`).
  final String ref;

  /// True for viewer links (`view`/`view3d`); false for share links (`v`),
  /// which land on the asset detail screen.
  final bool toViewer;

  /// Requested viewer mode: `pano` or `3d` (ignored when [toViewer] is
  /// false).
  final String mode;

  @override
  String toString() =>
      'OpenAssetIntent(ref: $ref, toViewer: $toViewer, mode: $mode)';
}

const _routeKeywords = {'v', 'view', 'view3d'};

/// Path segments of a deep-link URI. Custom-scheme links (e.g.
/// `tours360://view/{id}`) carry the route in the host, so a route-looking
/// host is folded into the segment list; https universal links
/// (`https://…/view/{id}`) already have it in the path.
List<String> _segments(Uri uri) {
  final path = uri.pathSegments.where((s) => s.isNotEmpty).toList();
  if (_routeKeywords.contains(uri.host)) return [uri.host, ...path];
  return path;
}

/// Parses a deep-link URI into a navigation intent, or returns null for
/// links the app does not handle.
OpenAssetIntent? parseDeepLink(Uri uri) {
  final segments = _segments(uri);
  if (segments.length < 2) return null;
  switch (segments[0]) {
    case 'v':
      return OpenAssetIntent(ref: segments[1], toViewer: false, mode: 'pano');
    case 'view':
      return OpenAssetIntent(ref: segments[1], toViewer: true, mode: 'pano');
    case 'view3d':
      return OpenAssetIntent(ref: segments[1], toViewer: true, mode: '3d');
  }
  return null;
}

/// The public web URL for a deep-link URI, used to open a tour the device
/// does not own in the system browser. http(s) URIs pass through unchanged;
/// custom-scheme URIs are rebuilt from their path segments.
Uri deepLinkBrowserUrl(Uri uri) {
  if (uri.scheme == 'http' || uri.scheme == 'https') return uri;
  final segments = _segments(uri);
  if (segments.length < 2) return uri;
  switch (segments[0]) {
    case 'v':
      return Uri.parse('${Env.apiRoot}/v/${segments[1]}');
    case 'view':
      return Uri.parse('${Env.viewerBase}/view/${segments[1]}');
    case 'view3d':
      return Uri.parse('${Env.viewerBase}/view3d/${segments[1]}');
  }
  return uri;
}

/// Resolves the actual viewer mode for an owned asset: a `3d` request falls
/// back to the pano viewer when the asset has no [hasModel3d] URL yet.
String resolveViewerMode(String requested, {required bool hasModel3d}) =>
    requested == '3d' && hasModel3d ? '3d' : 'pano';
