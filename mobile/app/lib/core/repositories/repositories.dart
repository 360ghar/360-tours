// Repository contracts. Feature code depends on these abstractions only;
// concrete impls are local-first with backend/API hooks where needed.

import '../models/models.dart';

abstract class AuthRepository {
  AppUser? get currentUser;
  Stream<AppUser?> authStateChanges();
  Future<AppUser> signInWithEmail(String email, String password);
  Future<AppUser> signUpWithEmail(String email, String password);
  Future<AppUser> signInWithApple();
  Future<AppUser> signInWithGoogle();
  Future<void> signOut();
}

abstract class AssetRepository {
  Stream<List<ScanAsset>> watchAssets(String ownerId);
  Future<ScanAsset?> getAsset(String id);
  Future<void> saveAsset(ScanAsset asset);
  Future<void> deleteAsset(String id);

  Future<List<Room>> getRooms(String assetId);
  Stream<List<Room>> watchRooms(String assetId);
  Future<void> saveRoom(Room room);
  Future<void> deleteRoom(String assetId, String roomId);

  /// Queue the asset's files for upload; retries when connectivity returns.
  Future<void> enqueueUpload(ScanAsset asset);
}

abstract class ShareRepository {
  /// Creates (or returns the existing) short link for an asset.
  Future<ShareLink> createLink(ScanAsset asset);
  Future<ShareLink?> getLink(String code);
  Future<ViewAnalytics> getAnalytics(String assetId);
}
