/** Guided capture session types — mirrors backend capture schemas. */

export type CaptureSessionStatus =
  | 'draft'
  | 'capturing'
  | 'review'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'cancelled';

export type CaptureMode = 'multi_yaw' | 'equirect' | 'video_spin';
export type CaptureTrackingBackend = 'none' | 'imu_pdr' | 'arkit' | 'arcore';

export interface CaptureWaypointPlan {
  id: string;
  index: number;
  label?: string | null;
  x_m?: number;
  y_m?: number;
  z_m?: number;
  kind?: string;
}

export interface CaptureRoomPlan {
  id: string;
  label: string;
  size?: string;
  order_index?: number;
  waypoints: CaptureWaypointPlan[];
}

export interface CapturePlan {
  template?: string | null;
  rooms: CaptureRoomPlan[];
}

export interface CaptureDeviceInfo {
  platform?: string;
  model?: string;
  os_version?: string;
  app_version?: string;
}

export interface CapturePose {
  position_m?: { x: number; y: number; z: number };
  position_frame?: string;
  yaw_deg?: number;
  pitch_deg?: number;
  roll_deg?: number;
  tracking_quality?: string;
  tracking_backend?: CaptureTrackingBackend;
}

export interface CaptureFrameMetadata {
  capture_mode?: CaptureMode;
  timestamp_iso?: string;
  device?: CaptureDeviceInfo;
  pose?: CapturePose;
  camera?: {
    fov_h_deg?: number;
    resolution?: number[];
  };
  quality?: {
    blur_score?: number;
    exposure_ok?: boolean;
  };
}

export interface CaptureFrame {
  id: string;
  session_id: string;
  room_id: string;
  room_label?: string | null;
  waypoint_id: string;
  waypoint_index: number;
  frame_index: number;
  media_file_id?: string | null;
  image_url?: string | null;
  metadata?: CaptureFrameMetadata | null;
  created_at: string;
}

export interface CaptureSession {
  id: string;
  user_id: number;
  title: string;
  description?: string | null;
  status: CaptureSessionStatus;
  progress: number;
  plan?: CapturePlan | Record<string, unknown> | null;
  device_info?: CaptureDeviceInfo | Record<string, unknown> | null;
  tour_id?: string | null;
  error_message?: string | null;
  frame_count: number;
  created_at: string;
  updated_at: string;
  frames?: CaptureFrame[];
}

export interface CaptureSessionList {
  items: CaptureSession[];
  total: number;
}

export interface CaptureSessionCreateInput {
  title: string;
  description?: string;
  plan?: CapturePlan;
  device_info?: CaptureDeviceInfo;
}

export interface CaptureSessionUpdateInput {
  title?: string;
  description?: string;
  status?: CaptureSessionStatus;
  progress?: number;
  plan?: CapturePlan;
  device_info?: CaptureDeviceInfo;
  error_message?: string;
}

export interface CaptureFrameCreateInput {
  room_id: string;
  room_label?: string;
  waypoint_id: string;
  waypoint_index?: number;
  frame_index?: number;
  media_file_id?: string;
  image_url?: string;
  metadata?: CaptureFrameMetadata;
}

export interface CaptureSessionStatusResponse {
  id: string;
  status: CaptureSessionStatus;
  progress: number;
  tour_id?: string | null;
  error_message?: string | null;
  frame_count: number;
  message?: string | null;
}
