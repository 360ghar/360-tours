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
              child: Text(
                'Scan not found',
                style: TextStyle(color: AppColors.inkDim),
              ),
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
    final job = ref.watch(uploadJobProvider(asset.id)).value;
    final viewable = asset.canViewTour;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: AspectRatio(
            aspectRatio: 2,
            child:
                asset.panoramaPath != null &&
                    File(asset.panoramaPath!).existsSync()
                ? Image.file(File(asset.panoramaPath!), fit: BoxFit.cover)
                : const ColoredBox(
                    color: AppColors.surface,
                    child: Icon(
                      Icons.panorama_horizontal,
                      color: AppColors.inkFaint,
                      size: 42,
                    ),
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
          _statusLine(job),
          style: const TextStyle(color: AppColors.inkDim),
        ),
        if (_showProgress(job)) ...[
          const SizedBox(height: 12),
          _progressBar(job!),
        ],
        if (_bannerWidget(context, ref) != null) ...[
          const SizedBox(height: 12),
          _bannerWidget(context, ref)!,
        ],
        const SizedBox(height: 24),
        _Action(
          icon: Icons.threesixty,
          label: 'View 360°',
          enabled: viewable,
          disabledHint: _viewDisabledHint(),
          onTap: () => context.push('/asset/${asset.id}/view'),
        ),
        _Action(
          icon: Icons.ios_share,
          label: 'Share link',
          enabled: viewable,
          disabledHint: _viewDisabledHint(),
          onTap: () => context.push('/asset/${asset.id}/share'),
        ),
        _Action(
          icon: Icons.meeting_room_outlined,
          label: 'Rooms & hotspots',
          enabled: asset.remoteTourId != null,
          disabledHint: 'Available after upload completes',
          onTap: () => context.push('/asset/${asset.id}/rooms'),
        ),
        _Action(
          icon: Icons.view_in_ar_outlined,
          label: asset.model3dUrl != null
              ? 'View 3D world'
              : 'Generate 3D world',
          enabled: viewable,
          disabledHint: 'Available after the tour is published',
          onTap: () => context.push('/asset/${asset.id}/generate3d'),
        ),
        _Action(
          icon: Icons.grid_on_outlined,
          label: 'Floor plan',
          enabled: asset.remoteTourId != null,
          disabledHint: 'Available after upload completes',
          onTap: () => context.push('/asset/${asset.id}/floorplan'),
        ),
        _Action(
          icon: Icons.query_stats,
          label: 'Analytics',
          enabled: asset.remoteTourId != null,
          disabledHint: 'Available after upload completes',
          onTap: () => context.push('/asset/${asset.id}/analytics'),
        ),
        const SizedBox(height: 24),
        TextButton.icon(
          onPressed: () => _confirmDelete(context, ref),
          icon: const Icon(Icons.delete_outline, color: AppColors.danger),
          label: const Text(
            'Delete scan',
            style: TextStyle(color: AppColors.danger),
          ),
        ),
      ],
    );
  }

  /// The user always knows what is happening: distinct wording for every
  /// pipeline stage (spec §3, §14). A published tour stays "ready" regardless
  /// of cloud refinement state.
  String _statusLine(Map<String, dynamic>? job) {
    if (asset.published) {
      if (asset.cloudStitchPending) {
        return 'Tour ready — improving panorama quality…';
      }
      if (asset.cloudStitchFailed) {
        return 'Tour ready. Panorama refinement could not be completed.';
      }
      if (asset.spatialAiPending) {
        return 'Tour ready — building AI navigation…';
      }
      if (asset.spatialAiFailed) {
        return 'Tour ready. AI navigation could not be generated.';
      }
      if (asset.status == AssetStatus.failed) {
        return 'Tour is live; an upload job failed.';
      }
      return 'Virtual tour ready';
    }
    return switch (asset.status) {
      AssetStatus.capturing => 'Capture incomplete',
      AssetStatus.stitching => 'Preparing panorama…',
      AssetStatus.uploading => _uploadingLine(job),
      AssetStatus.pendingCloudStitch => 'Preparing panorama…',
      AssetStatus.processing3d => 'Building the 3D world…',
      AssetStatus.ready => 'Ready to share',
      AssetStatus.failed =>
        asset.panoramaPath != null && File(asset.panoramaPath!).existsSync()
            ? 'Upload could not be completed. Your panorama is saved on this device.'
            : 'Upload could not be completed.',
    };
  }

  /// Exact sub-step while the pre-publish upload pipeline runs.
  String _uploadingLine(Map<String, dynamic>? job) {
    if (job == null) return 'Uploading your virtual tour…';
    return switch (job['step']) {
      'createTour' => 'Uploading — creating your tour…',
      'presign' || 'putCloudinary' => 'Uploading panorama…',
      'confirm' => 'Uploading — finalizing…',
      'createScene' => 'Uploading — creating scene…',
      'publish' => 'Publishing your tour…',
      'uploadFrames' => 'Uploading source frames…',
      'requestStitch' || 'pollStitch' => 'Refining panorama in the cloud…',
      _ => 'Uploading your virtual tour…',
    };
  }

  bool _showProgress(Map<String, dynamic>? job) {
    if (job == null) return false;
    return job['step'] == 'uploadFrames' ||
        job['step'] == 'putCloudinary' ||
        job['bytesFraction'] != null;
  }

  Widget _progressBar(Map<String, dynamic> job) {
    final fraction = job['bytesFraction'] as double?;
    final framesTotal = job['framesTotal'] as int? ?? 0;
    final framesDone = (job['frameUrlsByIndex'] as Map?)?.length ?? 0;
    if (job['step'] == 'uploadFrames' && framesTotal > 0) {
      return _ProgressCard(
        label: 'Uploading source frames',
        fraction: framesDone / framesTotal,
        detail: '$framesDone of $framesTotal frames',
      );
    }
    final bytes = fraction ?? 0.0;
    return _ProgressCard(
      label: 'Uploading panorama',
      fraction: bytes,
      detail: '${(bytes * 100).round()}%',
    );
  }

  Widget? _bannerWidget(BuildContext context, WidgetRef ref) {
    if (asset.published && asset.spatialAiPending) {
      return _Banner(
        icon: Icons.auto_awesome,
        color: AppColors.accent,
        title: 'Your tour is live — AI navigation is being generated in the '
            'background. You can view the tour now.',
        actions: const [],
      );
    }
    if (asset.published && asset.spatialAiFailed) {
      return _Banner(
        icon: Icons.warning_amber_rounded,
        color: AppColors.danger,
        title: 'Your virtual tour is ready. AI navigation could not be '
            'generated — manual navigation still works.',
        actions: [
          FilledButton.tonal(
            onPressed: () => _retrySpatialAi(context, ref),
            child: const Text('Retry AI navigation'),
          ),
        ],
      );
    }
    if (asset.published && asset.cloudStitchPending) {
      return _Banner(
        icon: Icons.auto_awesome,
        color: AppColors.accent,
        title: 'Your tour is live — panorama refinement is running in the '
            'background. You can view the tour now.',
        actions: const [],
      );
    }
    if (asset.published && asset.cloudStitchFailed) {
      return _Banner(
        icon: Icons.warning_amber_rounded,
        color: AppColors.danger,
        title: 'Your virtual tour is ready. Panorama refinement could not be '
            'completed.',
        actions: [
          FilledButton.tonal(
            onPressed: () => _retryRefinement(context, ref),
            child: const Text('Retry refinement'),
          ),
          TextButton(
            onPressed: () => _useCurrentPanorama(context, ref),
            child: const Text('Use current panorama'),
          ),
        ],
      );
    }
    if (!asset.published && asset.status == AssetStatus.failed) {
      return _Banner(
        icon: Icons.cloud_off,
        color: AppColors.danger,
        title: asset.panoramaPath != null &&
                File(asset.panoramaPath!).existsSync()
            ? 'Upload could not be completed. Your panorama is saved on this '
                'device.'
            : 'Upload could not be completed.',
        actions: [
          FilledButton.tonal(
            onPressed: () => _retryUpload(context, ref),
            child: const Text('Retry upload'),
          ),
        ],
      );
    }
    if (asset.published && asset.status == AssetStatus.failed) {
      return _Banner(
        icon: Icons.cloud_off,
        color: AppColors.danger,
        title: 'Your tour is live, but an upload job failed.',
        actions: [
          FilledButton.tonal(
            onPressed: () => _retryUpload(context, ref),
            child: const Text('Retry upload'),
          ),
        ],
      );
    }
    return null;
  }

  String _viewDisabledHint() {
    if (asset.published) return '';
    if (asset.status == AssetStatus.failed) {
      return 'Upload failed — retry upload above';
    }
    return 'Available after the tour is published';
  }

  Future<void> _retryUpload(BuildContext context, WidgetRef ref) async {
    final repo = ref.read(assetRepositoryProvider);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final retried = asset.copyWith(
        status: asset.published ? asset.status : AssetStatus.stitching,
      );
      await repo.saveAsset(retried);
      await repo.enqueueUpload(retried);
      messenger.showSnackBar(const SnackBar(content: Text('Retrying upload…')));
    } catch (e) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Could not retry the upload.')),
      );
    }
  }

  /// Re-queues the (resumable) upload pipeline; a failed cloud-stitch job
  /// resumes at a fresh stitch request, keeping the uploaded frames.
  Future<void> _retryRefinement(BuildContext context, WidgetRef ref) async {
    final repo = ref.read(assetRepositoryProvider);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await repo.enqueueUpload(
        asset.copyWith(status: AssetStatus.pendingCloudStitch),
      );
      messenger.showSnackBar(
        const SnackBar(
          content: Text(
            'Refinement queued — you will be '
            'notified when it finishes.',
          ),
        ),
      );
    } catch (e) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Could not queue the refinement.')),
      );
    }
  }

  /// Dismisses the refinement-failure notice; the published local panorama
  /// stays live.
  Future<void> _useCurrentPanorama(
    BuildContext context,
    WidgetRef ref,
  ) async {
    final repo = ref.read(assetRepositoryProvider);
    await repo.saveAsset(asset.copyWith(cloudStitchFailed: false));
  }

  /// Re-queues the non-fatal AI spatial-navigation job (a failed spatial job
  /// resumes at a fresh request). The published tour is unaffected either way.
  Future<void> _retrySpatialAi(BuildContext context, WidgetRef ref) async {
    final queue = ref.read(uploadQueueProvider);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await queue.retry(asset.id);
      messenger.showSnackBar(
        const SnackBar(
          content: Text(
            'AI navigation queued — you will be notified when it finishes.',
          ),
        ),
      );
    } catch (e) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Could not queue AI navigation.')),
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
          'The panorama, its share link and the published tour are removed.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(
              'Delete',
              style: TextStyle(color: AppColors.danger),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(assetRepositoryProvider).deleteAsset(asset.id);
    if (context.mounted) context.go('/');
  }
}

/// Honest, step-specific progress: real byte/percent data when the backend
/// or dio provides it, otherwise an indeterminate bar with the step message.
class _ProgressCard extends StatelessWidget {
  const _ProgressCard({
    required this.label,
    required this.fraction,
    required this.detail,
  });

  final String label;
  final double fraction;
  final String detail;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
              Text(
                detail,
                style: const TextStyle(
                  color: AppColors.inkDim,
                  fontSize: 12.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          LinearProgressIndicator(
            value: fraction > 0 && fraction < 1 ? fraction : null,
            backgroundColor: AppColors.surface,
            minHeight: 6,
            borderRadius: BorderRadius.circular(3),
          ),
        ],
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({
    required this.icon,
    required this.color,
    required this.title,
    required this.actions,
  });

  final IconData icon;
  final Color color;
  final String title;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: actions),
        ],
      ),
    );
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
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        leading: Icon(
          icon,
          color: enabled ? AppColors.ink : AppColors.inkFaint,
          size: 24,
        ),
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
                  color: AppColors.inkFaint,
                  fontSize: 12.5,
                ),
              ),
        trailing: Icon(
          Icons.chevron_right,
          color: enabled ? AppColors.inkDim : AppColors.inkFaint,
        ),
      ),
    );
  }
}
