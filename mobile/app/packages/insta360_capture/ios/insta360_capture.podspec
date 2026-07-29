Pod::Spec.new do |s|
  s.name             = 'insta360_capture'
  s.version          = '0.1.0'
  s.summary          = 'Insta360 camera connection plugin for 360 Tours.'
  s.description      = 'Camera discovery over the Insta360 WiFi hotspot plus INSCameraSDK linkage points for connect/capture.'
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
