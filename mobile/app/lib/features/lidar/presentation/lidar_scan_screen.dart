import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lidar_scanner/lidar_scanner.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/theme/app_theme.dart';

final lidarCapabilityProvider =
    FutureProvider.autoDispose((ref) => LidarScanner.checkCapability());

/// LiDAR room scan via Apple RoomPlan. Unsupported devices get an honest
/// explanation and the guided-photo path instead.
class LidarScanScreen extends ConsumerStatefulWidget {
  const LidarScanScreen({super.key});

  @override
  ConsumerState<LidarScanScreen> createState() => _LidarScanScreenState();
}

class _LidarScanScreenState extends ConsumerState<LidarScanScreen> {
  StreamSubscription<LidarScanEvent>? _events;
  LidarScanEvent? _lastEvent;
  LidarScanResult? _result;
  List<Measurement> _measurements = const [];
  bool _scanning = false;
  String? _error;

  @override
  void dispose() {
    _events?.cancel();
    // If the route is popped mid-scan the full-screen native RoomPlan modal
    // is only dismissed via its native Done button; explicitly stop the
    // session so the native side releases the camera capture session.
    if (_scanning) {
      unawaited(LidarScanner.stopScan()
          .then((_) {})
          .catchError((Object _) {}));
    }
    super.dispose();
  }

  Future<void> _start() async {
    setState(() {
      _scanning = true;
      _error = null;
      _result = null;
      _measurements = const [];
    });
    try {
      _events = LidarScanner.scanEvents().listen((e) {
        setState(() => _lastEvent = e);
        if (e.phase == 'error') {
          _events?.cancel();
          _events = null;
          setState(() {
            _scanning = false;
            _error = e.instruction ?? 'The scan session failed. Try again.';
          });
          return;
        }
        // Native Done button ends the session; collect the result.
        if (e.phase == 'finished' && _scanning) _stop();
      });
      await LidarScanner.startScan();
    } catch (e) {
      setState(() {
        _scanning = false;
        _error = 'Could not start the scan: $e';
      });
    }
  }

  Future<void> _share() async {
    final result = _result;
    if (result == null) return;
    try {
      await SharePlus.instance.share(ShareParams(
        files: [XFile(result.usdzPath)],
        subject: 'LiDAR room scan',
      ));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not share the scan: $e')),
        );
      }
    }
  }

  Future<void> _stop() async {
    try {
      final result = await LidarScanner.stopScan();
      final measurements =
          await LidarScanner.getMeasurements(result.roomJsonPath);
      setState(() {
        _scanning = false;
        _result = result;
        _measurements = measurements;
      });
    } catch (e) {
      setState(() {
        _scanning = false;
        _error = 'Scan failed: $e';
      });
    } finally {
      await _events?.cancel();
      _events = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final capability = ref.watch(lidarCapabilityProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('LiDAR scan')),
      body: capability.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _Unsupported(reason: '$e'),
        data: (cap) => !cap.supported || !cap.roomPlanAvailable
            ? _Unsupported(reason: cap.reason ?? 'Not supported here.')
            : Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _scanning
                          ? 'Walk the room slowly.'
                          : _result != null
                              ? 'Room captured.'
                              : 'True-to-scale room capture.',
                      style: Theme.of(context)
                          .textTheme
                          .headlineSmall
                          ?.copyWith(
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.5,
                          ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      _scanning
                          ? (_lastEvent?.instruction ??
                              'Point the camera along the walls; corners '
                                  'matter most.')
                          : 'Uses the LiDAR sensor to build a parametric '
                              'room model with real measurements '
                              '(±2 cm class accuracy).',
                      style: const TextStyle(
                          color: AppColors.inkDim, height: 1.45),
                    ),
                    const SizedBox(height: 24),
                    if (_scanning && _lastEvent != null) ...[
                      LinearProgressIndicator(
                          value: _lastEvent!.progress.clamp(0, 1),
                          minHeight: 6),
                      const SizedBox(height: 8),
                      Text(
                        '${_lastEvent!.wallCount} walls detected',
                        style: const TextStyle(
                            color: AppColors.inkDim, fontSize: 13),
                      ),
                    ],
                    if (_error != null)
                      Text(_error!,
                          style:
                              const TextStyle(color: AppColors.danger)),
                    if (_measurements.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Expanded(
                        child: ListView(
                          children: [
                            for (final m in _measurements)
                              Padding(
                                padding:
                                    const EdgeInsets.only(bottom: 10),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text(m.label,
                                          style: const TextStyle(
                                              color: AppColors.ink)),
                                    ),
                                    Text(
                                      '${m.meters.toStringAsFixed(2)} m',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w600),
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      m.accuracy == 'lidar'
                                          ? '±2 cm'
                                          : 'estimate',
                                      style: const TextStyle(
                                          color: AppColors.inkFaint,
                                          fontSize: 12),
                                    ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                    ] else
                      const Spacer(),
                    if (_result != null) ...[
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: _share,
                          icon: const Icon(Icons.share_outlined),
                          label: const Text('Share 3D scan'),
                        ),
                      ),
                      const SizedBox(height: 10),
                    ],
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _scanning ? _stop : _start,
                        child: Text(_scanning
                            ? 'Finish scan'
                            : _result != null
                                ? 'Scan again'
                                : 'Start scanning'),
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}

class _Unsupported extends StatelessWidget {
  const _Unsupported({required this.reason});

  final String reason;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 8),
          Text(
            'LiDAR not available on this device.',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.5,
                ),
          ),
          const SizedBox(height: 10),
          Text(reason,
              style: const TextStyle(color: AppColors.inkDim, height: 1.45)),
          const SizedBox(height: 6),
          const Text(
            'iPhone Pro models (12 Pro and later) carry the LiDAR sensor. '
            'The guided photo scan works everywhere and produces the same '
            'shareable tour.',
            style: TextStyle(color: AppColors.inkDim, height: 1.45),
          ),
          const Spacer(),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () => context.go('/capture'),
              child: const Text('Use guided photo scan'),
            ),
          ),
        ],
      ),
    );
  }
}
