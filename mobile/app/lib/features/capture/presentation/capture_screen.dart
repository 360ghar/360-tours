import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import 'capture_controller.dart';
import 'widgets/target_overlay.dart';

/// Guided 360° capture: full-bleed camera, projected target dots, auto
/// capture on dwell. An agent should get a full room in under 60 seconds.
class CaptureScreen extends ConsumerStatefulWidget {
  const CaptureScreen({super.key, this.assetId});

  /// When set, the capture becomes a new ROOM inside this existing asset.
  final String? assetId;

  @override
  ConsumerState<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends ConsumerState<CaptureScreen>
    with WidgetsBindingObserver {
  bool _permissionDenied = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState lifecycleState) {
    final controller = ref.read(captureControllerProvider.notifier);
    final capture = ref.read(captureControllerProvider);
    final active =
        capture.phase == CapturePhase.aiming ||
        capture.phase == CapturePhase.shooting ||
        capture.phase == CapturePhase.initializing;
    if (lifecycleState == AppLifecycleState.inactive) {
      if (active) controller.pauseCamera();
    } else if (lifecycleState == AppLifecycleState.resumed) {
      if (controller.isCameraPaused && active) {
        controller.initialize();
      }
    }
  }

  Future<void> _start() async {
    final status = await Permission.camera.request();
    if (!mounted) return;
    if (!status.isGranted) {
      setState(() => _permissionDenied = true);
      return;
    }
    await ref.read(captureControllerProvider.notifier).initialize();
    if (!mounted) return;
    _presentResumeFlow();
  }

  /// Offer to resume an interrupted session (or explain why it cannot be
  /// resumed). Runs once per screen entry — lifecycle re-initializations
  /// skip it because the offer/error are cleared after presentation.
  Future<void> _presentResumeFlow() async {
    final controller = ref.read(captureControllerProvider.notifier);
    var offer = ref.read(captureControllerProvider).resumeOffer;
    if (offer == null) {
      final error = ref.read(captureControllerProvider).resumeError;
      if (error != null) {
        controller.dismissResumeError();
        if (!mounted) return;
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Resume capture'),
            content: Text(error),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('Start a new capture'),
              ),
            ],
          ),
        );
      }
      return;
    }

    final resume = await showDialog<bool>(
      context: context,
      // Only the explicit Discard button may delete the prior capture —
      // the barrier AND the system Back button must never discard by
      // accident (and must not strand the screen on its spinner).
      barrierDismissible: false,
      builder: (ctx) => PopScope(
        canPop: false,
        child: AlertDialog(
          title: const Text('Resume previous capture?'),
          content: Text(
            'You captured ${offer.frameCount} of ${offer.total} shots. '
            'Continue where you left off?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Discard'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Resume'),
            ),
          ],
        ),
      ),
    );
    if (!mounted || resume == null) return;
    if (resume) {
      await controller.resumeSession();
    } else {
      await controller.discardSession();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(captureControllerProvider);
    final controller = ref.read(captureControllerProvider.notifier);

    // Tactile confirmation a frame was taken (the shutter is silent with
    // enableAudio:false). Fires on every successful capture, auto or manual —
    // framePaths only grows when a frame is actually saved.
    ref.listen<CaptureState>(captureControllerProvider, (prev, next) {
      if ((prev?.framePaths.length ?? 0) < next.framePaths.length) {
        HapticFeedback.mediumImpact();
      }
    });

    if (_permissionDenied) {
      return _MessageScaffold(
        message: 'Camera access is required to scan a room.',
        actionLabel: 'Open Settings',
        onAction: openAppSettings,
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: switch (state.phase) {
        CapturePhase.initializing => const Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text(
                'Preparing camera and sensors…',
                style: TextStyle(color: Colors.white70, fontSize: 15),
              ),
            ],
          ),
        ),
        CapturePhase.error => _MessageScaffold(
          message: state.errorMessage ?? 'Camera error',
          actionLabel: 'Retry',
          onAction: () => controller.initialize(),
        ),
        CapturePhase.review => _ReviewSheet(
          state: state,
          intoAssetId: widget.assetId,
        ),
        _ => _CaptureBody(state: state, controller: controller),
      },
    );
  }
}

class _CaptureBody extends StatelessWidget {
  const _CaptureBody({required this.state, required this.controller});

  final CaptureState state;
  final CaptureController controller;

  @override
  Widget build(BuildContext context) {
    final camera = controller.camera;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (camera != null && camera.value.isInitialized) CameraPreview(camera),
        CustomPaint(painter: TargetOverlayPainter(state)),
        SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 8,
                ),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => Navigator.of(context).maybePop(),
                      icon: const Icon(Icons.close, color: Colors.white),
                      tooltip: 'Cancel',
                    ),
                    Expanded(
                      child: Text(
                        instructionFor(state),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                          shadows: [Shadow(blurRadius: 8)],
                        ),
                      ),
                    ),
                    SizedBox(
                      width: 64,
                      child: Text(
                        '${state.capturedTargets.length} / ${state.total}',
                        textAlign: TextAlign.right,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w500,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const Spacer(),
              // Stay-in-place reminder for the first few shots.
              if (state.framePaths.length < 3)
                Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Text(
                    'Stay in the same spot. Rotate only',
                    style: TextStyle(color: Colors.white, fontSize: 14),
                  ),
                ),
              // Capture finished but angles were skipped: the instruction
              // says so — give the aiming UI an explicit jump-to-missing.
              if (state.captureComplete && !state.done)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: FilledButton.tonalIcon(
                    onPressed: controller.retakeMissingAngles,
                    icon: const Icon(Icons.replay, size: 18),
                    label: const Text('Retake missing angles'),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.only(bottom: 28),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const SizedBox(width: 72),
                    // Manual shutter — always available.
                    GestureDetector(
                      onTap: controller.captureFrame,
                      child: Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 4),
                        ),
                        child: Center(
                          child: Container(
                            width: 56,
                            height: 56,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ),
                    SizedBox(
                      width: 72,
                      child: TextButton(
                        onPressed: controller.skipTarget,
                        child: const Text(
                          'Skip',
                          style: TextStyle(color: Colors.white70),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Post-capture: name the scan and hand it to stitching + upload.
class _ReviewSheet extends ConsumerStatefulWidget {
  const _ReviewSheet({required this.state, this.intoAssetId});

  final CaptureState state;
  final String? intoAssetId;

  @override
  ConsumerState<_ReviewSheet> createState() => _ReviewSheetState();
}

class _ReviewSheetState extends ConsumerState<_ReviewSheet> {
  final _name = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final user = ref.read(authRepositoryProvider).currentUser;
    if (user == null) return;
    setState(() => _saving = true);
    final controller = ref.read(captureControllerProvider.notifier);
    final intoAssetId = widget.intoAssetId;
    await controller.saveScan(_name.text, user.id, intoAssetId: intoAssetId);
    if (!mounted) return;
    if (intoAssetId != null) {
      context.go('/asset/$intoAssetId/rooms');
    } else {
      context.go('/');
    }
  }

  @override
  Widget build(BuildContext context) {
    final frames = widget.state.framePaths;
    final state = widget.state;
    final missing = state.effectivePlan.missingTargets(
      state.capturedTargets.toSet(),
    );
    final lowQuality = state.lowQualityTargets;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 12),
            Text(
              '${frames.length} shots captured',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Name this room. Stitching starts right away and the '
              'share link is ready as soon as the upload finishes.',
              style: TextStyle(color: AppColors.inkDim),
            ),
            if (missing.isNotEmpty) ...[
              const SizedBox(height: 12),
              _WarningChip(
                icon: Icons.error_outline,
                text:
                    '${missing.length} angle${missing.length == 1 ? '' : 's'} '
                    'were skipped — the tour may have gaps.',
              ),
            ],
            if (lowQuality.isNotEmpty) ...[
              const SizedBox(height: 8),
              _WarningChip(
                icon: Icons.warning_amber_rounded,
                text:
                    '${lowQuality.length} shot${lowQuality.length == 1 ? '' : 's'} '
                    'were low quality.',
              ),
            ],
            if (missing.isEmpty && lowQuality.isEmpty) ...[
              const SizedBox(height: 12),
              _WarningChip(
                icon: Icons.check_circle_outline,
                iconColor: AppColors.success,
                positive: true,
                text:
                    'All ${frames.length} angles captured — '
                    'looks good to stitch.',
              ),
            ],
            const SizedBox(height: 20),
            SizedBox(
              height: 84,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: frames.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (_, i) => ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.file(
                    File(frames[i]),
                    width: 84,
                    height: 84,
                    fit: BoxFit.cover,
                  ),
                ),
              ),
            ),
            if (missing.isNotEmpty) ...[
              const SizedBox(height: 12),
              TextButton.icon(
                onPressed: () {
                  ref
                      .read(captureControllerProvider.notifier)
                      .retakeMissingAngles();
                },
                icon: const Icon(Icons.replay),
                label: Text(
                  'Retake ${missing.length == 1 ? 'missing angle' : 'missing angles'}',
                ),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _name,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(hintText: 'Living room'),
              onSubmitted: (_) => _save(),
            ),
            const Spacer(),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _saving ? null : _save,
                child: Text(_saving ? 'Saving…' : 'Save scan'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WarningChip extends StatelessWidget {
  const _WarningChip({
    required this.icon,
    required this.text,
    this.iconColor,
    this.positive = false,
  });

  final IconData icon;
  final String text;
  final Color? iconColor;

  /// Positive (informational) chips use a neutral container instead of the
  /// error container.
  final bool positive;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: positive
            ? theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.6)
            : theme.colorScheme.errorContainer.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: iconColor ?? theme.colorScheme.error),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.inkDim,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageScaffold extends StatelessWidget {
  const _MessageScaffold({
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });

  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.inkDim, fontSize: 16),
                ),
                const SizedBox(height: 20),
                FilledButton(onPressed: onAction, child: Text(actionLabel)),
                TextButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  child: const Text('Back'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
