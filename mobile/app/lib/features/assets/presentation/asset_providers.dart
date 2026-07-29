import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/providers.dart';

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
