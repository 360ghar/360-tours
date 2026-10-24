import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, XCircle, Loader2, Clock, AlertCircle, X, Wifi, WifiOff } from 'lucide-react';
import { Button, Progress, Badge } from '@/components/ui';
import { aiApi, parseApiError } from '@/api';
import { useAIJobWebSocket, type AIJobUpdate } from '@/hooks';
import type { AIJobType, AIProcessingJob } from '@/types';
import { cn } from '@/utils';

/** Label per job type. A `Record` over the generated union: a new backend type fails to compile until it is named here. */
const JOB_TYPE_LABELS: Record<AIJobType, string> = {
  generate_tour: 'Tour Generation',
  analyze_scene: 'Scene Analysis',
  analyze_scenes: 'Scene Analysis',
  generate_description: 'Description Generation',
  generate_descriptions: 'Description Generation',
  suggest_hotspots: 'Hotspot Suggestions',
  suggest_tour_hotspots: 'Hotspot Suggestions',
  optimize_tour: 'Tour Optimization',
  spatial_connect: 'Spatial Linking',
  analyze_floor_plan: 'Floor Plan Analysis',
  panorama_stitch: 'Panorama Stitching',
};

/** Statuses a job can still leave. `completed`, `failed` and `cancelled` are final. */
function isRunning(job: AIProcessingJob): boolean {
  return job.status === 'pending' || job.status === 'processing';
}

const POLLING_INTERVAL_MS = 2000;
const WEBSOCKET_CONNECTING_FALLBACK_GRACE_MS = 5000;

interface AIJobStatusProps {
  jobId: string;
  /** `result` is the job's result model; read it with the `read*` helpers of `@/api`. */
  onComplete?: (job: AIProcessingJob, result?: unknown) => void;
  onError?: (job: AIProcessingJob | null, error: string) => void;
  onCancel?: () => void;
  showCancelButton?: boolean;
  /** Use WebSocket for real-time updates (default: true) */
  useWebSocket?: boolean;
  className?: string;
}

function terminalJobError(job: AIProcessingJob): string | null {
  if (job.status === 'failed') return job.error_message || 'Processing failed';
  if (job.status === 'cancelled') return job.error_message || 'Processing was cancelled';
  return null;
}

export function AIJobStatus({
  jobId,
  onComplete,
  onError,
  onCancel,
  showCancelButton = true,
  useWebSocket = true,
  className,
}: AIJobStatusProps) {
  const [job, setJob] = useState<AIProcessingJob | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  // Key of the (job, connection) pair whose connecting grace period ran out.
  const [wsFallbackKey, setWsFallbackKey] = useState<string | null>(null);
  const terminalCallbackHandledRef = useRef(false);
  const jobRef = useRef<AIProcessingJob | null>(null);

  useEffect(() => {
    terminalCallbackHandledRef.current = false;
  }, [jobId]);

  useEffect(() => {
    jobRef.current = job;
  }, [job]);

  // WebSocket for real-time updates
  const { state: wsState, isConnected } = useAIJobWebSocket(
    useWebSocket ? jobId : null,
    {
      onUpdate: (update: AIJobUpdate) => {
        const { status, progress, error_message, result: frameResult } = update.data;
        // Update the job from the frame. A status outside the enum reads null and is ignored.
        setJob((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status: status ?? prev.status,
            progress: progress ?? prev.progress,
            error_message: error_message ?? prev.error_message ?? null,
          };
        });

        if (frameResult) {
          setResult(frameResult);
        }
      },
      onComplete: (wsResult: Record<string, unknown>) => {
        setResult(wsResult);
        // Get final job state from API
        fetchJobStatus();
      },
      onError: (errorMsg: string) => {
        setError(errorMsg);
        setJob((prev) => {
          if (!prev) return prev;
          return { ...prev, status: 'failed', error_message: errorMsg };
        });
      },
    }
  );

  const fetchJobStatus = useCallback(async () => {
    try {
      const response = await aiApi.getJobStatus(jobId);
      setJob(response.job);

      // The result is read only from the top-level `result` of the status response.
      const responseResult = response.result;

      if (responseResult) {
        setResult(responseResult);
      }

      if (response.job.status === 'completed' && !terminalCallbackHandledRef.current) {
        terminalCallbackHandledRef.current = true;
        onComplete?.(response.job, responseResult);
        return true; // Stop polling
      }

      if ((response.job.status === 'failed' || response.job.status === 'cancelled') && !terminalCallbackHandledRef.current) {
        terminalCallbackHandledRef.current = true;
        const errorMsg =
          response.job.error_message ||
          (response.job.status === 'cancelled' ? 'Processing was cancelled' : 'Processing failed');
        setError(errorMsg);
        onError?.(response.job, errorMsg);
        return true; // Stop polling
      }

      return false; // Continue polling
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get job status';
      setError(errorMsg);
      setJob((prev) =>
        prev ? { ...prev, status: 'failed', error_message: errorMsg } : prev
      );
      if (!terminalCallbackHandledRef.current) {
        terminalCallbackHandledRef.current = true;
        onError?.(jobRef.current, errorMsg);
      }
      return true; // Stop polling on error
    }
  }, [jobId, onComplete, onError]);

  // The fallback is enabled only for the exact (job, connection) state whose
  // grace timer fired, so any state change disables it again with no reset.
  const wsConnectingKey = `${jobId}|${useWebSocket}|${wsState}`;
  const wsConnectingFallbackEnabled = wsFallbackKey === wsConnectingKey;

  useEffect(() => {
    if (!useWebSocket || wsState !== 'connecting') return;

    const timeoutId = setTimeout(() => {
      setWsFallbackKey(wsConnectingKey);
    }, WEBSOCKET_CONNECTING_FALLBACK_GRACE_MS);

    return () => clearTimeout(timeoutId);
  }, [wsConnectingKey, useWebSocket, wsState]);

  // Initial fetch and fallback polling (when WebSocket is disabled or not connected)
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    let isActive = true;
    const shouldPoll =
      !useWebSocket ||
      wsState === 'error' ||
      wsState === 'disconnected' ||
      (wsState === 'connecting' && wsConnectingFallbackEnabled);

    const startPolling = async () => {
      // Initial fetch to get job details
      const shouldStop = await fetchJobStatus();

      // Only poll if WebSocket is not being used or not connected
      if (!shouldStop && isActive && shouldPoll) {
        // Continue polling every 2 seconds
        intervalId = setInterval(async () => {
          const done = await fetchJobStatus();
          if (done) {
            clearInterval(intervalId);
          }
        }, POLLING_INTERVAL_MS);
      }
    };

    startPolling();

    return () => {
      isActive = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [fetchJobStatus, useWebSocket, wsConnectingFallbackEnabled, wsState]);

  // Call onComplete/onError when job status changes (for WebSocket updates)
  useEffect(() => {
    if (!job) return;

    if (terminalCallbackHandledRef.current) return;

    if (job.status === 'completed' && result) {
      terminalCallbackHandledRef.current = true;
      onComplete?.(job, result);
    } else if (job.status === 'failed' || job.status === 'cancelled') {
      terminalCallbackHandledRef.current = true;
      onError?.(job, terminalJobError(job) ?? 'Processing failed');
    }
  }, [job?.status, result, job, onComplete, onError]);

  // A terminal job's own message shows when no request error was recorded.
  const shownError = error ?? (job ? terminalJobError(job) : null);

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      const response = await aiApi.cancelJob(jobId);
      setJob(response.job);
      // The user chose to cancel: skip the failure callbacks for this terminal state.
      terminalCallbackHandledRef.current = true;
      onCancel?.();
    } catch (err) {
      if (parseApiError(err).code === 'JOB_NOT_CANCELLABLE') {
        // The job finished (or was cancelled) first: show how it really ended.
        await fetchJobStatus();
      } else {
        setError(err instanceof Error ? err.message : 'Could not cancel the job');
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusIcon = () => {
    if (!job) return <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary-500)]" />;

    switch (job.status) {
      case 'pending':
        return <Clock className="h-5 w-5 text-[var(--color-warning-500)]" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary-500)]" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-[var(--color-success-500)]" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-[var(--color-error-500)]" />;
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-[var(--color-text-muted)]" />;
    }
  };

  const getStatusText = () => {
    if (!job) return 'Loading...';

    switch (job.status) {
      case 'pending':
        return 'Waiting to start...';
      case 'processing':
        return 'Processing...';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
    }
  };

  const getJobTypeLabel = () => {
    // job_type is null when the stored value is outside the enum.
    if (!job?.job_type) return 'AI Processing';
    return JOB_TYPE_LABELS[job.job_type];
  };

  return (
    <div className={cn('rounded-lg border border-[var(--color-border)] p-4', className)}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <h4 className="font-medium">{getJobTypeLabel()}</h4>
            <p className="text-sm text-[var(--color-text-muted)]">{getStatusText()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* WebSocket connection indicator */}
          {useWebSocket && (
            <div
              className={cn(
                'flex items-center gap-1 text-xs',
                isConnected ? 'text-[var(--color-success-500)]' : 'text-[var(--color-text-muted)]'
              )}
              title={isConnected ? 'Real-time updates active' : 'Polling for updates'}
              aria-label={isConnected ? 'Real-time updates active' : 'Polling for updates'}
            >
              {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            </div>
          )}
          {job && (
            <Badge
              variant={
                job.status === 'completed'
                  ? 'success'
                  : job.status === 'failed'
                  ? 'destructive'
                  : 'secondary'
              }
            >
              {job.status}
            </Badge>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {job && isRunning(job) && (
        <div className="space-y-2">
          <Progress value={job.progress} />
          <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
            <span>{job.progress}%</span>
          </div>
        </div>
      )}

      {/* Error message */}
      {shownError && (
        <div className="mt-3 p-3 rounded-md bg-[var(--color-error-50)] text-[var(--color-error-600)] text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{shownError}</span>
          </div>
        </div>
      )}

      {/* Cancel button */}
      {showCancelButton && job && isRunning(job) && (
        <div className="mt-4 pt-3 border-t border-[var(--color-border)]">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            isLoading={isCancelling}
            className="w-full"
          >
            <X className="h-4 w-4" />
            Cancel Processing
          </Button>
        </div>
      )}

      {/* Completion time */}
      {job?.status === 'completed' && job.actual_duration != null && job.actual_duration > 0 && (
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          Completed in {job.actual_duration < 60
            ? `${Math.round(job.actual_duration)} seconds`
            : `${Math.round(job.actual_duration / 60)} minutes`}
        </p>
      )}
    </div>
  );
}
