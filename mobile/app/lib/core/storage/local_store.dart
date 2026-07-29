import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

/// Tiny JSON-file document store: one file per collection, a broadcast stream
/// per collection that re-emits the full list on every write.
/// ponytail: JSON files, not sqlite — fine for tens of assets; swap to drift
/// if lists grow past hundreds.
class LocalStore {
  LocalStore(this._dir);

  final Directory _dir;
  final Map<String, StreamController<List<Map<String, dynamic>>>> _controllers =
      {};
  final Map<String, List<Map<String, dynamic>>> _cache = {};
  final Map<String, Future<void>> _locks = {};

  File _file(String collection) => File('${_dir.path}/$collection.json');

  Future<void> _runLocked(String collection, Future<void> Function() op) {
    final prev = _locks[collection] ?? Future<void>.value();
    final next = prev.catchError((_) {}).then((_) => op());
    _locks[collection] = next;
    return next;
  }

  Future<List<Map<String, dynamic>>> readAll(String collection) async {
    final cached = _cache[collection];
    if (cached != null) return cached;
    final file = _file(collection);
    if (!await file.exists()) {
      final after = _cache[collection];
      if (after != null) return after;
      return _cache[collection] = [];
    }
    try {
      final raw = jsonDecode(await file.readAsString()) as List;
      final after = _cache[collection];
      if (after != null) return after;
      return _cache[collection] =
          raw.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } on FormatException {
      final after = _cache[collection];
      if (after != null) return after;
      // Quarantine the corrupt file so it can be recovered instead of
      // silently dropping the data.
      try {
        final ts = DateTime.now().millisecondsSinceEpoch;
        await file.rename('${file.path}.corrupt-$ts');
        debugPrint(
            'LocalStore: quarantined corrupt $collection.json -> '
            '${file.path}.corrupt-$ts');
      } catch (e) {
        debugPrint('LocalStore: failed to quarantine corrupt '
            '$collection.json: $e');
      }
      return _cache[collection] = [];
    }
  }

  Future<void> writeAll(
      String collection, List<Map<String, dynamic>> items) {
    return _runLocked(collection, () => _writeAllUnlocked(collection, items));
  }

  Future<void> _writeAllUnlocked(
      String collection, List<Map<String, dynamic>> items) async {
    await _dir.create(recursive: true);
    final file = _file(collection);
    final tmp = File('${file.path}.tmp');
    try {
      // Durable write first: only claim success after the temp file is
      // written and atomically renamed into place. A disk-full / IO error
      // must not leave the cache claiming the write succeeded.
      await tmp.writeAsString(jsonEncode(items), flush: true);
      await tmp.rename(file.path);
    } catch (_) {
      // Keep cache/disk consistent on failure: do not update the cache.
      rethrow;
    }
    _cache[collection] = items;
    _controllers[collection]?.add(items);
  }

  /// Upsert by 'id'.
  Future<void> upsert(String collection, Map<String, dynamic> item) {
    return _runLocked(collection, () async {
      final items = List<Map<String, dynamic>>.from(await readAll(collection));
      final i = items.indexWhere((e) => e['id'] == item['id']);
      if (i >= 0) {
        items[i] = item;
      } else {
        items.add(item);
      }
      await _writeAllUnlocked(collection, items);
    });
  }

  Future<void> delete(String collection, String id) {
    return _runLocked(collection, () async {
      final items = List<Map<String, dynamic>>.from(await readAll(collection));
      items.removeWhere((e) => e['id'] == id);
      await _writeAllUnlocked(collection, items);
    });
  }

  /// Broadcast stream seeded with the current contents.
  Stream<List<Map<String, dynamic>>> watch(String collection) {
    final controller = _controllers.putIfAbsent(
      collection,
      () => StreamController<List<Map<String, dynamic>>>.broadcast(),
    );
    late final StreamController<List<Map<String, dynamic>>> seeded;
    StreamSubscription<List<Map<String, dynamic>>>? sub;
    seeded = StreamController<List<Map<String, dynamic>>>(
      onListen: () async {
        seeded.add(await readAll(collection));
        sub = controller.stream.listen(seeded.add);
      },
      onCancel: () {
        sub?.cancel();
        sub = null;
      },
    );
    return seeded.stream;
  }
}
