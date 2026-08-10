import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/upload/upload_queue.dart';

/// Shared asset loaders. Other features may import this file; they must not
/// import `asset_detail_screen.dart` (cross-feature screen imports are banned).
final assetProvider =
    FutureProvider.autoDispose.family<ScanAsset?, String>((ref, id) async {
  // Re-fetch whenever the asset list stream ticks.
  final auth = ref.watch(authRepositoryProvider);
  final user = auth.currentUser;
  if (user != null) {
    await ref.watch(assetTickProvider(user.id).future);
  }
  return ref.watch(assetRepositoryProvider).getAsset(id);
});

final assetTickProvider = StreamProvider.autoDispose
    .family<List<ScanAsset>, String>((ref, ownerId) =>
        ref.watch(assetRepositoryProvider).watchAssets(ownerId));

/// Merged view of an asset's upload pipeline: the persisted queue job (step,
/// attempts, lastError, frame totals — survives restarts) plus the live byte
/// fraction of the file currently uploading. Null when no job is queued.
final uploadJobProvider = StreamProvider.autoDispose
    .family<Map<String, dynamic>?, String>((ref, assetId) {
  final queue = ref.watch(uploadQueueProvider);
  final persisted = queue.watchJob(assetId).asBroadcastStream();
  final live = queue.progress.where((p) => p.assetId == assetId);
  return _mergeJobAndProgress(persisted, live);
});

Stream<Map<String, dynamic>?> _mergeJobAndProgress(
  Stream<Map<String, dynamic>?> persisted,
  Stream<UploadProgress> live,
) async* {
  final controller = StreamController<Map<String, dynamic>?>.broadcast();
  Map<String, dynamic>? lastJob;
  StreamSubscription<Map<String, dynamic>?>? s1;
  StreamSubscription<UploadProgress>? s2;
  s1 = persisted.listen((j) {
    lastJob = j;
    if (controller.isClosed) return;
    controller.add(j);
  });
  s2 = live.listen((p) {
    final fraction = p.bytesFraction;
    if (fraction == null || lastJob == null) return;
    if (controller.isClosed) return;
    final copy = Map<String, dynamic>.from(lastJob!)
      ..['bytesFraction'] = fraction;
    controller.add(copy);
  });
  controller.onCancel = () async {
    await s1?.cancel();
    await s2?.cancel();
    await controller.close();
  };
  yield* controller.stream;
}
