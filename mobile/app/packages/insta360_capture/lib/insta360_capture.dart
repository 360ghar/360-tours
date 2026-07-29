// Dart side of the Insta360 camera plugin (MethodChannel 'tours360/insta360').
//
// The native layer is fully wired: camera discovery over the camera's WiFi
// hotspot, connection state, and panorama capture — up to the exact call
// sites of Insta360's official INSCameraSDK. That SDK is distributed by
// Insta360 under an application/NDA process and cannot be vendored here;
// ios/Classes/Insta360CapturePlugin.swift documents the three linkage points.
// Without the SDK framework the plugin reports `sdkLinked: false` and every
// camera call throws [Insta360NotLinkedException], which the UI surfaces as
// a "coming soon" state instead of crashing.

import 'package:flutter/services.dart';

class Insta360NotLinkedException implements Exception {
  final String message;

  const Insta360NotLinkedException([
    this.message =
        'Insta360 SDK is not linked in this build. See the plugin README.',
  ]);

  @override
  String toString() => message;
}

class Insta360CameraInfo {
  final String id;
  final String name;
  final String model;

  const Insta360CameraInfo({
    required this.id,
    required this.name,
    required this.model,
  });

  factory Insta360CameraInfo.fromMap(Map<dynamic, dynamic> map) =>
      Insta360CameraInfo(
        id: map['id'] as String? ?? '',
        name: map['name'] as String? ?? 'Insta360',
        model: map['model'] as String? ?? 'unknown',
      );
}

class Insta360Capture {
  static const _channel = MethodChannel('tours360/insta360');

  /// Whether the native build has the INSCameraSDK framework linked.
  static Future<bool> isSdkLinked() async =>
      await _channel.invokeMethod<bool>('isSdkLinked') ?? false;

  /// Discover reachable cameras. Returns an empty list when the phone is not
  /// on a camera's WiFi hotspot or the SDK is not linked.
  static Future<List<Insta360CameraInfo>> discoverCameras() async {
    try {
      final res =
          await _channel.invokeListMethod<dynamic>('discoverCameras');
      return (res ?? const [])
          .map((e) =>
              Insta360CameraInfo.fromMap(e as Map<dynamic, dynamic>))
          .toList();
    } on PlatformException catch (e) {
      if (e.code == 'SDK_NOT_LINKED') throw const Insta360NotLinkedException();
      rethrow;
    }
  }

  static Future<void> connect(String cameraId) async {
    try {
      await _channel.invokeMethod('connect', {'cameraId': cameraId});
    } on PlatformException catch (e) {
      if (e.code == 'SDK_NOT_LINKED') throw const Insta360NotLinkedException();
      rethrow;
    }
  }

  /// Trigger a 360 capture on the connected camera and download the
  /// stitched equirectangular JPEG. Returns the local file path.
  static Future<String> capturePanorama() async {
    try {
      final path = await _channel.invokeMethod<String>('capturePanorama');
      if (path == null) throw Exception('Capture returned no file');
      return path;
    } on PlatformException catch (e) {
      if (e.code == 'SDK_NOT_LINKED') throw const Insta360NotLinkedException();
      rethrow;
    }
  }
}
