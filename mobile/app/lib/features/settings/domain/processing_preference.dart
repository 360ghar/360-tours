import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where heavy processing runs first. deviceFirst tries the on-device
/// OpenCV stitcher before the cloud; cloudFirst ships raw frames straight
/// to the backend stitcher (better quality on weak phones, needs network).
enum ProcessingPreference { deviceFirst, cloudFirst }

const _prefKey = 'processing_preference';

final processingPreferenceProvider = AsyncNotifierProvider<
    ProcessingPreferenceNotifier,
    ProcessingPreference>(ProcessingPreferenceNotifier.new);

class ProcessingPreferenceNotifier
    extends AsyncNotifier<ProcessingPreference> {
  @override
  Future<ProcessingPreference> build() async {
    final prefs = await SharedPreferences.getInstance();
    return ProcessingPreference.values.asNameMap()[prefs.getString(_prefKey)] ??
        ProcessingPreference.deviceFirst;
  }

  Future<void> set(ProcessingPreference value) async {
    final previous = state;
    try {
      // Persist before flipping UI state: if the write fails the radio
      // group stays on the value that is actually stored on disk.
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefKey, value.name);
      state = AsyncData(value);
    } catch (_) {
      state = previous;
      rethrow;
    }
  }
}
