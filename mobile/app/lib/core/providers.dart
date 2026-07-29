// Repository providers — the DI seam. Concrete impls are chosen once in
// main.dart via ProviderScope overrides.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/backend_api.dart';
import 'repositories/repositories.dart';
import 'upload/upload_queue.dart';

final authRepositoryProvider = Provider<AuthRepository>(
    (ref) => throw UnimplementedError('overridden in main.dart'));

final assetRepositoryProvider = Provider<AssetRepository>(
    (ref) => throw UnimplementedError('overridden in main.dart'));

final shareRepositoryProvider = Provider<ShareRepository>(
    (ref) => throw UnimplementedError('overridden in main.dart'));

final backendApiProvider = Provider<BackendApi>(
    (ref) => throw UnimplementedError('overridden in main.dart'));

final uploadQueueProvider = Provider<UploadQueue>(
    (ref) => throw UnimplementedError('overridden in main.dart'));
