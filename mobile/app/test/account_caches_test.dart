import 'package:flutter/painting.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tours360/core/storage/account_caches.dart';

class _Images extends Fake implements CacheManager {
  _Images({this.fail = false});

  final bool fail;
  var emptied = false;

  @override
  Future<void> emptyCache() async {
    if (fail) throw StateError('disk is busy');
    emptied = true;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('sign-out empties the image disk cache and the in-memory cache',
      () async {
    final images = _Images();
    await purgeAccountCaches(images: images);
    expect(images.emptied, isTrue);
    expect(PaintingBinding.instance.imageCache.currentSize, 0);
    expect(PaintingBinding.instance.imageCache.liveImageCount, 0);
  });

  test('a disk cache that cannot be emptied does not block sign-out',
      () async {
    await purgeAccountCaches(images: _Images(fail: true));
  });
}
