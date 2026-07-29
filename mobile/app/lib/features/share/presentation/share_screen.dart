import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../assets/presentation/asset_providers.dart';
import '../domain/embed_code.dart';

final shareLinkProvider = FutureProvider.autoDispose
    .family<ShareLink, String>((ref, assetId) async {
  final asset = await ref.watch(assetRepositoryProvider).getAsset(assetId);
  if (asset == null) throw StateError('Asset not found');
  return ref.watch(shareRepositoryProvider).createLink(asset);
});

final qrCodeProvider =
    FutureProvider.autoDispose.family<Uint8List, String>((ref, tourId) async {
  final bytes = await ref.watch(backendApiProvider).getQrCode(tourId);
  return Uint8List.fromList(bytes);
});

class ShareScreen extends ConsumerWidget {
  const ShareScreen({super.key, required this.assetId});

  final String assetId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final assetAsync = ref.watch(assetProvider(assetId));
    final asset = assetAsync.value;
    if (asset == null || asset.remoteTourId == null) {
      // While the asset is still loading, show a spinner instead of flashing
      // the "Not uploaded yet" message for a frame.
      if (assetAsync.isLoading) {
        return Scaffold(
          appBar: AppBar(title: const Text('Share')),
          body: const Center(child: CircularProgressIndicator()),
        );
      }
      return Scaffold(
        appBar: AppBar(title: const Text('Share')),
        body: const Center(
          child: Text('Not uploaded yet',
              style: TextStyle(color: AppColors.inkDim)),
        ),
      );
    }
    final link = ref.watch(shareLinkProvider(assetId));
    return Scaffold(
      appBar: AppBar(title: Text('Share “${asset.name}”')),
      body: link.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Could not create the share link.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: AppColors.inkDim,
                      fontSize: 16,
                      fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Check your connection and try again.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.inkFaint),
                ),
                const SizedBox(height: 18),
                FilledButton.icon(
                  onPressed: () =>
                      ref.invalidate(shareLinkProvider(assetId)),
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Try again'),
                ),
              ],
            ),
          ),
        ),
        data: (share) => _Body(asset: asset, share: share),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.asset, required this.share});

  final ScanAsset asset;
  final ShareLink share;

  Future<void> _openShareSheet(BuildContext context, ShareLink share) async {
    try {
      final result = await SharePlus.instance.share(ShareParams(
        uri: Uri.parse(share.url),
        subject: asset.name,
      ));
      if (result.status == ShareResultStatus.unavailable &&
          context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Sharing is unavailable on this device.')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open the share sheet.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final qr = ref.watch(qrCodeProvider(asset.remoteTourId!));
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        // The link, front and center.
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Public link',
                  style: TextStyle(color: AppColors.inkDim, fontSize: 13)),
              const SizedBox(height: 6),
              SelectableText(
                share.url,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                  color: AppColors.accent,
                ),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () => _openShareSheet(context, share),
                      icon: const Icon(Icons.ios_share, size: 18),
                      label: const Text('Share'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  IconButton.filledTonal(
                    tooltip: 'Copy link',
                    style: IconButton.styleFrom(
                        backgroundColor: AppColors.surfaceRaised),
                    onPressed: () async {
                      await Clipboard.setData(
                          ClipboardData(text: share.url));
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Link copied')),
                        );
                      }
                    },
                    icon: const Icon(Icons.copy, size: 18),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        // QR — rendered by the backend, no extra dependency.
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            children: [
              qr.when(
                loading: () => const SizedBox(
                  height: 180,
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (_, _) => const SizedBox(
                  height: 60,
                  child: Center(
                    child: Text('QR unavailable',
                        style: TextStyle(color: AppColors.inkFaint)),
                  ),
                ),
                data: (bytes) => ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child:
                      Image.memory(bytes, width: 180, height: 180),
                ),
              ),
              const SizedBox(height: 10),
              const Text('Scan to open on any phone',
                  style:
                      TextStyle(color: AppColors.inkDim, fontSize: 13)),
            ],
          ),
        ),
        const SizedBox(height: 14),
        _EmbedSection(tourId: asset.remoteTourId!),
      ],
    );
  }
}

class _EmbedSection extends StatelessWidget {
  const _EmbedSection({required this.tourId});

  final String tourId;

  @override
  Widget build(BuildContext context) {
    final code = generateEmbedCode(tourId);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('Embed on a website',
                    style:
                        TextStyle(color: AppColors.inkDim, fontSize: 13)),
              ),
              IconButton(
                tooltip: 'Copy embed code',
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: code));
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Embed code copied')),
                    );
                  }
                },
                icon: const Icon(Icons.copy,
                    size: 18, color: AppColors.inkDim),
              ),
            ],
          ),
          Text(
            code,
            style: const TextStyle(
              fontFamily: 'Menlo',
              fontSize: 12,
              color: AppColors.inkDim,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}
