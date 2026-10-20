import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Circle,
  Loader2,
  Smartphone,
  Upload,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Progress,
} from '@/components/ui';
import { captureApi, toursApi, uploadApi } from '@/api';
import { ROUTES, DEFAULT_TOUR_SETTINGS } from '@/constants';
import type {
  CaptureFrame,
  CapturePlan,
  CaptureSession,
  CaptureSessionStatus,
} from '@/types/capture';
import { confirm, useAuthStore } from '@/stores';
import { cn } from '@/utils';
import {
  readAccountItem,
  removeAccountItem,
  writeAccountItem,
} from '@/lib/accountStorage';
import { API_LIMITS } from '@/lib/api/limits.gen';

/** Discrete yaw targets for multi-yaw capture at one standing position. */
const YAW_TARGETS_DEG = [0, 45, 90, 135, 180, 225, 270, 315] as const;

type Phase = 'setup' | 'camera' | 'review' | 'uploading' | 'done';

interface LocalFrame {
  id: string;
  /** Encoded image data; absent only for server-restored frames (already uploaded). */
  blob?: Blob;
  previewUrl: string;
  roomId: string;
  roomLabel: string;
  waypointId: string;
  waypointIndex: number;
  frameIndex: number;
  yawDeg: number;
  pitchDeg: number | null;
  width: number;
  height: number;
  capturedAt: string;
  uploadStatus: 'pending' | 'uploading' | 'done' | 'error';
  uploadError?: string;
  publicUrl?: string;
  /** Id of the capture session this frame is registered in. A new session needs a new registration. */
  registeredIn?: string;
}

/**
 * Captured frames are persisted to sessionStorage so a reload mid-capture —
 * mobile Safari tab restore, accidental refresh — recovers the photos instead
 * of losing them. The key carries the account id and a schema version, and
 * sign-out removes it (see `lib/accountStorage`). The backend only learns about
 * frames at upload time, so the session detail cannot list mid-capture frames.
 */

/** `ready`, `failed` and `cancelled`: nothing leaves these states, the session cannot be reused. */
const TERMINAL_STATUSES: ReadonlySet<CaptureSessionStatus> = new Set<CaptureSessionStatus>([
  'ready',
  'failed',
  'cancelled',
]);

function isTerminal(session: CaptureSession | null): boolean {
  return session !== null && TERMINAL_STATUSES.has(session.status);
}

interface PersistedFrame {
  id: string;
  yawDeg: number;
  pitchDeg: number | null;
  roomId: string;
  roomLabel: string;
  waypointId: string;
  waypointIndex: number;
  frameIndex: number;
  width: number;
  height: number;
  capturedAt: string;
  dataUrl: string;
  uploadStatus: LocalFrame['uploadStatus'];
  uploadError?: string;
  publicUrl?: string;
  registeredIn?: string;
}

/** Fields of a registered frame's `metadata` that the page reads back. */
interface FrameMetaView {
  yawDeg?: number;
  pitchDeg?: number;
  resolution?: [number, number];
}

function readFrameMetadata(metadata: unknown): FrameMetaView {
  if (typeof metadata !== 'object' || metadata === null) return {};
  const view: FrameMetaView = {};
  const pose = 'pose' in metadata ? metadata.pose : undefined;
  if (typeof pose === 'object' && pose !== null) {
    if ('yaw_deg' in pose && typeof pose.yaw_deg === 'number') view.yawDeg = pose.yaw_deg;
    if ('pitch_deg' in pose && typeof pose.pitch_deg === 'number') view.pitchDeg = pose.pitch_deg;
  }
  const camera = 'camera' in metadata ? metadata.camera : undefined;
  if (typeof camera === 'object' && camera !== null && 'resolution' in camera) {
    const resolution = camera.resolution;
    if (
      Array.isArray(resolution) &&
      typeof resolution[0] === 'number' &&
      typeof resolution[1] === 'number'
    ) {
      view.resolution = [resolution[0], resolution[1]];
    }
  }
  return view;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read captured frame'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/^data:([^;]+);/)?.[1] ?? 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function makeId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** iOS Safari requires this to be called from a user gesture before `deviceorientation` fires. */
async function requestOrientationPermission(): Promise<void> {
  type RequestableDeviceOrientationEvent = {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  if (typeof DeviceOrientationEvent === 'undefined') return;
  const ctor = DeviceOrientationEvent as unknown as RequestableDeviceOrientationEvent;
  if (typeof ctor.requestPermission !== 'function') return;
  try {
    await ctor.requestPermission();
  } catch {
    // Ignore — the level hint just won't be available.
  }
}

function defaultPlan(roomLabel: string): CapturePlan {
  return {
    template: 'custom',
    rooms: [
      {
        id: 'room-1',
        label: roomLabel || 'Room 1',
        size: 'medium',
        order_index: 0,
        waypoints: [
          {
            id: 'wp-center',
            index: 0,
            label: 'Center',
            kind: 'center',
          },
        ],
      },
    ],
  };
}

/** Device info sent with a session and with each frame. `web` is a valid platform. */
const WEB_DEVICE = { platform: 'web', app_version: 'web-capture-0.1' } as const;

export function GuidedCapturePage() {
  const navigate = useNavigate();
  const { sessionId: routeSessionId } = useParams<{ sessionId?: string }>();
  const userId = useAuthStore(s => s.user?.id);

  const [phase, setPhase] = useState<Phase>('setup');
  const [title, setTitle] = useState('Property walkthrough');
  const [roomLabel, setRoomLabel] = useState('Living Room');
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const [frames, setFrames] = useState<LocalFrame[]>([]);
  const [yawIndex, setYawIndex] = useState(0);
  const [pitchDeg, setPitchDeg] = useState<number | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const [uploadProgress, setUploadProgress] = useState(0);
  const [createdTourId, setCreatedTourId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // A session this page created itself. Opening its route must not reload it: the
  // resume effect would replace the frames held in memory with the (empty) stored ones.
  const createdHereRef = useRef<string | null>(null);

  const targetYaw = YAW_TARGETS_DEG[yawIndex] ?? 0;
  const capturedYaws = new Set(frames.map(f => f.yawDeg));
  const allYawsDone = YAW_TARGETS_DEG.every(y => capturedYaws.has(y));

  /** Move the session along the state machine and mirror the server row. */
  const moveSession = useCallback(
    async (id: string, status: CaptureSessionStatus): Promise<CaptureSession> => {
      const updated = await captureApi.moveSession(id, status);
      setSession(updated);
      return updated;
    },
    []
  );

  /**
   * Record a failure on the server (`failed` with the reason). Best effort: the
   * user-facing error is already on screen, and a session already in a terminal
   * state cannot change.
   */
  const failSession = useCallback(async (id: string, message: string) => {
    try {
      setSession(await captureApi.failSession(id, message));
    } catch {
      // The session may already be terminal or unreachable; nothing more to do.
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera is not supported in this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not access the camera. Check browser permissions.';
      setCameraError(msg);
      setCameraReady(false);
    }
  }, []);

  // Device orientation for level hint (optional; many desktops lack this)
  useEffect(() => {
    if (phase !== 'camera') return;

    const onOrient = (e: DeviceOrientationEvent) => {
      // beta ≈ front-back tilt; treat as pitch-ish for phone upright
      if (typeof e.beta === 'number') {
        // When phone is held upright, beta ~90; pitch relative to upright ≈ beta - 90
        setPitchDeg(e.beta - 90);
      }
    };

    window.addEventListener('deviceorientation', onOrient);
    return () => window.removeEventListener('deviceorientation', onOrient);
  }, [phase]);

  useEffect(() => {
    if (phase === 'camera') {
      void startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [phase, startCamera, stopCamera]);

  // Resume existing session from route: restore session metadata, then rebuild
  // the frames list from the sessionStorage fallback (mid-capture frames are
  // only local until upload) and from any server-registered frames (partial
  // upload retries), yaw-sorted so the capture UI picks up where it left off.
  useEffect(() => {
    if (!routeSessionId || routeSessionId === createdHereRef.current) return;
    let cancelled = false;

    const restoreFromSessionStorage = async (): Promise<LocalFrame[]> => {
      const stored = readAccountItem('captureFrames', userId, routeSessionId);
      if (!stored) return [];
      try {
        const persisted = JSON.parse(stored) as PersistedFrame[];
        return await Promise.all(
          persisted.map(async p => {
            const blob = dataUrlToBlob(p.dataUrl);
            const previewUrl = URL.createObjectURL(blob);
            return {
              id: p.id,
              blob,
              previewUrl,
              roomId: p.roomId,
              roomLabel: p.roomLabel,
              waypointId: p.waypointId,
              waypointIndex: p.waypointIndex,
              frameIndex: p.frameIndex,
              yawDeg: p.yawDeg,
              pitchDeg: p.pitchDeg,
              width: p.width,
              height: p.height,
              capturedAt: p.capturedAt,
              uploadStatus: p.uploadStatus,
              uploadError: p.uploadError,
              publicUrl: p.publicUrl,
              registeredIn: p.registeredIn,
            } satisfies LocalFrame;
          })
        );
      } catch {
        // Corrupt payload — fall through to a session with no restored frames.
        return [];
      }
    };

    const mergeServerFrames = (
      local: LocalFrame[],
      serverFrames: CaptureFrame[],
      sessionIdForFrames: string
    ): LocalFrame[] => {
      const serverByYaw = new Map<number, { frame: CaptureFrame; meta: FrameMetaView }>();
      serverFrames.forEach(f => {
        const meta = readFrameMetadata(f.metadata);
        if (typeof meta.yawDeg === 'number' && f.image_url) {
          serverByYaw.set(meta.yawDeg, { frame: f, meta });
        }
      });
      if (serverByYaw.size === 0) return local;

      const next = local.map(lf => {
        const server = serverByYaw.get(lf.yawDeg);
        if (!server || !server.frame.image_url) return lf;
        // Already registered server-side — skip re-upload on the next run.
        return {
          ...lf,
          uploadStatus: 'done' as const,
          publicUrl: server.frame.image_url,
          registeredIn: sessionIdForFrames,
        };
      });

      const localYaws = new Set(next.map(lf => lf.yawDeg));
      serverByYaw.forEach(({ frame, meta }, yaw) => {
        if (localYaws.has(yaw) || !frame.image_url) return;
        next.push({
          id: `server-${frame.id}`,
          blob: undefined,
          previewUrl: frame.image_url,
          roomId: frame.room_id,
          roomLabel: frame.room_label ?? 'Room 1',
          waypointId: frame.waypoint_id,
          waypointIndex: frame.waypoint_index,
          frameIndex: frame.frame_index,
          yawDeg: yaw,
          pitchDeg: meta.pitchDeg ?? null,
          width: meta.resolution?.[0] ?? 0,
          height: meta.resolution?.[1] ?? 0,
          capturedAt: frame.created_at,
          uploadStatus: 'done' as const,
          publicUrl: frame.image_url,
          registeredIn: sessionIdForFrames,
        });
      });
      return next.sort((a, b) => a.yawDeg - b.yawDeg);
    };

    (async () => {
      try {
        const s = await captureApi.getSession(routeSessionId);
        if (cancelled) return;
        setSession(s);
        setTitle(s.title);

        const restored = await restoreFromSessionStorage();
        if (cancelled) {
          restored.forEach(f => URL.revokeObjectURL(f.previewUrl));
          return;
        }

        const merged = mergeServerFrames(restored, s.frames ?? [], s.id);
        setFrames(merged);

        // Point the camera UI at the first still-missing yaw.
        const capturedYaws = new Set(merged.map(f => f.yawDeg));
        const firstMissing = YAW_TARGETS_DEG.findIndex(y => !capturedYaws.has(y));
        setYawIndex(firstMissing >= 0 ? firstMissing : 0);

        if (TERMINAL_STATUSES.has(s.status)) {
          // A session that ended cannot be reused. Frames still on this device are
          // kept for review: uploading them opens a new session.
          if (merged.length > 0) {
            setPhase('review');
            setError(`This capture session is ${s.status}. Uploading starts a new session.`);
          } else {
            setError(`This capture session is ${s.status}. Start a new capture.`);
          }
        } else if (s.status === 'review' || s.status === 'uploading') {
          setPhase('review');
          if (s.status === 'uploading') await moveSession(s.id, 'review');
        } else {
          // draft or capturing
          if (s.status === 'draft') await moveSession(s.id, 'capturing');
          setPhase('camera');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load session');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeSessionId, userId, moveSession]);

  // Keep a ref in sync so the unmount cleanup below revokes the CURRENT
  // frames, not whatever `frames` was when this effect first ran.
  const framesRef = useRef<LocalFrame[]>(frames);
  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  // Persist captured frames to sessionStorage (keyed by session id) whenever
  // they change, so a reload mid-capture restores them. Best-effort: quota
  // exhaustion or a failed encode just means frames stay in memory only.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const persisted: PersistedFrame[] = [];
        for (const f of framesRef.current) {
          if (!f.blob) continue;
          persisted.push({
            id: f.id,
            yawDeg: f.yawDeg,
            pitchDeg: f.pitchDeg,
            roomId: f.roomId,
            roomLabel: f.roomLabel,
            waypointId: f.waypointId,
            waypointIndex: f.waypointIndex,
            frameIndex: f.frameIndex,
            width: f.width,
            height: f.height,
            capturedAt: f.capturedAt,
            dataUrl: await blobToDataUrl(f.blob),
            uploadStatus: f.uploadStatus,
            uploadError: f.uploadError,
            publicUrl: f.publicUrl,
            registeredIn: f.registeredIn,
          });
        }
        if (cancelled) return;
        writeAccountItem('captureFrames', userId, JSON.stringify(persisted), session.id);
      } catch {
        // Quota / encode failure — nothing to do; in-memory frames still work.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, frames, userId]);

  // Warn before leaving the tab while mid-capture with unsaved frames.
  useEffect(() => {
    if (phase !== 'camera' || frames.length === 0) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers render their own generic copy; legacy engines use this.
      e.returnValue = 'You have unsaved captured frames';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [phase, frames.length]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      framesRef.current.forEach(f => URL.revokeObjectURL(f.previewUrl));
    };
  }, []);

  /**
   * Create a capture session and walk it to `capturing` (draft -> capturing).
   * Used by the start button, and by an upload after the previous session ended.
   */
  const openSession = useCallback(
    async (sessionTitle: string, firstRoom: string): Promise<CaptureSession> => {
      const created = await captureApi.createSession({
        title: sessionTitle.trim().slice(0, API_LIMITS.capture.titleMax) || 'Property walkthrough',
        plan: defaultPlan(firstRoom.trim() || 'Room 1'),
        device_info: {
          ...WEB_DEVICE,
          model: navigator.userAgent.slice(0, 120),
        },
      });
      setSession(created);
      createdHereRef.current = created.id;
      navigate(ROUTES.TOUR_CAPTURE_SESSION.replace(':sessionId', created.id), { replace: true });
      try {
        return await moveSession(created.id, 'capturing');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not start the capture session';
        await failSession(created.id, message);
        throw err;
      }
    },
    [navigate, moveSession, failSession]
  );

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    // Must run inside this user-gesture handler — iOS Safari refuses
    // requestPermission() calls made outside a direct click/tap.
    void requestOrientationPermission();
    try {
      await openSession(title, roomLabel);
      setPhase('camera');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create capture session');
    } finally {
      setIsStarting(false);
    }
  };

  /** capturing -> review. The review screen is only shown once the server agrees. */
  const goToReview = async () => {
    if (frames.length === 0) return;
    setError(null);
    try {
      if (session && !isTerminal(session)) await moveSession(session.id, 'review');
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move to review');
    }
  };

  /** review -> capturing, to retake frames. */
  const backToCamera = async () => {
    setError(null);
    try {
      if (session && !isTerminal(session)) await moveSession(session.id, 'capturing');
      setPhase('camera');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not return to the camera');
    }
  };

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video || !cameraReady || isCapturing) return;

    setIsCapturing(true);
    setError(null);
    try {
      const canvas = canvasRef.current ?? document.createElement('canvas');
      canvasRef.current = canvas;
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not available');
      ctx.drawImage(video, 0, 0, w, h);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          b => (b ? resolve(b) : reject(new Error('Failed to encode image'))),
          'image/jpeg',
          0.92
        );
      });

      const yaw = targetYaw;
      const frame: LocalFrame = {
        id: makeId(),
        blob,
        previewUrl: URL.createObjectURL(blob),
        roomId: 'room-1',
        roomLabel: roomLabel.trim() || 'Room 1',
        waypointId: 'wp-center',
        waypointIndex: 0,
        frameIndex: frames.length,
        yawDeg: yaw,
        pitchDeg,
        width: w,
        height: h,
        capturedAt: new Date().toISOString(),
        uploadStatus: 'pending',
      };

      setFrames(prev => {
        // Replace same yaw if retaking
        prev.filter(f => f.yawDeg === yaw).forEach(f => URL.revokeObjectURL(f.previewUrl));
        const without = prev.filter(f => f.yawDeg !== yaw);
        return [...without, frame].sort((a, b) => a.yawDeg - b.yawDeg);
      });

      // Advance to next uncaptured yaw
      const nextIdx = YAW_TARGETS_DEG.findIndex(
        (y, i) => i > yawIndex && !capturedYaws.has(y) && y !== yaw
      );
      if (nextIdx >= 0) {
        setYawIndex(nextIdx);
      } else {
        const firstMissing = YAW_TARGETS_DEG.findIndex(y => y !== yaw && !capturedYaws.has(y));
        if (firstMissing >= 0) setYawIndex(firstMissing);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Capture failed');
    } finally {
      setIsCapturing(false);
    }
  };

  const removeFrame = (id: string) => {
    setFrames(prev => {
      const f = prev.find(x => x.id === id);
      if (f) URL.revokeObjectURL(f.previewUrl);
      return prev.filter(x => x.id !== id);
    });
  };

  const runUploadPipeline = async () => {
    if (frames.length === 0) return;
    setPhase('uploading');
    setError(null);
    setUploadProgress(0);

    // `live` is the session this run registers frames in. A session that ended
    // (failed on a previous attempt, or restored as terminal) cannot be reused.
    let live: CaptureSession | null = session;

    try {
      if (!live || isTerminal(live)) {
        live = await openSession(title, frames[0]?.roomLabel ?? roomLabel);
        live = await moveSession(live.id, 'review');
      }
      const sessionId = live.id;

      // draft/capturing -> review is done by goToReview; review -> uploading starts the run.
      live = await moveSession(sessionId, 'uploading');

      // On retry after a partial failure, don't re-upload/re-register frames
      // that already succeeded in this session — just pick up where we left off.
      const alreadyUploaded = frames.filter(f => f.publicUrl && f.registeredIn === sessionId);
      const pending = frames.filter(f => !(f.publicUrl && f.registeredIn === sessionId));
      let doneCount = 0;
      setUploadProgress(5);

      for (let i = 0; i < pending.length; i++) {
        const frame = pending[i];
        setFrames(prev =>
          prev.map(f => (f.id === frame.id ? { ...f, uploadStatus: 'uploading' } : f))
        );

        try {
          let publicUrl = frame.publicUrl;
          if (!publicUrl) {
            const blob = frame.blob;
            if (!blob) {
              throw new Error(`Frame data missing for ${frame.yawDeg}° — recapture it first.`);
            }
            const file = new File([blob], `capture-${frame.yawDeg}deg.jpg`, {
              type: 'image/jpeg',
            });
            // The tour does not exist yet, so the frame is a generic upload.
            const uploadResult = await uploadApi.uploadFile(file, {
              folderType: 'generic',
              visibility: 'public',
              onProgress: p => {
                const base = (i / pending.length) * 70;
                const slice = (p / 100) * (70 / pending.length);
                setUploadProgress(Math.round(base + slice));
              },
            });
            publicUrl = uploadResult.public_url;
          }

          await captureApi.registerFrame(sessionId, {
            room_id: frame.roomId,
            room_label: frame.roomLabel,
            waypoint_id: frame.waypointId,
            waypoint_index: frame.waypointIndex,
            frame_index: frame.frameIndex,
            image_url: publicUrl,
            metadata: {
              capture_mode: 'multi_yaw',
              timestamp_iso: frame.capturedAt,
              device: WEB_DEVICE,
              pose: {
                yaw_deg: frame.yawDeg,
                ...(frame.pitchDeg !== null ? { pitch_deg: frame.pitchDeg } : {}),
                tracking_backend: 'none',
                tracking_quality: 'limited',
              },
              camera: {
                resolution: [frame.width, frame.height],
              },
            },
          });

          setFrames(prev =>
            prev.map(f =>
              f.id === frame.id
                ? { ...f, uploadStatus: 'done', publicUrl, registeredIn: sessionId }
                : f
            )
          );
          pending[i] = { ...frame, publicUrl, registeredIn: sessionId, uploadStatus: 'done' };
        } catch (err) {
          setFrames(prev =>
            prev.map(f =>
              f.id === frame.id
                ? {
                    ...f,
                    uploadStatus: 'error',
                    uploadError: err instanceof Error ? err.message : 'Upload failed',
                  }
                : f
            )
          );
          throw err;
        }

        doneCount += 1;
        setUploadProgress(Math.round((doneCount / pending.length) * 70));
      }

      setUploadProgress(75);
      // uploading -> processing -> ready. `ready` is final.
      live = await captureApi.completeSession(sessionId);
      setSession(live);

      // Bridge to existing tour pipeline: create tour + scenes from captures
      setUploadProgress(85);
      // A new tour is a draft: `status` is not a writable field.
      const tour = await toursApi.createTour({
        title: (session?.title || title).slice(0, API_LIMITS.tour.titleMax),
        description: `Guided capture session ${sessionId}`,
        visibility: 'private',
        settings: DEFAULT_TOUR_SETTINGS,
      });

      const uploaded = [...alreadyUploaded, ...pending.filter(f => f.publicUrl)].sort(
        (a, b) => a.yawDeg - b.yawDeg
      );
      // The server appends each scene, so creating them in order keeps the order.
      for (let i = 0; i < uploaded.length; i++) {
        const f = uploaded[i];
        await toursApi.createScene(tour.id, {
          image_url: f.publicUrl!,
          title: `${f.roomLabel} · ${f.yawDeg}°`.slice(0, API_LIMITS.scene.titleMax),
        });
      }

      setCreatedTourId(tour.id);
      setUploadProgress(100);
      setPhase('done');
      // Frames are safely registered on the capture session + draft tour now.
      removeAccountItem('captureFrames', userId, sessionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload pipeline failed';
      setError(message);
      // Record the failure on the session. A session that is already terminal
      // (ready, failed, cancelled) cannot change, so it is left as is.
      if (live && !isTerminal(live)) await failSession(live.id, message);
      setPhase('review');
    }
  };

  const levelOk =
    pitchDeg === null || (Math.abs(pitchDeg) < 20 /* soft threshold when sensors exist */);

  // Abandon the session explicitly: cancel it server-side (best-effort) and
  // drop the locally persisted frames.
  const discardSession = async () => {
    if (!session) return;
    if (
      !(await confirm({
        title: 'Discard capture session',
        message:
          'Discard this capture session and its captured frames? The frames will be deleted and cannot be recovered.',
        confirmLabel: 'Discard session',
        destructive: true,
      }))
    ) {
      return;
    }
    try {
      // Cancelling a session that already ended is a 400; the local frames go either way.
      if (!isTerminal(session)) await captureApi.cancelSession(session.id);
    } catch {
      // Best-effort — the session may already be cancelled server-side; the
      // local frames are discarded either way.
    }
    removeAccountItem('captureFrames', userId, session.id);
    framesRef.current.forEach(f => URL.revokeObjectURL(f.previewUrl));
    setFrames([]);
    setSession(null);
    setYawIndex(0);
    setPhase('setup');
    setError(null);
    navigate(ROUTES.TOUR_CAPTURE, { replace: true });
  };

  return (
    <div className="animate-fade-in mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back"
          onClick={() => {
            stopCamera();
            navigate(ROUTES.TOUR_CREATE);
          }}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Guided capture</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {phase === 'setup' && 'Set up the session'}
            {phase === 'camera' && 'Capture around the room'}
            {phase === 'review' && 'Review frames before upload'}
            {phase === 'uploading' && 'Uploading & creating tour'}
            {phase === 'done' && 'Capture complete'}
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-[var(--color-error-200)] bg-[var(--color-error-50)] p-3 text-sm text-[var(--color-error-700)]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Setup */}
      {phase === 'setup' && (
        <Card>
          <CardHeader>
            <CardTitle>New capture session</CardTitle>
            <CardDescription>
              Stand near the center of a room. You will capture {YAW_TARGETS_DEG.length} photos
              while turning in place — enough overlap for a structured tour pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Session title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. 2BHK walkthrough"
              maxLength={API_LIMITS.capture.titleMax}
            />
            <Input
              label="First room name"
              value={roomLabel}
              onChange={e => setRoomLabel(e.target.value)}
              placeholder="Living Room"
            />
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-muted)]">
              <p className="mb-1 font-medium text-[var(--color-text-primary)]">How it works</p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>Allow camera access</li>
                <li>Hold the phone upright and turn to each direction marker</li>
                <li>Capture a photo at each yaw (retake anytime)</li>
                <li>Upload — we register frames on the server and open a draft tour</li>
              </ol>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => navigate(ROUTES.TOURS)}>
                Cancel
              </Button>
              <Button onClick={handleStart} isLoading={isStarting}>
                <Camera className="h-4 w-4" />
                Start camera
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Camera */}
      {phase === 'camera' && (
        <div className="space-y-4">
          <Card className="overflow-hidden p-0">
            <div className="relative aspect-[4/3] bg-black sm:aspect-video">
              {cameraError ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-white">
                  <Smartphone className="h-10 w-10 opacity-70" />
                  <p className="text-sm">{cameraError}</p>
                  <Button variant="secondary" onClick={() => void startCamera()}>
                    Retry camera
                  </Button>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
              )}

              {/* Overlay guidance */}
              {cameraReady && (
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
                  <div className="flex items-start justify-between">
                    <div className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
                      Face ~{targetYaw}° · frame {capturedYaws.size}/{YAW_TARGETS_DEG.length}
                    </div>
                    <div
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium',
                        levelOk ? 'bg-emerald-600/80 text-white' : 'bg-amber-500/90 text-black'
                      )}
                    >
                      {pitchDeg === null
                        ? 'Level: sensors N/A'
                        : levelOk
                          ? 'Level OK'
                          : 'Tilt less'}
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <div className="flex flex-wrap justify-center gap-1.5 rounded-full bg-black/50 px-3 py-2">
                      {YAW_TARGETS_DEG.map((y, i) => {
                        const done = capturedYaws.has(y);
                        const active = i === yawIndex;
                        return (
                          <button
                            key={y}
                            type="button"
                            className={cn(
                              'pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold',
                              done && 'bg-emerald-500 text-white',
                              !done && active && 'bg-white text-black ring-2 ring-[var(--color-primary-400)]',
                              !done && !active && 'bg-white/20 text-white'
                            )}
                            onClick={() => setYawIndex(i)}
                            title={`${y}°`}
                          >
                            {done ? <CheckCircle2 className="h-4 w-4" /> : y}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--color-text-muted)]">
              Turn in place so the view matches the highlighted direction, then capture.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={frames.length === 0}
                onClick={() => void goToReview()}
              >
                Review ({frames.length})
              </Button>
              <Button
                onClick={() => void captureFrame()}
                disabled={!cameraReady || isCapturing}
                isLoading={isCapturing}
              >
                <Camera className="h-4 w-4" />
                Capture {targetYaw}°
              </Button>
            </div>
          </div>

          {allYawsDone && (
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <span>All directions captured for this standing position.</span>
              <Button size="sm" onClick={() => void goToReview()}>
                Continue to review
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Review */}
      {phase === 'review' && (
        <Card>
          <CardHeader>
            <CardTitle>Review captures</CardTitle>
            <CardDescription>
              {frames.length} frame{frames.length === 1 ? '' : 's'} ready. You can retake by going
              back to the camera.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {frames.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">No frames yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {frames.map(f => (
                  <div
                    key={f.id}
                    className="relative overflow-hidden rounded-lg border border-[var(--color-border)]"
                  >
                    <img
                      src={f.previewUrl}
                      alt={`${f.yawDeg} degrees`}
                      className="aspect-square w-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-2 py-1 text-xs text-white">
                      <span>{f.yawDeg}°</span>
                      <button
                        type="button"
                        className="underline"
                        onClick={() => removeFrame(f.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="ghost" onClick={() => void discardSession()}>
                <Trash2 className="h-4 w-4 text-[var(--color-error-600)]" />
                Discard session
              </Button>
              <Button variant="outline" onClick={() => void backToCamera()}>
                Back to camera
              </Button>
              <Button disabled={frames.length === 0} onClick={() => void runUploadPipeline()}>
                <Upload className="h-4 w-4" />
                Upload & create tour
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Uploading */}
      {phase === 'uploading' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Uploading capture
            </CardTitle>
            <CardDescription>
              Registering frames on the capture session, then creating a draft tour.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={uploadProgress} />
            <p className="text-sm text-[var(--color-text-muted)]">{uploadProgress}%</p>
            <ul className="space-y-1 text-sm">
              {frames.map(f => (
                <li key={f.id} className="flex items-center gap-2">
                  {f.uploadStatus === 'done' && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                  {f.uploadStatus === 'uploading' && (
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary-600)]" />
                  )}
                  {f.uploadStatus === 'pending' && (
                    <Circle className="h-4 w-4 text-[var(--color-text-muted)]" />
                  )}
                  {f.uploadStatus === 'error' && (
                    <AlertTriangle className="h-4 w-4 text-[var(--color-error-600)]" />
                  )}
                  <span>
                    {f.yawDeg}° — {f.uploadStatus}
                    {f.uploadError ? `: ${f.uploadError}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Done */}
      {phase === 'done' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" />
              Capture finished
            </CardTitle>
            <CardDescription>
              Frames are on the capture session and a draft tour was created so you can edit
              hotspots and publish in the existing editor.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {createdTourId && (
              <Button onClick={() => navigate(`/tours/${createdTourId}/edit`)}>
                Open tour editor
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate(ROUTES.TOURS)}>
              Back to tours
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (session) {
                  removeAccountItem('captureFrames', userId, session.id);
                }
                setFrames([]);
                setSession(null);
                setCreatedTourId(null);
                setYawIndex(0);
                setPhase('setup');
                navigate(ROUTES.TOUR_CAPTURE, { replace: true });
              }}
            >
              New capture
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
