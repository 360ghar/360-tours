import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import 'asset_providers.dart';

class AssetDetailScreen extends ConsumerWidget {
  const AssetDetailScreen({super.key, required this.assetId});

  final String assetId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final assetAsync = ref.watch(assetProvider(assetId));
    return Scaffold(
      appBar: AppBar(),
      body: assetAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (asset) {
          if (asset == null) {
            return const Center(
              child: Text('Scan not found',
                  style: TextStyle(color: AppColors.inkDim)),
            );
          }
          return _Body(asset: asset);
        },
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.asset});

  final ScanAsset asset;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ready = asset.status == AssetStatus.ready;
    final hasRemote = asset.remoteTourId != null;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: AspectRatio(
            aspectRatio: 2,
            child: asset.panoramaPath != null &&
                    File(asset.panoramaPath!).existsSync()
                ? Image.file(File(asset.panoramaPath!), fit: BoxFit.cover)
                : const ColoredBox(
                    color: AppColors.surface,
                    child: Icon(Icons.panorama_horizontal,
                        color: AppColors.inkFaint, size: 42),
                  ),
          ),
        ),
        const SizedBox(height: 18),
        Text(
          asset.name,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
                letterSpacing: -0.5,
              ),
        ),
        const SizedBox(height: 4),
        Text(
          _statusLine(asset),
          style: const TextStyle(color: AppColors.inkDim),
        ),
        if (asset.status == AssetStatus.failed) ...[
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: () => _retryUpload(context, ref),
            child: const Text('Retry upload'),
          ),
        ],
        const SizedBox(height: 24),
        _Action(
          icon: Icons.threesixty,
          label: 'View 360°',
          enabled: ready && hasRemote,
          disabledHint: 'Available after upload completes',
          onTap: () => context.push('/asset/${asset.id}/view'),
        ),
        _Action(
          icon: Icons.ios_share,
          label: 'Share link',
          enabled: ready && hasRemote,
          disabledHint: 'Available after upload completes',
          onTap: () => context.push('/asset/${asset.id}/share'),
        ),
        _Action(
          icon: Icons.meeting_room_outlined,
          label: 'Rooms & hotspots',
          enabled: hasRemote,
          disabledHint: 'Available after upload completes',
          onTap: () => context.push('/asset/${asset.id}/rooms'),
        ),
        _Action(
          icon: Icons.view_in_ar_outlined,
          label: asset.model3dUrl != null ? 'View 3D world' : 'Generate 3D world',
          enabled: ready && hasRemote,
          disabledHint: 'Available after upload completes',
          onTap: () => context.push('/asset/${asset.id}/generate3d'),
        ),
        _Action(
          icon: Icons.grid_on_outlined,
          label: 'Floor plan',
          enabled: hasRemote,
          disabledHint: 'Available after upload completes',
          onTap: () => context.push('/asset/${asset.id}/floorplan'),
        ),
        _Action(
          icon: Icons.query_stats,
          label: 'Analytics',
          enabled: hasRemote,
          disabledHint: 'Available after upload completes',
          onTap: () => context.push('/asset/${asset.id}/analytics'),
        ),
        const SizedBox(height: 24),
        TextButton.icon(
          onPressed: () => _confirmDelete(context, ref),
          icon: const Icon(Icons.delete_outline, color: AppColors.danger),
          label: const Text('Delete scan',
              style: TextStyle(color: AppColors.danger)),
        ),
      ],
    );
  }

  String _statusLine(ScanAsset asset) => switch (asset.status) {
        AssetStatus.capturing => 'Capture incomplete',
        AssetStatus.stitching =>
          'Stitching and uploading. The share link is minutes away.',
        AssetStatus.pendingCloudStitch => 'Uploading frames for cloud stitch…',
        AssetStatus.processing3d => 'Building the 3D world…',
        AssetStatus.ready => 'Ready to share',
        AssetStatus.failed => 'Something went wrong.',
      };

  Future<void> _retryUpload(BuildContext context, WidgetRef ref) async {
    final repo = ref.read(assetRepositoryProvider);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final retried = asset.copyWith(status: AssetStatus.stitching);
      await repo.saveAsset(retried);
      await repo.enqueueUpload(retried);
      messenger.showSnackBar(
        const SnackBar(content: Text('Retrying upload…')),
      );
    } catch (e) {
      // Best effort: revert the status so the UI does not claim an upload
      // is in flight when the enqueue actually failed.
      try {
        await repo.saveAsset(asset.copyWith(status: AssetStatus.failed));
      } catch (_) {
        // Revert is best-effort; the original failed state is acceptable.
      }
      messenger.showSnackBar(
        const SnackBar(content: Text('Could not retry the upload.')),
      );
    }
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surfaceRaised,
        title: const Text('Delete this scan?'),
        content: const Text(
            'The panorama, its share link and the published tour are removed.'),
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
    if (confirmed != true) return;
    await ref.read(assetRepositoryProvider).deleteAsset(asset.id);
    if (context.mounted) context.go('/');
  }
}

class _Action extends StatelessWidget {
  const _Action({
    required this.icon,
    required this.label,
    required this.onTap,
    this.enabled = true,
    this.disabledHint,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool enabled;
  final String? disabledHint;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: enabled ? onTap : null,
        enabled: enabled,
        tileColor: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        leading: Icon(icon,
            color: enabled ? AppColors.ink : AppColors.inkFaint, size: 24),
        title: Text(
          label,
          style: TextStyle(
            color: enabled ? AppColors.ink : AppColors.inkFaint,
            fontWeight: FontWeight.w600,
            fontSize: 15,
          ),
        ),
        subtitle: enabled || disabledHint == null
            ? null
            : Text(
                disabledHint!,
                style: const TextStyle(
                    color: AppColors.inkFaint, fontSize: 12.5),
              ),
        trailing: Icon(Icons.chevron_right,
            color: enabled ? AppColors.inkDim : AppColors.inkFaint),
      ),
    );
  }
}
