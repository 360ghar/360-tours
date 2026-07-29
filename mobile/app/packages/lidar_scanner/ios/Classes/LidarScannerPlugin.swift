import Flutter
import UIKit
import ARKit

#if canImport(RoomPlan)
import RoomPlan
#endif

#if canImport(RealityKit)
import RealityKit
#endif

// MARK: - Plugin

public class LidarScannerPlugin: NSObject, FlutterPlugin, FlutterStreamHandler {
  private var eventSink: FlutterEventSink?

  // Scan state machine. Typed `UIViewController?` so the class itself needs no
  // iOS 16 availability; the concrete type is RoomScanViewController.
  private var scanViewController: UIViewController?
  private var isScanning = false
  private var isProcessing = false
  private var pendingStopResult: FlutterResult?
  private var finishedResult: [String: String]?
  private var finishedError: FlutterError?

  // Photogrammetry session kept alive while processing (typed Any to avoid
  // an iOS 17 stored-property availability requirement).
  private var photogrammetrySession: Any?

  public static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: "tours360/lidar", binaryMessenger: registrar.messenger())
    let instance = LidarScannerPlugin()
    registrar.addMethodCallDelegate(instance, channel: channel)
    let events = FlutterEventChannel(
      name: "tours360/lidar/events", binaryMessenger: registrar.messenger())
    events.setStreamHandler(instance)
  }

  public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "checkCapability":
      checkCapability(result: result)
    case "startScan":
      startScan(result: result)
    case "stopScan":
      stopScan(result: result)
    case "buildPhotogrammetry":
      let args = call.arguments as? [String: Any]
      let paths = args?["imagePaths"] as? [String] ?? []
      buildPhotogrammetry(imagePaths: paths, result: result)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  // MARK: FlutterStreamHandler

  public func onListen(
    withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink
  ) -> FlutterError? {
    eventSink = events
    return nil
  }

  public func onCancel(withArguments arguments: Any?) -> FlutterError? {
    eventSink = nil
    return nil
  }

  private func emit(_ event: [String: Any]) {
    DispatchQueue.main.async { [weak self] in
      self?.eventSink?(event)
    }
  }

  // MARK: checkCapability

  private func checkCapability(result: @escaping FlutterResult) {
    var supported = false
    if #available(iOS 13.4, *) {
      supported = ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
    }

    var roomPlanAvailable = false
    var reason: String?

    #if canImport(RoomPlan)
    if #available(iOS 16.0, *) {
      roomPlanAvailable = RoomCaptureSession.isSupported
      if !roomPlanAvailable {
        reason = supported
          ? "RoomPlan is not supported on this device."
          : "This device has no LiDAR scanner. Room scanning requires an iPhone/iPad Pro with LiDAR."
      }
    } else {
      reason = "RoomPlan requires iOS 16 or newer."
    }
    #else
    reason = "RoomPlan framework is unavailable in this build."
    #endif

    if !supported && reason == nil {
      reason = "This device has no LiDAR scanner."
    }

    var payload: [String: Any] = [
      "supported": supported,
      "roomPlanAvailable": roomPlanAvailable,
    ]
    if let reason = reason { payload["reason"] = reason }
    result(payload)
  }

  // MARK: startScan

  private func startScan(result: @escaping FlutterResult) {
    if isScanning || isProcessing {
      result(FlutterError(
        code: "ALREADY_SCANNING",
        message: "A room scan is already in progress.",
        details: nil))
      return
    }
    finishedResult = nil

    #if canImport(RoomPlan)
    if #available(iOS 16.0, *) {
      guard RoomCaptureSession.isSupported else {
        result(FlutterError(
          code: "UNSUPPORTED",
          message: "RoomPlan is not supported on this device (LiDAR required).",
          details: nil))
        return
      }
      let vc = RoomScanViewController()
      vc.onEvent = { [weak self] event in self?.emit(event) }
      vc.onCaptureStopped = { [weak self] in
        // Native Done button (or any session stop) — move to processing.
        guard let self = self, self.isScanning else { return }
        self.isScanning = false
        self.isProcessing = true
        self.emit(["phase": "processing", "progress": 1.0, "wallCount": 0])
      }
      vc.onEnded = { [weak self] outcome in
        self?.handleScanEnded(outcome)
      }
      scanViewController = vc

      DispatchQueue.main.async { [weak self] in
        guard let self = self, let top = Self.topViewController() else {
          self?.scanViewController = nil
          result(FlutterError(
            code: "NO_VIEW_CONTROLLER",
            message: "Could not find a view controller to present the scanner.",
            details: nil))
          return
        }
        vc.modalPresentationStyle = .fullScreen
        top.present(vc, animated: true)
        self.isScanning = true
        result(nil)
      }
      return
    }
    #endif

    result(FlutterError(
      code: "UNSUPPORTED",
      message: "Room scanning requires iOS 16+ with RoomPlan support.",
      details: nil))
  }

  // MARK: stopScan

  private func stopScan(result: @escaping FlutterResult) {
    if pendingStopResult != nil {
      result(FlutterError(
        code: "STOP_IN_PROGRESS",
        message: "A stop is already being processed",
        details: nil))
      return
    }
    if isScanning {
      pendingStopResult = result
      isScanning = false
      isProcessing = true
      emit(["phase": "processing", "progress": 1.0, "wallCount": 0])
      #if canImport(RoomPlan)
      if #available(iOS 16.0, *) {
        (scanViewController as? RoomScanViewController)?.finishCapture()
      }
      #endif
      return
    }
    if isProcessing {
      // Native Done already ended the capture; wait for processing to finish.
      pendingStopResult = result
      return
    }
    if let finished = finishedResult {
      finishedResult = nil
      result(finished)
      return
    }
    if let error = finishedError {
      finishedError = nil
      result(error)
      return
    }
    result(FlutterError(
      code: "NOT_SCANNING",
      message: "No room scan is in progress.",
      details: nil))
  }

  private func handleScanEnded(_ outcome: Result<(usdzPath: String, roomJsonPath: String), Error>) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.isScanning = false
      self.isProcessing = false
      self.scanViewController?.dismiss(animated: true)
      self.scanViewController = nil

      switch outcome {
      case .success(let paths):
        let payload = ["usdzPath": paths.usdzPath, "roomJsonPath": paths.roomJsonPath]
        self.emit(["phase": "finished", "progress": 1.0, "wallCount": 0])
        if let pending = self.pendingStopResult {
          self.pendingStopResult = nil
          pending(payload)
        } else {
          // Ended via the native Done button; hand the result to the next
          // stopScan call from Flutter.
          self.finishedResult = payload
        }
      case .failure(let error):
        let flutterError = FlutterError(
          code: "SCAN_FAILED",
          message: "Room scan failed: \(error.localizedDescription)",
          details: nil)
        if let pending = self.pendingStopResult {
          self.pendingStopResult = nil
          pending(flutterError)
        } else {
          self.finishedError = flutterError
        }
        self.emit(["phase": "error", "message": error.localizedDescription])
      }
    }
  }

  // MARK: Photogrammetry

  private func buildPhotogrammetry(imagePaths: [String], result: @escaping FlutterResult) {
    #if canImport(RealityKit)
    if #available(iOS 17.0, *) {
      guard PhotogrammetrySession.isSupported else {
        result(FlutterError(
          code: "PHOTOGRAMMETRY_UNSUPPORTED",
          message: "Object Capture photogrammetry is not supported on this device (requires an A14+ chip and iOS 17).",
          details: nil))
        return
      }
      guard !imagePaths.isEmpty else {
        result(FlutterError(
          code: "NO_IMAGES", message: "imagePaths is empty.", details: nil))
        return
      }

      let fm = FileManager.default
      let baseDir = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent("photogrammetry_\(Int(Date().timeIntervalSince1970))")
      let inputDir = baseDir.appendingPathComponent("input")
      let outputURL = baseDir.appendingPathComponent("model.usdz")

      do {
        try fm.createDirectory(at: inputDir, withIntermediateDirectories: true)
        // PhotogrammetrySession takes a directory: stage the images into one.
        for (i, path) in imagePaths.enumerated() {
          let src = URL(fileURLWithPath: path)
          let dst = inputDir.appendingPathComponent(
            String(format: "img_%04d.%@", i, src.pathExtension.isEmpty ? "jpg" : src.pathExtension))
          try fm.copyItem(at: src, to: dst)
        }

        let session = try PhotogrammetrySession(
          input: inputDir, configuration: PhotogrammetrySession.Configuration())
        photogrammetrySession = session

        // Guard against double-completion of the Flutter result.
        var completed = false
        let complete: (Any) -> Void = { [weak self] value in
          DispatchQueue.main.async {
            guard !completed else { return }
            completed = true
            self?.photogrammetrySession = nil
            try? FileManager.default.removeItem(at: inputDir)
            result(value)
          }
        }

        Task { [weak self] in
          do {
            for try await output in session.outputs {
              switch output {
              case .requestProgress(_, let fraction):
                self?.emit(["phase": "processing", "progress": fraction, "wallCount": 0,
                            "instruction": "Building 3D model…"])
              case .requestComplete(_, let request):
                if case .modelFile(let url) = request {
                  self?.emit(["phase": "finished", "progress": 1.0, "wallCount": 0])
                  complete(["usdzPath": url.path])
                }
              case .requestError(_, let error):
                complete(FlutterError(
                  code: "PHOTOGRAMMETRY_FAILED",
                  message: "Photogrammetry failed: \(error.localizedDescription)",
                  details: nil))
              case .processingCancelled:
                complete(FlutterError(
                  code: "PHOTOGRAMMETRY_CANCELLED",
                  message: "Photogrammetry processing was cancelled.",
                  details: nil))
              default:
                break
              }
            }
            complete(FlutterError(
              code: "PHOTOGRAMMETRY_FAILED",
              message: "Session ended without producing a model",
              details: nil))
          } catch {
            complete(FlutterError(
              code: "PHOTOGRAMMETRY_FAILED",
              message: "Photogrammetry output stream failed: \(error.localizedDescription)",
              details: nil))
          }
        }

        do {
          try session.process(requests: [
            .modelFile(url: outputURL, detail: .reduced)
          ])
        } catch {
          complete(FlutterError(
            code: "PHOTOGRAMMETRY_FAILED",
            message: "Could not start photogrammetry: \(error.localizedDescription)",
            details: nil))
        }
      } catch {
        photogrammetrySession = nil
        result(FlutterError(
          code: "PHOTOGRAMMETRY_FAILED",
          message: "Could not start photogrammetry: \(error.localizedDescription)",
          details: nil))
      }
      return
    }
    #endif

    result(FlutterError(
      code: "PHOTOGRAMMETRY_UNSUPPORTED",
      message: "Photogrammetry requires iOS 17+ with RealityKit Object Capture.",
      details: nil))
  }

  // MARK: Helpers

  private static func topViewController() -> UIViewController? {
    let keyWindow: UIWindow?
    if #available(iOS 13.0, *) {
      keyWindow = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap { $0.windows }
        .first { $0.isKeyWindow }
    } else {
      keyWindow = UIApplication.shared.keyWindow
    }
    var top = keyWindow?.rootViewController
    while let presented = top?.presentedViewController {
      top = presented
    }
    return top
  }
}

// MARK: - RoomScanViewController

#if canImport(RoomPlan)
@available(iOS 16.0, *)
final class RoomScanViewController: UIViewController, RoomCaptureSessionDelegate,
  RoomCaptureViewDelegate {

  var onEvent: (([String: Any]) -> Void)?
  var onCaptureStopped: (() -> Void)?
  var onEnded: ((Result<(usdzPath: String, roomJsonPath: String), Error>) -> Void)?

  private var captureView: RoomCaptureView!
  private let instructionLabel = UILabel()
  private var hasStopped = false
  private var hasEnded = false
  private var hasRun = false

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black

    captureView = RoomCaptureView(frame: view.bounds)
    captureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    captureView.captureSession.delegate = self
    captureView.delegate = self
    view.addSubview(captureView)

    // Dark overlay strip with the live instruction text.
    let overlay = UIView()
    overlay.backgroundColor = UIColor.black.withAlphaComponent(0.55)
    overlay.layer.cornerRadius = 12
    overlay.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(overlay)

    instructionLabel.text = "Move your device slowly around the room"
    instructionLabel.textColor = .white
    instructionLabel.font = .systemFont(ofSize: 15, weight: .medium)
    instructionLabel.numberOfLines = 2
    instructionLabel.textAlignment = .center
    instructionLabel.translatesAutoresizingMaskIntoConstraints = false
    overlay.addSubview(instructionLabel)

    let doneButton = UIButton(type: .system)
    doneButton.setTitle("Done", for: .normal)
    doneButton.setTitleColor(.white, for: .normal)
    doneButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
    doneButton.backgroundColor = UIColor.black.withAlphaComponent(0.55)
    doneButton.layer.cornerRadius = 22
    doneButton.contentEdgeInsets = UIEdgeInsets(top: 10, left: 28, bottom: 10, right: 28)
    doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
    doneButton.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(doneButton)

    NSLayoutConstraint.activate([
      overlay.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
      overlay.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      overlay.leadingAnchor.constraint(
        greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
      instructionLabel.topAnchor.constraint(equalTo: overlay.topAnchor, constant: 10),
      instructionLabel.bottomAnchor.constraint(equalTo: overlay.bottomAnchor, constant: -10),
      instructionLabel.leadingAnchor.constraint(equalTo: overlay.leadingAnchor, constant: 16),
      instructionLabel.trailingAnchor.constraint(equalTo: overlay.trailingAnchor, constant: -16),
      doneButton.bottomAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -20),
      doneButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
    ])
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    hasRun = true
    captureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
  }

  @objc private func doneTapped() {
    finishCapture()
  }

  /// Ends the capture (native Done button or Flutter stopScan). Idempotent.
  func finishCapture() {
    guard !hasStopped else { return }
    hasStopped = true
    onCaptureStopped?()
    guard hasRun else {
      hasEnded = true
      onEnded?(.failure(NSError(
        domain: "LidarScannerPlugin",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey: "Scan stopped before the session started"])))
      return
    }
    captureView.captureSession.stop()
  }

  // MARK: RoomCaptureViewDelegate
  // Suppress RoomCaptureView's built-in post-processing presentation; the
  // plugin runs its own RoomBuilder pass and dismisses this controller.
  func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
    return false
  }

  // MARK: RoomCaptureSessionDelegate

  func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
    let wallCount = room.walls.count
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      var event: [String: Any] = [
        "phase": "scanning",
        "progress": min(1.0, Double(wallCount) / 8.0),
        "wallCount": wallCount,
      ]
      if let text = self.instructionLabel.text { event["instruction"] = text }
      self.onEvent?(event)
    }
  }

  func captureSession(
    _ session: RoomCaptureSession, didProvide instruction: RoomCaptureSession.Instruction
  ) {
    let text = Self.humanInstruction(instruction)
    DispatchQueue.main.async { [weak self] in
      self?.instructionLabel.text = text
    }
    onEvent?([
      "phase": "scanning",
      "progress": 0.0,
      "wallCount": 0,
      "instruction": text,
    ])
  }

  func captureSession(
    _ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?
  ) {
    guard !hasEnded else { return }
    hasEnded = true

    if let error = error {
      onEnded?(.failure(error))
      return
    }

    Task { [weak self] in
      do {
        let builder = RoomBuilder(options: [.beautifyObjects])
        let capturedRoom = try await builder.capturedRoom(from: data)

        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
          .appendingPathComponent("lidar_\(Int(Date().timeIntervalSince1970))")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        let usdzURL = dir.appendingPathComponent("room.usdz")
        let jsonURL = dir.appendingPathComponent("room.json")
        try capturedRoom.export(to: usdzURL)
        try JSONEncoder().encode(capturedRoom).write(to: jsonURL)

        self?.onEnded?(.success((usdzPath: usdzURL.path, roomJsonPath: jsonURL.path)))
      } catch {
        self?.onEnded?(.failure(error))
      }
    }
  }

  private static func humanInstruction(_ instruction: RoomCaptureSession.Instruction) -> String {
    switch instruction {
    case .moveCloseToWall: return "Move closer to the wall"
    case .moveAwayFromWall: return "Move away from the wall"
    case .slowDown: return "Slow down"
    case .turnOnLight: return "Turn on more lights"
    case .lowTexture: return "Point at a more detailed area"
    case .normal: return "Keep scanning"
    @unknown default: return "Keep scanning"
    }
  }
}
#endif
