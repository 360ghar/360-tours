import Flutter
import UIKit
import Network

#if canImport(NetworkExtension)
import NetworkExtension
#endif

/// Insta360 camera plugin.
///
/// The official INSCameraSDK is distributed by Insta360 under an
/// application/NDA process (https://developer.insta360.com) and is NOT
/// vendored in this repository. Everything up to the SDK boundary is real:
/// WiFi-hotspot discovery, the reachability probe of the camera's documented
/// address (192.168.42.1:6666), and the channel plumbing. The three places
/// where the SDK plugs in are marked `SDK LINKAGE POINT 1/2/3` below and
/// documented in this package's README.md.
public class Insta360CapturePlugin: NSObject, FlutterPlugin {

  /// The documented fixed IP + control port of an Insta360 camera hotspot.
  private static let cameraHost = "192.168.42.1"
  private static let cameraPort: UInt16 = 6666

  public static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: "tours360/insta360", binaryMessenger: registrar.messenger())
    let instance = Insta360CapturePlugin()
    registrar.addMethodCallDelegate(instance, channel: channel)
  }

  public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "isSdkLinked":
      result(Self.sdkLinked)
    case "discoverCameras":
      discoverCameras(result: result)
    case "connect":
      let args = call.arguments as? [String: Any]
      connect(cameraId: args?["cameraId"] as? String ?? "", result: result)
    case "capturePanorama":
      capturePanorama(result: result)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  // MARK: SDK detection

  /// True once the app vendors the INSCameraSDK framework — the class becomes
  /// visible to the ObjC runtime without this plugin linking it at build time.
  private static var sdkLinked: Bool {
    NSClassFromString("INSCameraManager") != nil
  }

  private static func sdkNotLinkedError() -> FlutterError {
    FlutterError(
      code: "SDK_NOT_LINKED",
      message: "The Insta360 INSCameraSDK framework is not linked in this build. "
        + "Apply for SDK access at https://developer.insta360.com, then drop "
        + "INSCameraSDK.framework into the app and complete the three "
        + "'SDK LINKAGE POINT' call sites in Insta360CapturePlugin.swift "
        + "(see packages/insta360_capture/README.md).",
      details: nil)
  }

  // MARK: discoverCameras

  private func discoverCameras(result: @escaping FlutterResult) {
    if Self.sdkLinked {
      // SDK LINKAGE POINT 1 — camera discovery.
      // With INSCameraSDK linked, replace this block with the real API:
      //
      //   INSCameraManager.socket().setup()
      //   // observe INSCameraManager.socket().cameraState == .connected,
      //   // then read INSCameraManager.socket().currentCamera
      //   let camera = INSCameraManager.socket().currentCamera
      //   result([["id": camera.serialNumber, "name": camera.name,
      //            "model": camera.cameraType]])
      //
      // Until the headers are available we can only reach the manager via the
      // ObjC runtime; kick off socket setup so a linked build starts
      // connecting, then fall through to the WiFi detection below to report
      // the camera's presence.
      if let managerClass = NSClassFromString("INSCameraManager") as? NSObject.Type {
        let socketSel = NSSelectorFromString("socketManager")
        if managerClass.responds(to: socketSel),
          let manager = managerClass.perform(socketSel)?.takeUnretainedValue() as? NSObject {
          let setupSel = NSSelectorFromString("setup")
          if manager.responds(to: setupSel) {
            manager.perform(setupSel)
          }
        }
      }
    }

    // No SDK (or SDK still connecting): detect the camera over WiFi.
    // 1) Preferred: current SSID matches the Insta360 hotspot naming pattern.
    //    Requires the "Access WiFi Information" entitlement + location
    //    permission; when unavailable fetchCurrent returns nil and we fall
    //    back to the TCP probe.
    if #available(iOS 14.0, *) {
      NEHotspotNetwork.fetchCurrent { [weak self] network in
        if let ssid = network?.ssid, Self.looksLikeInsta360(ssid: ssid) {
          DispatchQueue.main.async {
            result([[
              "id": Self.cameraHost,
              "name": ssid,
              "model": Self.modelHint(fromSsid: ssid),
            ]])
          }
        } else {
          self?.probeCamera(result: result)
        }
      }
    } else {
      probeCamera(result: result)
    }
  }

  private static func looksLikeInsta360(ssid: String) -> Bool {
    let s = ssid.uppercased()
    return s.hasPrefix("X3") || s.hasPrefix("X4") || s.hasPrefix("X5")
      || s.hasPrefix("ONE") || s.hasPrefix("INSTA360")
  }

  private static func modelHint(fromSsid ssid: String) -> String {
    let s = ssid.uppercased()
    if s.hasPrefix("X5") { return "Insta360 X5" }
    if s.hasPrefix("X4") { return "Insta360 X4" }
    if s.hasPrefix("X3") { return "Insta360 X3" }
    if s.hasPrefix("ONE") { return "Insta360 ONE series" }
    return "Insta360"
  }

  /// 2) Fallback: 1-second TCP reachability probe of the camera's documented
  /// control endpoint 192.168.42.1:6666 using Network.framework.
  private func probeCamera(result: @escaping FlutterResult) {
    let connection = NWConnection(
      host: NWEndpoint.Host(Self.cameraHost),
      port: NWEndpoint.Port(rawValue: Self.cameraPort)!,
      using: .tcp)

    var finished = false
    let finish: ([[String: String]]) -> Void = { cameras in
      DispatchQueue.main.async {
        guard !finished else { return }
        finished = true
        connection.cancel()
        result(cameras)
      }
    }

    connection.stateUpdateHandler = { state in
      switch state {
      case .ready:
        finish([[
          "id": Self.cameraHost,
          "name": "Insta360 (WiFi)",
          "model": "detected",
        ]])
      case .failed, .cancelled:
        finish([])
      default:
        break
      }
    }
    connection.start(queue: .global(qos: .userInitiated))
    DispatchQueue.global().asyncAfter(deadline: .now() + 1.0) {
      finish([])
    }
  }

  // MARK: connect

  private func connect(cameraId: String, result: @escaping FlutterResult) {
    guard Self.sdkLinked else {
      result(Self.sdkNotLinkedError())
      return
    }
    // SDK LINKAGE POINT 2 — connection.
    // With INSCameraSDK linked, replace this dynamic dispatch with:
    //
    //   INSCameraManager.socket().setup()
    //   // then KVO-observe INSCameraManager.socket().cameraState and call
    //   // result(nil) once it reaches INSCameraStateConnected, or a
    //   // FlutterError on INSCameraStateFound->timeout.
    //
    if let managerClass = NSClassFromString("INSCameraManager") as? NSObject.Type {
      let socketSel = NSSelectorFromString("socketManager")
      if managerClass.responds(to: socketSel),
        let manager = managerClass.perform(socketSel)?.takeUnretainedValue() as? NSObject {
        let setupSel = NSSelectorFromString("setup")
        if manager.responds(to: setupSel) {
          manager.perform(setupSel)
          result(nil)
          return
        }
      }
    }
    result(FlutterError(
      code: "SDK_CALL_FAILED",
      message: "INSCameraSDK is present but its API did not respond as expected. "
        + "Complete SDK LINKAGE POINT 2 in Insta360CapturePlugin.swift against "
        + "the real SDK headers.",
      details: nil))
  }

  // MARK: capturePanorama

  private func capturePanorama(result: @escaping FlutterResult) {
    guard Self.sdkLinked else {
      result(Self.sdkNotLinkedError())
      return
    }
    // SDK LINKAGE POINT 3 — capture + download.
    // With INSCameraSDK linked, replace this with the real capture flow:
    //
    //   let options = INSTakePictureOptions()
    //   INSCameraManager.shared().commandManager
    //     .takePicture(with: options) { error, photoInfo in
    //       guard error == nil, let uri = photoInfo?.uri else { ... }
    //       // Download the stitched equirect JPEG over the camera's HTTP
    //       // endpoint (http://192.168.42.1:80 + uri) to a temp file and
    //       // result(localPath).
    //     }
    //
    // Taking a picture requires the SDK's typed option/response classes, which
    // cannot be reconstructed through the ObjC runtime alone, so a linked
    // build must fill this in against the real headers.
    result(FlutterError(
      code: "SDK_CALL_FAILED",
      message: "INSCameraSDK is linked, but capturePanorama requires completing "
        + "SDK LINKAGE POINT 3 in Insta360CapturePlugin.swift against the real "
        + "SDK headers (INSTakePictureOptions / commandManager.takePicture).",
      details: nil))
  }
}
