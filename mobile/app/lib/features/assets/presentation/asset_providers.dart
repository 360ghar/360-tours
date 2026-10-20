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
  final asset = await ref.watch(assetRepositoryProvider).getAsset(id);
  // A scan belongs to the account that captured it. Another signed-in account
  // that reaches this id (a stale link or route) sees nothing.
  if (asset != null && user != null && asset.ownerId != user.id) return null;
  return asset;
});

final assetTickProvider = StreamProvider.autoDispose
    .family<List<ScanAsset>, String>((ref, ownerId) =>
        ref.watch(assetRepositoryProvider).watchAssets(ownerId));
