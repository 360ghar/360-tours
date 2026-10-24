/**
 * Guided capture session types. Aliases of the generated OpenAPI components
 * (`src/lib/api/schema.gen.ts`); nothing here is declared by hand.
 */
import type { components } from '@/lib/api/schema.gen';

type Schemas = components['schemas'];

/**
 * Lifecycle: draft, capturing, review, uploading, processing, ready.
 * `ready`, `failed` and `cancelled` are terminal; nothing leaves them.
 */
export type CaptureSessionStatus = Schemas['CaptureSessionStatus'];

/** States a PATCH may leave: the terminal states are final. */
export type CaptureTerminalStatus = Extract<CaptureSessionStatus, 'ready' | 'failed' | 'cancelled'>;

export type CaptureMode = NonNullable<Schemas['CaptureFrameMetadata']['capture_mode']>;
export type CaptureTrackingBackend = NonNullable<Schemas['CapturePose']['tracking_backend']>;
export type CaptureDevicePlatform = Schemas['DevicePlatform'];

export type CaptureWaypointPlan = Schemas['CaptureWaypointPlan'];
export type CaptureRoomPlan = Schemas['CaptureRoomPlan'];
export type CapturePlan = Schemas['CapturePlan'];
export type CaptureDeviceInfo = Schemas['CaptureDeviceInfo'];
export type CapturePose = Schemas['CapturePose'];
export type CaptureFrameMetadata = Schemas['CaptureFrameMetadata'];

export type CaptureFrame = Schemas['CaptureFrameResponse'];
export type CaptureSession = Schemas['CaptureSessionResponse'];
export type CaptureSessionDetail = Schemas['CaptureSessionDetail'];

export type CaptureSessionCreateInput = Schemas['CaptureSessionCreate'];
export type CaptureSessionUpdateInput = Schemas['CaptureSessionUpdate'];
export type CaptureFrameCreateInput = Schemas['CaptureFrameCreate'];
