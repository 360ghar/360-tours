import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../assets/data/local_asset_repository.dart';
import '../../assets/presentation/asset_providers.dart';

final roomsProvider = StreamProvider.autoDispose
    .family<List<Room>, String>((ref, assetId) =>
        ref.watch(assetRepositoryProvider).watchRooms(assetId));

/// Queue records for this asset's room jobs — the source of truth for
/// per-room upload failure (a room whose job reaches `failed` is terminal).
/// Once Room.status lands in the model this becomes redundant.
final roomUploadJobsProvider = StreamProvider.autoDispose
    .family<List<RoomUploadJob>, String>((ref, assetId) {
  final repo = ref.watch(assetRepositoryProvider);
  if (repo is! LocalAssetRepository) return const Stream.empty();
  return repo.watchRoomUploadJobs(assetId);
});

class RoomListScreen extends ConsumerWidget {
  const RoomListScreen({super.key, required this.assetId});

  final String assetId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asset = ref.watch(assetProvider(assetId)).value;
    final rooms = ref.watch(roomsProvider(assetId));
    final jobs = ref.watch(roomUploadJobsProvider(assetId)).value ?? const [];
    final jobsByRoom = {for (final j in jobs) j.roomId: j};
    return Scaffold(
      appBar: AppBar(title: Text(asset?.name ?? 'Rooms')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/capture?assetId=$assetId'),
        backgroundColor: AppColors.ink,
        foregroundColor: AppColors.background,
        icon: const Icon(Icons.add_a_photo_outlined),
        label: const Text('Add room'),
      ),
      body: rooms.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Could not load rooms.',
                  style: TextStyle(
                      color: AppColors.inkDim,
                      fontSize: 16,
                      fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Check your connection and try again.',
                  style: TextStyle(color: AppColors.inkFaint),
                ),
                const SizedBox(height: 18),
                FilledButton.icon(
                  onPressed: () => ref.invalidate(roomsProvider(assetId)),
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Try again'),
                ),
              ],
            ),
          ),
        ),
        data: (items) {
          final mainRoom = _mainRoomEntry(asset);
          final all = [...mainRoom, ...items];
          if (all.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text(
                  'No rooms yet.\n\nAdd rooms to create a walkable tour. '
                  'Each room gets a 360 photo you can link with hotspots.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.inkDim, height: 1.45),
                ),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
            itemCount: all.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (_, i) => _RoomTile(
              assetId: assetId,
              room: all[i],
              job: jobsByRoom[all[i].id],
              isMain: i == 0 && mainRoom.isNotEmpty,
            ),
          );
        },
      ),
    );
  }

  /// The original capture is scene 0 — surfaced as "Main room".
  List<Room> _mainRoomEntry(ScanAsset? asset) {
    if (asset == null) return const [];
    return [
      Room(
        id: '__main__',
        assetId: asset.id,
        name: '${asset.name} (main)',
        panoramaPath: asset.panoramaPath,
        panoramaUrl: asset.panoramaUrl,
      ),
    ];
  }
}

class _RoomTile extends ConsumerWidget {
  const _RoomTile({
    required this.assetId,
    required this.room,
    required this.job,
    required this.isMain,
  });

  final String assetId;
  final Room room;
  final RoomUploadJob? job;
  final bool isMain;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uploaded = isMain || room.remoteSceneId != null;
    // A room without a scene is uploading unless its queue job gave up.
    final failed = !uploaded && (job?.failed ?? false);
    return ListTile(
      tileColor: AppColors.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      leading: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: SizedBox(
          width: 56,
          height: 56,
          child: room.panoramaPath != null &&
                  File(room.panoramaPath!).existsSync()
              ? Image.file(File(room.panoramaPath!), fit: BoxFit.cover)
              : const ColoredBox(
                  color: AppColors.surfaceRaised,
                  child: Icon(Icons.meeting_room_outlined,
                      color: AppColors.inkFaint),
                ),
        ),
      ),
      title: Text(room.name,
          style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: _statusLine(uploaded, failed),
      trailing: !isMain
          ? Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (failed)
                  IconButton(
                    tooltip: 'Retry upload',
                    icon: const Icon(Icons.refresh,
                        size: 20, color: AppColors.accent),
                    onPressed: () => _retryUpload(context, ref),
                  ),
                if (uploaded || failed)
                  IconButton(
                    tooltip: 'Delete room',
                    icon: const Icon(Icons.delete_outline,
                        color: AppColors.inkDim, size: 20),
                    onPressed: () => _confirmDelete(context, ref),
                  ),
              ],
            )
          : null,
      onTap: uploaded
          ? () => context
              .push('/asset/$assetId/rooms/${room.id}/hotspots')
          : failed
              ? () => _showUploadFailure(context, ref)
              : null,
    );
  }

  Widget _statusLine(bool uploaded, bool failed) {
    if (uploaded) {
      return const Text('Uploaded',
          style: TextStyle(color: AppColors.inkFaint, fontSize: 13));
    }
    if (failed) {
      return Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.danger.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(6),
            ),
            child: const Text('Upload failed',
                style: TextStyle(
                    color: AppColors.danger,
                    fontSize: 12,
                    fontWeight: FontWeight.w600)),
          ),
          const SizedBox(width: 8),
          const Icon(Icons.error_outline, size: 15, color: AppColors.danger),
        ],
      );
    }
    return const Text('Uploading…',
        style: TextStyle(color: AppColors.accent, fontSize: 13));
  }

  Future<void> _showUploadFailure(BuildContext context, WidgetRef ref) async {
    final error = job?.lastError;
    final retried = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surfaceRaised,
        title: const Text('Upload failed'),
        content: Text(
          'This room could not be uploaded after several attempts.\n\n'
          '${error ?? 'The upload service did not respond.'}\n\n'
          'Retry the upload, or delete the room and capture it again.',
          style: const TextStyle(color: AppColors.inkDim, height: 1.45),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Close'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Retry'),
          ),
        ],
      ),
    );
    if (retried == true && context.mounted) {
      await _retryUpload(context, ref);
    }
  }

  Future<void> _retryUpload(BuildContext context, WidgetRef ref) async {
    final repo = ref.read(assetRepositoryProvider);
    if (repo is! LocalAssetRepository) {
      // Test overrides / future model change: nothing to re-enqueue.
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Retry is not available right now. Try again later.'),
      ));
      return;
    }
    await repo.retryRoomUpload(assetId, room.id);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Retrying upload…')),
      );
    }
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surfaceRaised,
        title: Text('Delete "${room.name}"?'),
        content: const Text(
          'This removes the local photo and the scene from your tour. '
          "This can't be undone.",
          style: TextStyle(color: AppColors.inkDim),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete',
                style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await ref.read(assetRepositoryProvider).deleteRoom(assetId, room.id);
    }
  }
}
