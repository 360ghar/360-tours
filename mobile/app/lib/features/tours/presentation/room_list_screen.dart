import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../assets/presentation/asset_providers.dart';

final roomsProvider = StreamProvider.autoDispose
    .family<List<Room>, String>((ref, assetId) =>
        ref.watch(assetRepositoryProvider).watchRooms(assetId));

class RoomListScreen extends ConsumerWidget {
  const RoomListScreen({super.key, required this.assetId});

  final String assetId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asset = ref.watch(assetProvider(assetId)).value;
    final rooms = ref.watch(roomsProvider(assetId));
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
        error: (e, _) => Center(child: Text('$e')),
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
    required this.isMain,
  });

  final String assetId;
  final Room room;
  final bool isMain;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uploaded = isMain || room.remoteSceneId != null;
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
      subtitle: Text(
        uploaded ? 'Uploaded' : 'Uploading…',
        style: TextStyle(
          color: uploaded ? AppColors.inkFaint : AppColors.accent,
          fontSize: 13,
        ),
      ),
      trailing: uploaded && !isMain
          ? IconButton(
              tooltip: 'Delete room',
              icon: const Icon(Icons.delete_outline,
                  color: AppColors.inkDim, size: 20),
              onPressed: () => _confirmDelete(context, ref),
            )
          : null,
      onTap: uploaded
          ? () => context
              .push('/asset/$assetId/rooms/${room.id}/hotspots')
          : null,
    );
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
