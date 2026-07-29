import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:insta360_capture/insta360_capture.dart';

import '../../../core/theme/app_theme.dart';
import '../domain/processing_preference.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pref = ref.watch(processingPreferenceProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          const Padding(
            padding: EdgeInsets.only(bottom: 8, left: 4),
            child: Text('Processing',
                style: TextStyle(color: AppColors.inkDim, fontSize: 13)),
          ),
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(14),
            ),
            child: RadioGroup<ProcessingPreference>(
              groupValue: pref.value,
              onChanged: (v) async {
                if (v == null) return;
                try {
                  await ref
                      .read(processingPreferenceProvider.notifier)
                      .set(v);
                } catch (_) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content:
                            Text('Could not save the preference. Try again.'),
                      ),
                    );
                  }
                }
              },
              child: const Column(
                children: [
                  RadioListTile<ProcessingPreference>(
                    value: ProcessingPreference.deviceFirst,
                    title: Text('On-device first'),
                    subtitle: Text(
                      'Stitch on the phone; the cloud only steps in when '
                      'that fails.',
                      style: TextStyle(color: AppColors.inkDim),
                    ),
                  ),
                  Divider(indent: 16, endIndent: 16),
                  RadioListTile<ProcessingPreference>(
                    value: ProcessingPreference.cloudFirst,
                    title: Text('Cloud first'),
                    subtitle: Text(
                      'Ship raw frames to the backend stitcher. Better on '
                      'older phones; needs a connection.',
                      style: TextStyle(color: AppColors.inkDim),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          const Padding(
            padding: EdgeInsets.only(bottom: 8, left: 4),
            child: Text('Capture hardware',
                style: TextStyle(color: AppColors.inkDim, fontSize: 13)),
          ),
          ListTile(
            tileColor: AppColors.surface,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14)),
            leading: const Icon(Icons.sensors, color: AppColors.ink),
            title: const Text('LiDAR room scan'),
            subtitle: const Text('iPhone Pro models',
                style: TextStyle(color: AppColors.inkDim)),
            trailing:
                const Icon(Icons.chevron_right, color: AppColors.inkDim),
            onTap: () => context.push('/lidar'),
          ),
          const SizedBox(height: 10),
          const _Insta360Tile(),
        ],
      ),
    );
  }
}

class _Insta360Tile extends StatelessWidget {
  const _Insta360Tile();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Insta360CameraInfo>>(
      // Real WiFi probe: reports a camera when the phone is on an
      // Insta360 hotspot; empty otherwise.
      future: _discover(),
      builder: (context, snap) {
        final found = snap.data ?? const [];
        return ListTile(
          tileColor: AppColors.surface,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14)),
          leading:
              const Icon(Icons.camera_outdoor, color: AppColors.ink),
          title: const Text('Insta360 camera'),
          subtitle: Text(
            snap.connectionState != ConnectionState.done
                ? 'Looking for a camera on this network…'
                : found.isEmpty
                    ? 'None found. Join the camera\'s WiFi and reopen.'
                    : '${found.first.name} detected. SDK linkage pending '
                        '(see plugin README).',
            style: const TextStyle(color: AppColors.inkDim),
          ),
        );
      },
    );
  }

  Future<List<Insta360CameraInfo>> _discover() async {
    try {
      return await Insta360Capture.discoverCameras();
    } on Insta360NotLinkedException {
      return const [];
    } catch (_) {
      return const [];
    }
  }
}
