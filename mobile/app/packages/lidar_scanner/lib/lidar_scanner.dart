// Dart side of the LiDAR room-scanning plugin.
//
// Native bridge: MethodChannel 'tours360/lidar' + EventChannel
// 'tours360/lidar/events'. The iOS implementation wraps Apple RoomPlan
// (RoomCaptureSession) on supported devices; everything degrades gracefully
// elsewhere (checkCapability reports why).

import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';

class LidarCapability {
  final bool supported;
  final bool roomPlanAvailable;
  final String? reason;

  const LidarCapability({
    required this.supported,
    required this.roomPlanAvailable,
    this.reason,
  });

  factory LidarCapability.fromMap(Map<dynamic, dynamic> map) =>
      LidarCapability(
        supported: map['supported'] as bool? ?? false,
        roomPlanAvailable: map['roomPlanAvailable'] as bool? ?? false,
        reason: map['reason'] as String?,
      );
}

class LidarScanEvent {
  /// 'scanning' | 'processing' | 'finished'
  final String phase;
  final double progress;
  final int wallCount;
  final String? instruction;

  const LidarScanEvent({
    required this.phase,
    this.progress = 0,
    this.wallCount = 0,
    this.instruction,
  });

  factory LidarScanEvent.fromMap(Map<dynamic, dynamic> map) => LidarScanEvent(
        phase: map['phase'] as String? ?? 'scanning',
        progress: (map['progress'] as num?)?.toDouble() ?? 0,
        wallCount: (map['wallCount'] as num?)?.toInt() ?? 0,
        instruction: map['instruction'] as String?,
      );
}

class LidarScanResult {
  /// Exported USDZ mesh of the captured room.
  final String usdzPath;

  /// CapturedRoom parametric JSON (walls, doors, windows, objects).
  final String roomJsonPath;

  const LidarScanResult({required this.usdzPath, required this.roomJsonPath});
}

class Measurement {
  final String label;
  final double meters;

  /// 'lidar' (RoomPlan parametric data, ±2 cm class) or 'estimated'.
  final String accuracy;

  const Measurement({
    required this.label,
    required this.meters,
    required this.accuracy,
  });
}

class LidarScanner {
  static const _channel = MethodChannel('tours360/lidar');
  static const _events = EventChannel('tours360/lidar/events');

  static Future<LidarCapability> checkCapability() async {
    if (!Platform.isIOS) {
      return const LidarCapability(
        supported: false,
        roomPlanAvailable: false,
        reason: 'LiDAR scanning is iOS-only.',
      );
    }
    final res = await _channel
        .invokeMapMethod<dynamic, dynamic>('checkCapability');
    return LidarCapability.fromMap(res ?? const {});
  }

  static Future<void> startScan() => _channel.invokeMethod('startScan');

  static Stream<LidarScanEvent> scanEvents() =>
      _events.receiveBroadcastStream().map(
          (e) => LidarScanEvent.fromMap(e as Map<dynamic, dynamic>));

  static Future<LidarScanResult> stopScan() async {
    final res =
        await _channel.invokeMapMethod<dynamic, dynamic>('stopScan');
    return LidarScanResult(
      usdzPath: res!['usdzPath'] as String,
      roomJsonPath: res['roomJsonPath'] as String,
    );
  }

  /// Build a textured USDZ model from a set of photos via RealityKit
  /// Object Capture (iOS 17+, A14+ devices). Progress is reported on
  /// [scanEvents] with phase 'processing'. Returns the .usdz file path.
  /// Throws a [PlatformException] with code 'PHOTOGRAMMETRY_UNSUPPORTED'
  /// on unsupported devices/OS versions.
  static Future<String> buildPhotogrammetry(List<String> imagePaths) async {
    final res = await _channel.invokeMapMethod<dynamic, dynamic>(
        'buildPhotogrammetry', {'imagePaths': imagePaths});
    return res!['usdzPath'] as String;
  }

  /// Wall/room dimensions parsed from the CapturedRoom JSON export.
  /// Parsed Dart-side: the JSON is Apple's parametric representation and
  /// walls carry a `dimensions` [width, height, thickness] array.
  static Future<List<Measurement>> getMeasurements(
      String roomJsonPath) async {
    final raw = jsonDecode(await File(roomJsonPath).readAsString())
        as Map<String, dynamic>;
    final measurements = <Measurement>[];

    final walls = (raw['walls'] as List?) ?? const [];
    var i = 0;
    for (final wall in walls) {
      final dims = ((wall as Map)['dimensions'] as List?)
          ?.map((d) => (d as num).toDouble())
          .toList();
      if (dims == null || dims.isEmpty) continue;
      i++;
      measurements.add(Measurement(
        label: 'Wall $i width',
        meters: dims[0],
        accuracy: 'lidar',
      ));
      if (dims.length > 1) {
        measurements.add(Measurement(
          label: 'Wall $i height',
          meters: dims[1],
          accuracy: 'lidar',
        ));
      }
    }

    // Floor area for a simple rectangular room (4 walls): w × d.
    final widths = measurements
        .where((m) => m.label.endsWith('width'))
        .map((m) => m.meters)
        .toList();
    if (widths.length == 4) {
      widths.sort();
      measurements.add(Measurement(
        label: 'Approx. floor area (m²)',
        meters: widths[0] * widths[2],
        accuracy: 'estimated',
      ));
    }
    return measurements;
  }
}
