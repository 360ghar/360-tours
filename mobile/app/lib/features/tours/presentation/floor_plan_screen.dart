import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/models/api_dtos.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../assets/presentation/asset_providers.dart';

/// Floor plans of the tour, all pages, from the floor-plans table.
final floorPlansProvider = FutureProvider.autoDispose
    .family<List<FloorPlanDto>, String>(
        (ref, tourId) => ref.watch(backendApiProvider).getFloorPlans(tourId));

class FloorPlanScreen extends ConsumerStatefulWidget {
  const FloorPlanScreen({super.key, required this.assetId});

  final String assetId;

  @override
  ConsumerState<FloorPlanScreen> createState() => _FloorPlanScreenState();
}

class _FloorPlanScreenState extends ConsumerState<FloorPlanScreen> {
  bool _isGenerating = false;

  /// Asks the server to draw a plan from the tour's rooms and doorway links.
  /// The server owns the layout, so the list is refetched, not patched.
  Future<void> _generate(String tourId) async {
    setState(() => _isGenerating = true);
    try {
      await ref.read(backendApiProvider).generateFloorPlan(tourId);
      ref.invalidate(floorPlansProvider(tourId));
      _say('Estimated from your rooms and doorways — schematic, not to scale.');
    } catch (e) {
      _say('Could not generate a floor plan. ${_reason(e)}');
    } finally {
      if (mounted) setState(() => _isGenerating = false);
    }
  }

  /// Says what failed, with the server's reason when it sent one.
  String _reason(Object e) => e is ApiException && !e.isNetwork
      ? e.userMessage
      : 'Check your connection and try again.';

  void _say(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final asset = ref.watch(assetProvider(widget.assetId)).value;
    final tourId = asset?.remoteTourId;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Floor plan'),
        actions: [
          if (tourId != null)
            IconButton(
              tooltip: 'Generate from tour',
              onPressed: _isGenerating ? null : () => _generate(tourId),
              icon: _isGenerating
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.auto_awesome_outlined),
            ),
        ],
      ),
      body: tourId == null
          ? const Center(
              child: Text('Not uploaded yet',
                  style: TextStyle(color: AppColors.inkDim)),
            )
          : ref.watch(floorPlansProvider(tourId)).when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (_, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          'Could not load the floor plan.',
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
                              ref.invalidate(floorPlansProvider(tourId)),
                          icon: const Icon(Icons.refresh, size: 18),
                          label: const Text('Try again'),
                        ),
                      ],
                    ),
                  ),
                ),
                data: (plans) => plans.isEmpty
                    ? _Empty(
                        isGenerating: _isGenerating,
                        onGenerate: () => _generate(tourId),
                      )
                    : ListView(
                        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                        children: [
                          for (final plan in plans)
                            _PlanCard(
                              plan: plan,
                              assetId: widget.assetId,
                            ),
                        ],
                      ),
              ),
    );
  }
}

/// One plan: its name, the drawing, and a numbered legend of its markers. A
/// marker opens the hotspot editor of the scene it points at.
class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.plan, required this.assetId});

  final FloorPlanDto plan;
  final String assetId;

  @override
  Widget build(BuildContext context) {
    final markers = plan.markers;
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            plan.name,
            style: const TextStyle(
                color: AppColors.ink,
                fontSize: 16,
                fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          Text(
            'Floor ${plan.floorNumber}',
            style: const TextStyle(color: AppColors.inkFaint, fontSize: 13),
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: _PlanImage(plan: plan, assetId: assetId),
          ),
          if (markers.isNotEmpty) ...[
            const SizedBox(height: 10),
            for (var i = 0; i < markers.length; i++)
              _LegendRow(
                number: i + 1,
                marker: markers[i],
                onTap: () => context.push(
                    '/asset/$assetId/scenes/${markers[i].sceneId}/hotspots'),
              ),
          ],
        ],
      ),
    );
  }
}

/// The drawing with its markers on top. The image is the only child that
/// sizes the Stack, so the box is exactly the drawing; the pins sit in an
/// overlay filled to that box, which is what makes their percentages land on
/// the drawing (an `Align` in the loose Stack itself would collapse to the
/// pin's own height and lose the vertical position).
class _PlanImage extends StatelessWidget {
  const _PlanImage({required this.plan, required this.assetId});

  final FloorPlanDto plan;
  final String assetId;

  /// A marker's tap target, and the size the offset correction assumes.
  static const _pinSize = 28.0;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        CachedNetworkImage(
          imageUrl: plan.imageUrl,
          fit: BoxFit.scaleDown,
          placeholder: (_, _) => const AspectRatio(
            aspectRatio: 1.4,
            child: ColoredBox(color: AppColors.surface),
          ),
          errorWidget: (_, _, _) => const AspectRatio(
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
                        style:
                            TextStyle(color: AppColors.inkDim, fontSize: 13)),
                  ],
                ),
              ),
            ),
          ),
        ),
        Positioned.fill(
          child: Stack(
            children: [
              for (var i = 0; i < plan.markers.length; i++)
                _pin(context, number: i + 1, marker: plan.markers[i]),
            ],
          ),
        ),
      ],
    );
  }

  Widget _pin(BuildContext context,
      {required int number, required FloorPlanMarkerDto marker}) {
    // Align places the pin at its share of the free space; the translate
    // removes the half-pin difference so the pin's centre sits on the point
    // the marker stores. x/y are clamped: a bad pair must not escape the image.
    final ax = (marker.x.clamp(0.0, 100.0).toDouble() / 100) * 2 - 1;
    final ay = (marker.y.clamp(0.0, 100.0).toDouble() / 100) * 2 - 1;
    return Align(
      alignment: Alignment(ax, ay),
      child: Transform.translate(
        offset: Offset(_pinSize * ax / 2, _pinSize * ay / 2),
        child: Tooltip(
          message: marker.label ?? 'Room $number',
          child: Material(
            color: AppColors.accent,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: () => context.push(
                  '/asset/$assetId/scenes/${marker.sceneId}/hotspots'),
              child: SizedBox(
                width: _pinSize,
                height: _pinSize,
                child: Center(
                  child: Text(
                    '$number',
                    style: const TextStyle(
                        color: AppColors.background,
                        fontSize: 13,
                        fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _LegendRow extends StatelessWidget {
  const _LegendRow(
      {required this.number, required this.marker, required this.onTap});

  final int number;
  final FloorPlanMarkerDto marker;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Container(
              width: 22,
              height: 22,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                  color: AppColors.accent, shape: BoxShape.circle),
              child: Text(
                '$number',
                style: const TextStyle(
                    color: AppColors.background,
                    fontSize: 12,
                    fontWeight: FontWeight.w700),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                marker.label ?? 'Room $number',
                style: const TextStyle(color: AppColors.inkDim, fontSize: 14),
              ),
            ),
            const Icon(Icons.chevron_right,
                color: AppColors.inkFaint, size: 18),
          ],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.isGenerating, required this.onGenerate});

  final bool isGenerating;
  final VoidCallback onGenerate;

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
              'Generate a schematic plan from this tour\'s rooms and doorways, '
              'or add a measured one in the web editor and it shows here.',
              style: TextStyle(color: AppColors.inkDim, height: 1.45),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: isGenerating ? null : onGenerate,
              icon: isGenerating
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.auto_awesome_outlined, size: 18),
              label: const Text('Generate from tour'),
            ),
          ],
        ),
      ),
    );
  }
}
