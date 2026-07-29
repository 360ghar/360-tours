# insta360_capture

Flutter plugin (iOS) for connecting to Insta360 cameras and triggering 360°
panorama captures from the Tours360 app.

Everything up to the SDK boundary is implemented and working today:

- `isSdkLinked()` — detects at runtime whether `INSCameraSDK.framework` is
  linked into the app.
- `discoverCameras()` — detects a camera without the SDK: checks whether the
  phone's current WiFi SSID matches the Insta360 hotspot naming pattern
  (`X3…` / `X4…` / `X5…` / `ONE…` / `Insta360…`, via `NEHotspotNetwork`), and
  falls back to a 1-second TCP reachability probe of the camera's documented
  control endpoint `192.168.42.1:6666`.
- `connect()` / `capturePanorama()` — throw `SDK_NOT_LINKED`
  (surfaced Dart-side as `Insta360NotLinkedException`) until the SDK is
  linked; the exact call sites for the SDK are already scaffolded.

## Obtaining INSCameraSDK

The official iOS SDK is NDA-gated and cannot be vendored in this repo.

1. Go to <https://developer.insta360.com> and create a developer account.
2. Apply for **SDK access** (choose the mobile/iOS "Camera SDK"). You describe
   your app and use case; Insta360 reviews and emails approval — typically a
   few business days.
3. Once approved, download the iOS package from the developer console. It
   contains `INSCameraSDK.framework` (and usually `INSCoreMedia.framework`)
   plus headers and sample code.

## Linking the framework

1. Drop both frameworks into the app:
   `app/ios/Frameworks/INSCameraSDK.framework` and
   `app/ios/Frameworks/INSCoreMedia.framework`.
2. In Xcode (`app/ios/Runner.xcworkspace`), select the **Runner** target →
   *General* → *Frameworks, Libraries, and Embedded Content* → add both,
   set **Embed & Sign**.
3. Add to `Runner`'s Info.plist if the SDK docs require it:
   `NSLocalNetworkUsageDescription` (already added by this repo) and the
   `com.apple.developer.networking.wifi-info` entitlement so
   `NEHotspotNetwork.fetchCurrent` can read the SSID.
4. Rebuild. `Insta360Capture.isSdkLinked()` now returns `true` — the plugin
   detects the class `INSCameraManager` via the ObjC runtime, so no plugin
   changes are needed for detection.

## The three linkage points to complete

All in `ios/Classes/Insta360CapturePlugin.swift`, each marked with a
`// SDK LINKAGE POINT n` comment containing the exact SDK calls to swap in:

1. **`SDK LINKAGE POINT 1` — discovery** (in `discoverCameras`): replace the
   WiFi heuristics with `INSCameraManager.socket().setup()` and read
   `INSCameraManager.socket().currentCamera` once `cameraState` reaches
   `.connected`; return its serial number, name, and camera type.
   Note: the actual current Swift code in `ios/Classes/Insta360CapturePlugin.swift`
   runtime-probes the selector `socketManager` (via `NSSelectorFromString("socketManager")`)
   rather than calling the documented `INSCameraManager.socket()` accessor, so whoever
   links the real SDK must verify against the actual Insta360 SDK headers/docs which
   selector/accessor name is correct before wiring it up.
2. **`SDK LINKAGE POINT 2` — connection** (in `connect`): call
   `INSCameraManager.socket().setup()` and KVO-observe `cameraState`,
   resolving the Flutter result on `INSCameraStateConnected` (with a timeout
   failure path).
3. **`SDK LINKAGE POINT 3` — capture** (in `capturePanorama`): build
   `INSTakePictureOptions`, call
   `INSCameraManager.shared().commandManager.takePicture(with:)`, then
   download the stitched equirectangular JPEG from the camera's HTTP endpoint
   (`http://192.168.42.1` + the returned photo URI) to a local temp file and
   return that path.

Once linked, import the SDK properly (`import INSCameraSDK`) and replace the
runtime `NSClassFromString`/`perform(_:)` dispatch with typed calls.
