import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../assets/presentation/asset_providers.dart';

final floorPlansProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, String>((ref, tourId) async {
  final raw = await ref.watch(backendApiProvider).getFloorPlans(tourId);
  return raw
      .map((e) => Map<String, dynamic>.from(e as Map))
      .toList(growable: false);
});

class FloorPlanScreen extends ConsumerWidget {
  const FloorPlanScreen({super.key, required this.assetId});

  final String assetId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asset = ref.watch(assetProvider(assetId)).value;
    final tourId = asset?.remoteTourId;
    return Scaffold(
      appBar: AppBar(title: const Text('Floor plan')),
      body: tourId == null
          ? const Center(
              child: Text('Not uploaded yet',
                  style: TextStyle(color: AppColors.inkDim)),
            )
          : ref.watch(floorPlansProvider(tourId)).when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (plans) => plans.isEmpty
                    ? const _Empty()
                    : ListView(
                        padding: const EdgeInsets.all(20),
                        children: [
                          for (final plan in plans)
                            if (plan['image_url'] != null)
                              Padding(
                                padding:
                                    const EdgeInsets.only(bottom: 16),
                                child: ClipRRect(
                                  borderRadius:
                                      BorderRadius.circular(14),
                                  child: CachedNetworkImage(
                                    imageUrl:
                                        plan['image_url'] as String,
                                    placeholder: (_, _) =>
                                        const AspectRatio(
                                      aspectRatio: 1.4,
                                      child: ColoredBox(
                                          color: AppColors.surface),
                                    ),
                                    errorWidget: (_, _, _) =>
                                        const AspectRatio(
                                      aspectRatio: 1.4,
                                      child: ColoredBox(
                                        color: AppColors.surface,
                                        child: Center(
                                          child: Column(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              Icon(Icons.broken_image_outlined,
                                                  color: AppColors.inkFaint),
                                              SizedBox(height: 6),
                                              Text('Image unavailable',
                                                  style: TextStyle(
                                                      color:
                                                          AppColors.inkDim,
                                                      fontSize: 13)),
                                            ],
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                        ],
                      ),
              ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('No floor plan yet.',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.5,
                    )),
            const SizedBox(height: 10),
            const Text(
              'Floor plans come from a LiDAR scan on Pro iPhones. Run one '
              'from the LiDAR screen and the room outline lands here.',
              style: TextStyle(color: AppColors.inkDim, height: 1.45),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => context.push('/lidar'),
                child: const Text('Open LiDAR scan'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
