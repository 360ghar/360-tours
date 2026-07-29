Pod::Spec.new do |s|
  s.name             = 'lidar_scanner'
  s.version          = '0.1.0'
  s.summary          = 'RoomPlan/ARKit LiDAR room scanning plugin for 360 Tours.'
  s.description      = 'Wraps Apple RoomPlan (RoomCaptureSession) and RealityKit PhotogrammetrySession for the Tours360 Flutter app.'
  s.homepage         = 'https://360ghar.com'
  s.license          = { :type => 'MIT' }
  s.author           = { '360Ghar' => 'dev@360ghar.com' }
  s.source           = { :path => '.' }
  s.source_files     = 'Classes/**/*'
  s.dependency 'Flutter'
  s.platform         = :ios, '13.0'
  s.swift_version    = '5.0'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
