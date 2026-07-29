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
import type { CaptureSession } from '@/types/capture';
import { cn } from '@/utils';

/** Discrete yaw targets for multi-yaw capture at one standing position. */
const YAW_TARGETS_DEG = [0, 45, 90, 135, 180, 225, 270, 315] as const;

type Phase = 'setup' | 'camera' | 'review' | 'uploading' | 'done';

interface LocalFrame {
  id: string;
  blob: Blob;
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

function defaultPlan(roomLabel: string) {
  return {
    template: 'custom' as const,
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

export function GuidedCapturePage() {
  const navigate = useNavigate();
  const { sessionId: routeSessionId } = useParams<{ sessionId?: string }>();

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

  const targetYaw = YAW_TARGETS_DEG[yawIndex] ?? 0;
  const capturedYaws = new Set(frames.map(f => f.yawDeg));
  const allYawsDone = YAW_TARGETS_DEG.every(y => capturedYaws.has(y));

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

  // Resume existing session from route
  useEffect(() => {
    if (!routeSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await captureApi.getSession(routeSessionId);
        if (cancelled) return;
        setSession(s);
        setTitle(s.title);
        setPhase('camera');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load session');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeSessionId]);

  // Keep a ref in sync so the unmount cleanup below revokes the CURRENT
  // frames, not whatever `frames` was when this effect first ran.
  const framesRef = useRef<LocalFrame[]>(frames);
  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      framesRef.current.forEach(f => URL.revokeObjectURL(f.previewUrl));
    };
  }, []);

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    // Must run inside this user-gesture handler — iOS Safari refuses
    // requestPermission() calls made outside a direct click/tap.
    void requestOrientationPermission();
    try {
      const plan = defaultPlan(roomLabel.trim() || 'Room 1');
      const s = await captureApi.createSession({
        title: title.trim() || 'Property walkthrough',
        plan,
        device_info: {
          platform: 'web',
          app_version: 'web-capture-0.1',
          model: navigator.userAgent.slice(0, 120),
        },
      });
      setSession(s);
      setPhase('camera');
      navigate(ROUTES.TOUR_CAPTURE_SESSION.replace(':sessionId', s.id), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create capture session');
    } finally {
      setIsStarting(false);
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
    if (!session || frames.length === 0) return;
    setPhase('uploading');
    setError(null);
    setUploadProgress(0);

    // On retry after a partial failure, don't re-upload/re-register frames
    // that already succeeded — just pick up where we left off.
    const alreadyUploaded = frames.filter(f => f.uploadStatus === 'done' && f.publicUrl);
    const pending = frames.filter(f => !(f.uploadStatus === 'done' && f.publicUrl));
    let doneCount = 0;

    try {
      await captureApi.updateSession(session.id, { status: 'uploading', progress: 5 });

      for (let i = 0; i < pending.length; i++) {
        const frame = pending[i];
        setFrames(prev =>
          prev.map(f => (f.id === frame.id ? { ...f, uploadStatus: 'uploading' } : f))
        );

        try {
          const file = new File([frame.blob], `capture-${frame.yawDeg}deg.jpg`, {
            type: 'image/jpeg',
          });
          const uploadResult = await uploadApi.uploadFile(file, {
            folder: 'scenes',
            visibility: 'public',
            onProgress: p => {
              const base = (i / pending.length) * 70;
              const slice = (p / 100) * (70 / pending.length);
              setUploadProgress(Math.round(base + slice));
            },
          });

          await captureApi.registerFrame(session.id, {
            room_id: frame.roomId,
            room_label: frame.roomLabel,
            waypoint_id: frame.waypointId,
            waypoint_index: frame.waypointIndex,
            frame_index: frame.frameIndex,
            image_url: uploadResult.public_url,
            metadata: {
              capture_mode: 'multi_yaw',
              timestamp_iso: frame.capturedAt,
              device: { platform: 'web', app_version: 'web-capture-0.1' },
              pose: {
                yaw_deg: frame.yawDeg,
                pitch_deg: frame.pitchDeg ?? undefined,
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
                ? { ...f, uploadStatus: 'done', publicUrl: uploadResult.public_url }
                : f
            )
          );
          pending[i] = { ...frame, publicUrl: uploadResult.public_url, uploadStatus: 'done' };
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
      await captureApi.completeSession(session.id);

      // Bridge to existing tour pipeline: create tour + scenes from captures
      setUploadProgress(85);
      const tour = await toursApi.createTour({
        title: session.title || title,
        description: `Guided capture session ${session.id}`,
        status: 'draft',
        visibility: 'private',
        settings: DEFAULT_TOUR_SETTINGS,
      });

      const uploaded = [...alreadyUploaded, ...pending.filter(f => f.publicUrl)].sort(
        (a, b) => a.yawDeg - b.yawDeg
      );
      for (let i = 0; i < uploaded.length; i++) {
        const f = uploaded[i];
        await toursApi.createScene(tour.id, {
          image_url: f.publicUrl!,
          title: `${f.roomLabel} · ${f.yawDeg}°`,
          order_index: i,
        });
      }

      setCreatedTourId(tour.id);
      setUploadProgress(100);
      setPhase('done');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload pipeline failed';
      setError(message);
      try {
        await captureApi.updateSession(session.id, {
          status: 'failed',
          error_message: message,
        });
      } catch {
        // Best-effort — the user-facing error above already reflects the failure.
      }
      setPhase('review');
    }
  };

  const levelOk =
    pitchDeg === null || (Math.abs(pitchDeg) < 20 /* soft threshold when sensors exist */);

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
                onClick={() => setPhase('review')}
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
              <Button size="sm" onClick={() => setPhase('review')}>
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
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setPhase('camera')}>
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
