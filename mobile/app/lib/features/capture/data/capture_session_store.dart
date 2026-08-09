import 'dart:io';

import '../../../core/storage/local_store.dart';
import '../domain/capture_session.dart';

/// Persists the single active [CaptureSession] as lightweight JSON metadata
/// in the shared [LocalStore] (image bytes never touch the store — frames
/// live as files on disk and are referenced by path).
class CaptureSessionStore {
  CaptureSessionStore(this._store);

  static const _collection = 'capture_sessions';
  static const _activeId = 'active';

  final LocalStore _store;

  /// The resumable session, or null when none exists or it is unreadable.
  Future<CaptureSession?> load() async {
    try {
      final all = await _store.readAll(_collection);
      final match = all
          .where((e) => e['id'] == _activeId)
          .map(Map<String, dynamic>.from)
          .firstOrNull;
      if (match == null) return null;
      final session = CaptureSession.fromJson(match);
      if (session.frames.isEmpty && session.skippedTargets.isEmpty) return null;
      return session;
    } catch (_) {
      // Never crash on a corrupted session — caller shows "start new".
      return null;
    }
  }

  Future<void> save(CaptureSession session) =>
      _store.upsert(_collection, {...session.toJson(), 'id': _activeId});

  /// Removes the active session record.
  Future<void> clear() => _store.delete(_collection, _activeId);

  /// True when every persisted frame file still exists (a wiped app-data
  /// directory makes a session unrecoverable even though the JSON survives).
  static bool framesIntact(CaptureSession session) =>
      session.frames.every((f) => File(f.path).existsSync());

  /// Deletes the session's frame files (used on Discard). Only paths under
  /// [capturesRoot] (`<docs>/captures`) are ever deleted — corrupted session
  /// metadata must never be able to remove arbitrary app files; a path
  /// outside the root (including `..` traversal) is treated as
  /// unrecoverable and skipped.
  static void deleteFrameFiles(
    CaptureSession session, {
    required String capturesRoot,
  }) {
    final root = File(capturesRoot).absolute.path.replaceAll('\\', '/');
    for (final f in session.frames) {
      try {
        final file = File(f.path).absolute;
        if (!file.path.replaceAll('\\', '/').startsWith('$root/')) continue;
        if (file.existsSync()) file.deleteSync();
        final dir = file.parent;
        // Only remove the session directory when it is completely empty —
        // a stray file or another capture dir must survive cleanup.
        if (dir.existsSync() && dir.listSync().isEmpty) {
          dir.deleteSync();
        }
      } catch (_) {
        // best-effort cleanup
      }
    }
  }
}
