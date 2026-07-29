# Reference: native plugins

Path packages under `app/packages/`.

## lidar_scanner

- iOS plugin wrapping Apple **RoomPlan** (USDZ + parametric JSON + measurements) and RealityKit photogrammetry (iOS 17+).
- Dart API: `app/packages/lidar_scanner/lib/lidar_scanner.dart`
- Native: `ios/Classes/LidarScannerPlugin.swift`
- UI entry: `app/lib/features/lidar/presentation/lidar_scan_screen.dart`
- Requires physical LiDAR-capable iPhone; degrade gracefully otherwise.

## insta360_capture

- iOS plugin for Insta360 camera discovery and panorama capture.
- Dart API: `app/packages/insta360_capture/lib/insta360_capture.dart`
- Native: `ios/Classes/Insta360CapturePlugin.swift`
- Full README: `app/packages/insta360_capture/README.md`

### What works without the NDA SDK

- `isSdkLinked()` runtime detection
- `discoverCameras()` via WiFi SSID heuristics + TCP probe `192.168.42.1:6666`

### What throws until SDK is linked

- `connect()`, `capturePanorama()` → `SDK_NOT_LINKED` / `Insta360NotLinkedException`

### Linkage

- Official `INSCameraSDK` is NDA-gated — **never commit the framework**.
- Three `// SDK LINKAGE POINT` comments in the Swift plugin document exact swap-ins.
- Entitlements: local network, wifi-info as documented in plugin README.

## Rule

App feature code talks only to the Dart package APIs, never to private native symbols.
