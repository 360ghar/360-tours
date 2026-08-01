import 'dart:async';
import 'dart:io';

import 'package:tours360/core/models/models.dart';
import 'package:tours360/core/repositories/repositories.dart';
import 'package:tours360/core/storage/local_store.dart';
import 'package:tours360/features/assets/data/local_asset_repository.dart';

/// In-memory [LocalStore] — deterministic for widget tests (no disk IO).
/// Mirrors LocalStore's broadcast semantics: every write re-emits the full
/// list to watchers.
class InMemoryStore extends LocalStore {
  InMemoryStore() : super(Directory(''));

  final Map<String, List<Map<String, dynamic>>> _data = {};
  final Map<String, StreamController<List<Map<String, dynamic>>>>
      _controllers = {};

  @override
  Future<List<Map<String, dynamic>>> readAll(String collection) async =>
      List.of(_data[collection] ?? const []);

  @override
  Future<void> writeAll(
      String collection, List<Map<String, dynamic>> items) async {
    _data[collection] = List.of(items);
    _controllers[collection]?.add(List.of(items));
  }

  @override
  Future<void> upsert(String collection, Map<String, dynamic> item) async {
    final items =
        List<Map<String, dynamic>>.from(_data[collection] ?? const []);
    final i = items.indexWhere((e) => e['id'] == item['id']);
    if (i >= 0) {
      items[i] = item;
    } else {
      items.add(item);
    }
    await writeAll(collection, items);
  }

  @override
  Future<void> delete(String collection, String id) async {
    final items =
        List<Map<String, dynamic>>.from(_data[collection] ?? const []);
    items.removeWhere((e) => e['id'] == id);
    await writeAll(collection, items);
  }

  @override
  Stream<List<Map<String, dynamic>>> watch(String collection) {
    final controller =
        _controllers.putIfAbsent(collection, StreamController.broadcast);
    late final StreamController<List<Map<String, dynamic>>> seeded;
    StreamSubscription<List<Map<String, dynamic>>>? sub;
    seeded = StreamController<List<Map<String, dynamic>>>(
      onListen: () async {
        seeded.add(List.of(_data[collection] ?? const []));
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

/// In-memory asset repository backed by [InMemoryStore]. Extends
/// [LocalAssetRepository] so the concrete methods (room-job watch, 3D job
/// persistence, room retry) are available to screens under test.
class FakeAssetRepository extends LocalAssetRepository {
  FakeAssetRepository() : super(InMemoryStore());
}

/// Minimal auth repository: no session, no events. Screens under test only
/// read `currentUser` (assetProvider skips the tick stream when null).
class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({this.user});

  AppUser? user;

  @override
  AppUser? get currentUser => user;

  @override
  Stream<AppUser?> authStateChanges() => const Stream.empty();

  @override
  Future<AppUser> signInWithEmail(String email, String password) =>
      throw UnimplementedError();

  @override
  Future<AppUser> signUpWithEmail(String email, String password) =>
      throw UnimplementedError();

  @override
  Future<AppUser> signInWithApple() => throw UnimplementedError();

  @override
  Future<AppUser> signInWithGoogle() => throw UnimplementedError();

  @override
  Future<void> signOut() async {}
}
