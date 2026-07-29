import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import 'asset_providers.dart';

class AssetListScreen extends ConsumerWidget {
  const AssetListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userId = ref.watch(authRepositoryProvider).currentUser?.id;
    if (userId == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('My Assets')),
        body: const Center(
          child: Text('Not signed in',
              style: TextStyle(color: AppColors.inkDim)),
        ),
      );
    }
    final provider = assetTickProvider(userId);
    final assets = ref.watch(provider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Assets'),
        actions: [
          IconButton(
            tooltip: 'Settings',
            onPressed: () => context.push('/settings'),
            icon: const Icon(Icons.tune, size: 20),
          ),
          IconButton(
            tooltip: 'Sign out',
            onPressed: () => _signOut(context, ref),
            icon: const Icon(Icons.logout, size: 20),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/capture'),
        backgroundColor: AppColors.ink,
        foregroundColor: AppColors.background,
        icon: const Icon(Icons.camera_alt_outlined),
        label: const Text('Scan a room'),
      ),
      body: assets.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Could not load your scans.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Text(
                  '$e',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.inkFaint),
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: () => ref.invalidate(provider),
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (items) => items.isEmpty
            ? const _EmptyState()
            : RefreshIndicator(
                onRefresh: () => ref.refresh(provider.future),
                child: GridView.builder(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
                  gridDelegate:
                      const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 14,
                    crossAxisSpacing: 14,
                    childAspectRatio: 0.82,
                  ),
                  itemCount: items.length,
                  itemBuilder: (_, i) => _AssetCard(asset: items[i]),
                ),
              ),
      ),
    );
  }

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surfaceRaised,
        title: const Text('Sign out?'),
        content: const Text('You can sign back in any time.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(authRepositoryProvider).signOut();
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not sign out. Please try again.')),
        );
      }
    }
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'No scans yet.',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.5,
                  ),
            ),
            const SizedBox(height: 10),
            const Text(
              'Stand in the middle of a room, tap Scan, and follow '
              'the dots. Sixteen shots, under a minute.',
              style: TextStyle(color: AppColors.inkDim, fontSize: 16, height: 1.4),
            ),
          ],
        ),
      ),
    );
  }
}

class _AssetCard extends ConsumerWidget {
  const _AssetCard({required this.asset});

  final ScanAsset asset;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () => context.push('/asset/${asset.id}'),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (asset.thumbnailPath != null &&
                      File(asset.thumbnailPath!).existsSync())
                    Image.file(File(asset.thumbnailPath!), fit: BoxFit.cover)
                  else
                    const ColoredBox(
                      color: AppColors.surfaceRaised,
                      child: Icon(Icons.panorama_horizontal,
                          color: AppColors.inkFaint, size: 36),
                    ),
                  if (asset.status != AssetStatus.ready)
                    Positioned(
                      left: 8,
                      bottom: 8,
                      child: _StatusBadge(status: asset.status),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    asset.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 15),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _relativeDate(asset.createdAt),
                    style: const TextStyle(
                        color: AppColors.inkFaint, fontSize: 13),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final AssetStatus status;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      AssetStatus.capturing => ('Capturing', AppColors.inkDim),
      AssetStatus.stitching => ('Stitching…', AppColors.accent),
      AssetStatus.pendingCloudStitch => ('Uploading…', AppColors.accent),
      AssetStatus.processing3d => ('Building 3D…', AppColors.accent),
      AssetStatus.failed => ('Failed', AppColors.danger),
      AssetStatus.ready => ('Ready', AppColors.success),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.65),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
            color: color, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}

String _relativeDate(DateTime dt) {
  final diff = DateTime.now().difference(dt);
  if (diff.inMinutes < 1) return 'Just now';
  if (diff.inHours < 1) return '${diff.inMinutes}m ago';
  if (diff.inDays < 1) return '${diff.inHours}h ago';
  if (diff.inDays < 30) return '${diff.inDays}d ago';
  return '${dt.day}/${dt.month}/${dt.year}';
}
