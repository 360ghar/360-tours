import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';

/// Empties the caches that hold the signed-in user's server data. Run on
/// sign-out, so the next account on this device starts with none of it.
///
/// What this covers: the image disk cache (`CachedNetworkImage`, used for the
/// floor plan images of the user's tours) and Flutter's in-memory image cache.
/// What it does not cover: the local store (`LocalStore`). That holds the
/// user's own captures and the uploads that have not finished, not a copy of
/// server data, so it is scoped by `ownerId` and kept (see
/// docs/RELIABILITY.md, "Local data on sign-out").
///
/// The API client keeps no response cache (Dio has no cache interceptor), so
/// `Cache-Control: no-store` responses are never written anywhere.
///
/// Never throws: a cache that cannot be emptied must not block sign-out.
/// [images] is the disk cache to empty; tests pass their own.
Future<void> purgeAccountCaches({CacheManager? images}) async {
  PaintingBinding.instance.imageCache
    ..clear()
    ..clearLiveImages();
  try {
    await (images ?? DefaultCacheManager()).emptyCache();
  } on Object catch (e) {
    debugPrint('Could not empty the image cache: $e');
  }
}
