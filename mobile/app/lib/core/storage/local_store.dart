import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

/// Tiny JSON-file document store: one file per collection, a broadcast stream
/// per collection that re-emits the full list on every write.
///
/// File format: `{"schemaVersion": 1, "items": [...]}`. A plain list (the
/// format before the header) is read as version 0 and rewritten with the
/// header on the next write. A file with a newer version is quarantined whole,
/// so an older build never rewrites data it cannot read.
///
/// Bad data is quarantined, never dropped: a corrupt or wrong-shape file is
/// renamed to `<name>.json.corrupt-<ts>` (the newest [maxQuarantineFiles] are
/// kept), and one unreadable record moves to the `<name>_quarantine`
/// collection (the newest [maxQuarantinedRecords] are kept).
/// ponytail: JSON files, not sqlite — fine for tens of assets; swap to drift
/// if lists grow past hundreds.
class LocalStore {
  LocalStore(this._dir);

  /// Version written to every collection file.
  static const schemaVersion = 1;

  static const maxQuarantineFiles = 3;
  static const maxQuarantinedRecords = 50;

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
      final items = _decode(await file.readAsString());
      final after = _cache[collection];
      if (after != null) return after;
      return _cache[collection] = items;
    } on FormatException catch (e) {
      return _quarantineAndReset(collection, file, e);
    } on TypeError catch (e) {
      // Valid-JSON-wrong-shape files used to throw an uncaught TypeError
      // here, breaking the assets stream and the queue pump. Quarantine like
      // any other corrupt file.
      return _quarantineAndReset(collection, file, e);
    }
  }

  /// Reads the text of a collection file. Throws [FormatException] when it is
  /// not JSON, has no readable header, or comes from a newer app.
  List<Map<String, dynamic>> _decode(String text) {
    final raw = jsonDecode(text);
    final List<dynamic> entries;
    if (raw is List) {
      entries = raw; // version 0: no header yet
    } else if (raw is Map) {
      final version = raw['schemaVersion'];
      if (version is! int) {
        throw const FormatException('schemaVersion is missing');
      }
      if (version > schemaVersion) {
        throw FormatException('written by a newer app (schema $version)');
      }
      final items = raw['items'];
      if (items is! List) {
        throw const FormatException('items is not a list');
      }
      entries = items;
    } else {
      throw const FormatException('expected a JSON object or list');
    }
    final items = <Map<String, dynamic>>[];
    for (final e in entries) {
      if (e is Map<String, dynamic>) {
        items.add(e);
      } else if (e is Map) {
        // jsonDecode produces Map<String, dynamic>; be lenient with other
        // Map implementations but never thread non-object entries through.
        items.add(Map<String, dynamic>.from(e));
      } else {
        throw const FormatException('expected a list of JSON objects');
      }
    }
    return items;
  }

  /// Renames a corrupt collection file aside (`.corrupt-<ts>`) so the data
  /// can be recovered instead of being silently dropped, then resets the
  /// in-memory state to an empty list and keeps serving reads/writes.
  Future<List<Map<String, dynamic>>> _quarantineAndReset(
    String collection,
    File file,
    Object error,
  ) async {
    final after = _cache[collection];
    if (after != null) return after;
    try {
      final ts = DateTime.now().millisecondsSinceEpoch;
      await file.rename('${file.path}.corrupt-$ts');
      debugPrint(
        'LocalStore: quarantined corrupt $collection.json '
        '($error) -> ${file.path}.corrupt-$ts',
      );
      await _pruneQuarantineFiles(collection);
    } catch (e) {
      debugPrint(
        'LocalStore: failed to quarantine corrupt '
        '$collection.json: $e',
      );
    }
    return _cache[collection] = [];
  }

  /// Keeps the newest [maxQuarantineFiles] `.corrupt-<ts>` files of a
  /// collection. Older ones are deleted.
  Future<void> _pruneQuarantineFiles(String collection) async {
    final prefix = '$collection.json.corrupt-';
    final files = <File>[
      await for (final e in _dir.list())
        if (e is File && e.uri.pathSegments.last.startsWith(prefix)) e,
    ]..sort((a, b) => b.path.compareTo(a.path));
    for (final stale in files.skip(maxQuarantineFiles)) {
      try {
        await stale.delete();
      } on FileSystemException {
        // already gone
      }
    }
  }

  /// Moves one unreadable record out of [collection] into the
  /// `<collection>_quarantine` collection, with the reason. The record stays
  /// recoverable there. Only the newest [maxQuarantinedRecords] are kept.
  /// Each collection is read and rewritten under its own lock, so a concurrent
  /// save never loses to a stale snapshot.
  Future<void> quarantineRecord(
    String collection,
    Map<String, dynamic> record,
    Object reason,
  ) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final quarantine = '${collection}_quarantine';
    await _runLocked(quarantine, () async {
      final held = List<Map<String, dynamic>>.from(await readAll(quarantine))
        ..add({
          'id': '$now-${record.hashCode}',
          'reason': '$reason',
          'quarantinedAt': now,
          'record': record,
        });
      await _writeAllUnlocked(
        quarantine,
        held
            .skip(
              held.length > maxQuarantinedRecords
                  ? held.length - maxQuarantinedRecords
                  : 0,
            )
            .toList(),
      );
    });
    final encoded = jsonEncode(record);
    await _runLocked(collection, () async {
      final live = (await readAll(collection))
          .where((e) => !identical(e, record) && jsonEncode(e) != encoded)
          .toList();
      await _writeAllUnlocked(collection, live);
    });
    debugPrint('LocalStore: quarantined a $collection record ($reason)');
  }

  /// Puts quarantined records back into [collection] when [canRead] accepts
  /// them now (a newer build may read what an older one could not). A record
  /// that is still unreadable stays in quarantine. A record whose id is already
  /// live is never overwritten: the live copy wins and the quarantined copy is
  /// dropped only when both are identical. Returns how many were restored.
  /// Lock order: the collection, then its quarantine ([quarantineRecord] takes
  /// them one after the other, never nested, so the two cannot deadlock).
  Future<int> restoreQuarantinedRecords(
    String collection,
    bool Function(Map<String, dynamic> record) canRead,
  ) async {
    final quarantine = '${collection}_quarantine';
    var restored = 0;
    await _runLocked(
      collection,
      () => _runLocked(quarantine, () async {
        final held = await readAll(quarantine);
        if (held.isEmpty) return;
        final live = List<Map<String, dynamic>>.from(await readAll(collection));
        final keep = <Map<String, dynamic>>[];
        for (final entry in held) {
          final stored = entry['record'];
          final record = stored is Map
              ? Map<String, dynamic>.from(stored)
              : null;
          if (record == null || !canRead(record)) {
            keep.add(entry);
            continue;
          }
          final twin = live.where((e) => e['id'] == record['id']).firstOrNull;
          if (twin == null) {
            live.add(record);
            restored++;
          } else if (jsonEncode(twin) != jsonEncode(record)) {
            keep.add(entry); // a different record owns this id: keep both
          }
        }
        if (restored > 0) await _writeAllUnlocked(collection, live);
        if (keep.length != held.length) {
          await _writeAllUnlocked(quarantine, keep);
        }
      }),
    );
    if (restored > 0) {
      debugPrint('LocalStore: restored $restored $collection record(s)');
    }
    return restored;
  }

  /// Reads the `.corrupt-<ts>` files of [collection] again. A file that this
  /// build can read now (it came from a newer app, and this build has caught
  /// up) is merged into the collection by id and deleted. A file that is still
  /// unreadable stays. Live records win over restored ones. Returns how many
  /// records were restored.
  Future<int> restoreQuarantinedFiles(String collection) async {
    if (!await _dir.exists()) return 0;
    final prefix = '$collection.json.corrupt-';
    final files = <File>[
      await for (final e in _dir.list())
        if (e is File && e.uri.pathSegments.last.startsWith(prefix)) e,
    ]..sort((a, b) => b.path.compareTo(a.path)); // newest first: it wins an id
    var restored = 0;
    for (final file in files) {
      final List<Map<String, dynamic>> items;
      try {
        items = _decode(await file.readAsString());
      } on FormatException {
        continue;
      } on TypeError {
        continue;
      }
      var added = 0;
      await _runLocked(collection, () async {
        final live = List<Map<String, dynamic>>.from(await readAll(collection));
        final known = {for (final e in live) e['id']};
        final fresh = items.where((e) => known.add(e['id'])).toList();
        if (fresh.isNotEmpty) {
          await _writeAllUnlocked(collection, [...live, ...fresh]);
        }
        added = fresh.length;
      });
      await file.delete();
      restored += added;
    }
    if (restored > 0) {
      debugPrint(
        'LocalStore: restored $restored $collection record(s) '
        'from quarantined files',
      );
    }
    return restored;
  }

  Future<void> writeAll(String collection, List<Map<String, dynamic>> items) {
    return _runLocked(collection, () => _writeAllUnlocked(collection, items));
  }

  Future<void> _writeAllUnlocked(
    String collection,
    List<Map<String, dynamic>> items,
  ) async {
    await _dir.create(recursive: true);
    final file = _file(collection);
    final tmp = File('${file.path}.tmp');
    try {
      // Durable write first: only claim success after the temp file is
      // written and atomically renamed into place. A disk-full / IO error
      // must not leave the cache claiming the write succeeded.
      await tmp.writeAsString(
        jsonEncode({'schemaVersion': schemaVersion, 'items': items}),
        flush: true,
      );
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
