import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../capture/presentation/capture_controller.dart';
import '../../settings/domain/processing_preference.dart';
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
        error: (e, _) => Center(child: Text(describeError(e))),
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
    final queue = ref.watch(uploadQueueProvider);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
      children: [
        // Auth expiry (focus d): fired when the single 401 refresh fails.
        // The queue holds this asset's job in `waiting-auth` meanwhile.
        const _AuthExpiredBanner(),
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
        // Queue observability (focus c): backoff countdown with the last
        // error, terminal-failure reason, auth-hold, and the retry entry
        // point. Emits on every queue write via the LocalStore watcher.
        StreamBuilder<Map<String, dynamic>?>(
          stream: queue.watchJob(asset.id),
          builder: (context, snapshot) => _QueueStatus(
            asset: asset,
            job: snapshot.data,
            onRetry: () => _retryUpload(context, ref),
          ),
        ),
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
        AssetStatus.pendingCloudStitch =>
          'Uploading frames and stitching in the cloud. This can take a few '
              'minutes.',
        AssetStatus.ready => 'Ready to share',
        AssetStatus.failed => 'Something went wrong.',
      };

  Future<void> _retryUpload(BuildContext context, WidgetRef ref) async {
    final repo = ref.read(assetRepositoryProvider);
    final messenger = ScaffoldMessenger.of(context);
    // Failed stitch (frames but no panorama, focus a): re-run the stitch
    // ladder before enqueueing — a plain upload retry would fail at
    // "panorama file missing" and burn all backoff attempts.
    if (asset.status == AssetStatus.failed &&
        asset.framePaths.isNotEmpty &&
        !_hasPanoramaFile(asset)) {
      final preferDevice = ref.read(processingPreferenceProvider).value !=
          ProcessingPreference.cloudFirst;
      final error = await retryStitch(
        asset: asset,
        assets: repo,
        queue: ref.read(uploadQueueProvider),
        preferDevice: preferDevice,
      );
      if (context.mounted) {
        messenger.showSnackBar(SnackBar(
          content: Text(error ??
              'Stitching again… upload will start when it finishes.'),
        ));
      }
      return;
    }
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

/// Session-expired banner (focus d). Shown while the API client's single
/// 401 refresh has failed and the user must sign in again.
class _AuthExpiredBanner extends StatelessWidget {
  const _AuthExpiredBanner();

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<bool>(
      stream: authExpiredStream,
      builder: (context, snapshot) {
        if (snapshot.data != true) return const SizedBox.shrink();
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: AppColors.danger.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              const Icon(Icons.lock_clock, color: AppColors.danger, size: 18),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Session expired — please sign in again',
                  style: TextStyle(
                    color: AppColors.danger,
                    fontWeight: FontWeight.w600,
                    fontSize: 13.5,
                  ),
                ),
              ),
              TextButton(
                onPressed: () => context.go('/signin'),
                child: const Text('Sign in'),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Live queue state for one asset (focus c): backoff countdown with the last
/// error, terminal-failure reason, auth-hold, and the retry entry point.
class _QueueStatus extends StatefulWidget {
  const _QueueStatus({
    required this.asset,
    required this.job,
    required this.onRetry,
  });

  final ScanAsset asset;
  final Map<String, dynamic>? job;
  final VoidCallback onRetry;

  @override
  State<_QueueStatus> createState() => _QueueStatusState();
}

class _QueueStatusState extends State<_QueueStatus> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    // One-second tick so the backoff countdown stays live without a Riverpod
    // dependency on wall-clock time.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final job = widget.job;
    if (job != null && job['step'] == 'waiting-auth') {
      return _Notice(
        icon: Icons.lock_clock,
        message: 'Session expired — please sign in again',
        detail: _truncate(job['lastError']),
        actionLabel: 'Sign in',
        onAction: () => context.go('/signin'),
      );
    }
    final nextRetry = job?['nextRetryAt'];
    if (nextRetry is int) {
      final raw = ((nextRetry - DateTime.now().millisecondsSinceEpoch) /
              1000)
          .ceil();
      final seconds = raw < 0 ? 0 : (raw > 3600 ? 3600 : raw);
      return _Notice(
        icon: Icons.cloud_upload_outlined,
        message: 'Upload paused — retrying in $seconds s',
        detail: _truncate(job?['lastError']),
      );
    }
    if (widget.asset.status == AssetStatus.failed) {
      final canRestitch = widget.asset.framePaths.isNotEmpty &&
          !_hasPanoramaFile(widget.asset);
      return _Notice(
        icon: Icons.error_outline,
        message: 'Something went wrong.',
        detail: _truncate(job?['lastError']),
        actionLabel: canRestitch ? 'Retry stitching & upload' : 'Retry upload',
        onAction: widget.onRetry,
      );
    }
    return const SizedBox.shrink();
  }

  static String _truncate(Object? value) {
    final s = value?.toString() ?? '';
    if (s.length <= 220) return s;
    return '${s.substring(0, 217)}…';
  }
}

/// Small inline status block: icon + message + optional error detail +
/// optional single action.
class _Notice extends StatelessWidget {
  const _Notice({
    required this.icon,
    required this.message,
    this.detail,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String message;
  final String? detail;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final hasAction = actionLabel != null && onAction != null;
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.inkDim, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  message,
                  style: const TextStyle(
                    color: AppColors.ink,
                    fontWeight: FontWeight.w600,
                    fontSize: 13.5,
                  ),
                ),
                if (detail != null && detail!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    detail!,
                    style: const TextStyle(
                        color: AppColors.inkDim, fontSize: 12.5),
                  ),
                ],
              ],
            ),
          ),
          if (hasAction)
            TextButton(
              onPressed: onAction,
              child: Text(actionLabel!),
            ),
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

/// A stored path whose file is gone (storage sweep) counts as no panorama.
bool _hasPanoramaFile(ScanAsset asset) {
  final path = asset.panoramaPath;
  return path != null && File(path).existsSync();
}
