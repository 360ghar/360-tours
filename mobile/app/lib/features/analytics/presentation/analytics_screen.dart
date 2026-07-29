import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../assets/presentation/asset_providers.dart';

final analyticsProvider = FutureProvider.autoDispose
    .family<ViewAnalytics, String>((ref, tourId) =>
        ref.watch(shareRepositoryProvider).getAnalytics(tourId));

class AnalyticsScreen extends ConsumerWidget {
  const AnalyticsScreen({super.key, required this.assetId});

  final String assetId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final assetAsync = ref.watch(assetProvider(assetId));
    final asset = assetAsync.value;
    final tourId = asset?.remoteTourId;
    return Scaffold(
      appBar: AppBar(title: const Text('Analytics')),
      body: assetAsync.isLoading
          ? const Center(child: CircularProgressIndicator())
          : tourId == null
              ? const Center(
                  child: Text('Not uploaded yet',
                      style: TextStyle(color: AppColors.inkDim)),
                )
              : ref.watch(analyticsProvider(tourId)).when(
                    loading: () =>
                        const Center(child: CircularProgressIndicator()),
                    error: (e, _) => Center(
                      child: Text('Analytics unavailable\n$e',
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: AppColors.inkDim)),
                    ),
                    data: (a) => RefreshIndicator(
                      onRefresh: () async {
                        ref.invalidate(analyticsProvider(tourId));
                        await ref.read(analyticsProvider(tourId).future);
                      },
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
                        children: [
                          if (a.views == 0)
                            _ZeroViewsCta(assetId: assetId),
                          _Stat(
                            label: 'Views',
                            value: '${a.views}',
                            detail: 'Times the public link was opened.',
                          ),
                          _Stat(
                            label: 'Time spent',
                            value: _duration(a.totalSeconds),
                            detail: 'Total across all viewers.',
                          ),
                          _Stat(
                            label: 'Showing requests',
                            value: '${a.showingRequests}',
                            detail: 'Viewers who tapped “Request showing”.',
                          ),
                        ],
                      ),
                    ),
                  ),
    );
  }

  String _duration(int seconds) {
    if (seconds < 60) return '${seconds}s';
    if (seconds < 3600) return '${seconds ~/ 60}m ${seconds % 60}s';
    return '${seconds ~/ 3600}h ${(seconds % 3600) ~/ 60}m';
  }
}

class _ZeroViewsCta extends StatelessWidget {
  const _ZeroViewsCta({required this.assetId});

  final String assetId;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Share your tour to start getting views.',
            style: TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: () => context.push('/asset/$assetId/share'),
            child: const Text('Open share screen'),
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({
    required this.label,
    required this.value,
    required this.detail,
  });

  final String label;
  final String value;
  final String detail;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style:
                  const TextStyle(color: AppColors.inkDim, fontSize: 14)),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(
              fontSize: 34,
              fontWeight: FontWeight.w700,
              letterSpacing: -1,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 4),
          Text(detail,
              style: const TextStyle(
                  color: AppColors.inkFaint, fontSize: 13)),
        ],
      ),
    );
  }
}
