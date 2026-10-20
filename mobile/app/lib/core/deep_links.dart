// Pure deep-link parsing for the app's share/viewer URLs. Kept free of
// platform channels so the routing logic is unit-testable.
//
// Recognized shapes (path segments):
//   v/{shareCode}   → open the matching asset (share link)
//   view/{tourId}   → open the pano viewer
//   view3d/{tourId} → legacy 3D link, falls back to the pano viewer
//
// Links the device does not own fall back to the system browser via
// [deepLinkBrowserUrl].

import 'env.dart';

/// A parsed deep link targeting an asset owned by this device.
class OpenAssetIntent {
  const OpenAssetIntent({
    required this.ref,
    required this.toViewer,
  });

  /// Share code (for `v`) or remote tour id (for `view`/`view3d`).
  final String ref;

  /// True for viewer links (`view`/`view3d`); false for share links (`v`),
  /// which land on the asset detail screen.
  final bool toViewer;

  @override
  String toString() => 'OpenAssetIntent(ref: $ref, toViewer: $toViewer)';
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
      return OpenAssetIntent(ref: segments[1], toViewer: false);
    case 'view':
    case 'view3d':
      // Legacy 3D links open the same panorama viewer.
      return OpenAssetIntent(ref: segments[1], toViewer: true);
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
    case 'view3d':
      // Legacy 3D links fall back to the panorama viewer URL.
      return Uri.parse('${Env.viewerBase}/view/${segments[1]}');
  }
  return uri;
}
