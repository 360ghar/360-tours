import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, XCircle, Loader2, Clock, AlertCircle, X, Wifi, WifiOff } from 'lucide-react';
import { Button, Progress, Badge } from '@/components/ui';
import { aiApi } from '@/api';
import { useAIJobWebSocket, type AIJobUpdate } from '@/hooks';
import type { AIProcessingJob } from '@/types';
import { cn } from '@/utils';

interface AIJobStatusProps {
  jobId: string;
  onComplete?: (job: AIProcessingJob, result?: unknown) => void;
  onError?: (job: AIProcessingJob, error: string) => void;
  onCancel?: () => void;
  showCancelButton?: boolean;
  /** Use WebSocket for real-time updates (default: true) */
  useWebSocket?: boolean;
  className?: string;
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
  const terminalCallbackHandledRef = useRef(false);

  useEffect(() => {
    terminalCallbackHandledRef.current = false;
  }, [jobId]);

  // WebSocket for real-time updates
  const { state: wsState, isConnected } = useAIJobWebSocket(
    useWebSocket ? jobId : null,
    {
      onUpdate: (update: AIJobUpdate) => {
        if (update.type === 'job_update' && update.data) {
          // Update job with WebSocket data
          setJob((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              status: update.data!.status as AIProcessingJob['status'],
              progress: update.data!.progress,
              error_message: update.data!.error_message || null,
            };
          });

          // Handle result from WebSocket
          if (update.data.result) {
            setResult(update.data.result);
          }
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

      if (response.result) {
        setResult(response.result);
      }

      if (response.job.status === 'completed' && !terminalCallbackHandledRef.current) {
        terminalCallbackHandledRef.current = true;
        onComplete?.(response.job, response.result);
        return true; // Stop polling
      }

      if ((response.job.status === 'failed' || response.job.status === 'canceled') && !terminalCallbackHandledRef.current) {
        terminalCallbackHandledRef.current = true;
        const errorMsg = response.job.error_message || 'Processing failed';
        setError(errorMsg);
        onError?.(response.job, errorMsg);
        return true; // Stop polling
      }

      return false; // Continue polling
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get job status';
      setError(errorMsg);
      return true; // Stop polling on error
    }
  }, [jobId, onComplete, onError]);

  // Initial fetch and fallback polling (when WebSocket is disabled or not connected)
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    let isActive = true;

    const startPolling = async () => {
      // Initial fetch to get job details
      const shouldStop = await fetchJobStatus();

      // Only poll if WebSocket is not being used or not connected
      if (!shouldStop && isActive && (!useWebSocket || wsState === 'error' || wsState === 'disconnected')) {
        // Continue polling every 2 seconds
        intervalId = setInterval(async () => {
          const done = await fetchJobStatus();
          if (done) {
            clearInterval(intervalId);
          }
        }, 2000);
      }
    };

    startPolling();

    return () => {
      isActive = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [fetchJobStatus, useWebSocket, wsState]);

  // Call onComplete/onError when job status changes (for WebSocket updates)
  useEffect(() => {
    if (!job) return;

    if (terminalCallbackHandledRef.current) return;

    if (job.status === 'completed' && result) {
      terminalCallbackHandledRef.current = true;
      onComplete?.(job, result);
    } else if ((job.status === 'failed' || job.status === 'canceled') && job.error_message) {
      terminalCallbackHandledRef.current = true;
      onError?.(job, job.error_message);
    }
  }, [job?.status, result, job, onComplete, onError]);

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await aiApi.cancelJob(jobId);
      onCancel?.();
    } catch {
      // Ignore cancel errors
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusIcon = () => {
    if (!job) return <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary-500)]" />;

    switch (job.status) {
      case 'queued':
      case 'pending':
        return <Clock className="h-5 w-5 text-[var(--color-warning-500)]" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary-500)]" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-[var(--color-success-500)]" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-[var(--color-error-500)]" />;
      case 'canceled':
        return <XCircle className="h-5 w-5 text-[var(--color-text-muted)]" />;
      default:
        return <AlertCircle className="h-5 w-5 text-[var(--color-text-muted)]" />;
    }
  };

  const getStatusText = () => {
    if (!job) return 'Loading...';

    switch (job.status) {
      case 'queued':
      case 'pending':
        return 'Waiting to start...';
      case 'processing':
        return 'Processing...';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'canceled':
        return 'Canceled';
      default:
        return job.status;
    }
  };

  const getJobTypeLabel = () => {
    if (!job) return 'AI Processing';

    switch (job.job_type) {
      case 'tour_generation':
        return 'Tour Generation';
      case 'scene_detection':
        return 'Scene Analysis';
      case 'hotspot_suggestions':
      case 'hotspot_placement':
        return 'Hotspot Suggestions';
      case 'description_generation':
        return 'Description Generation';
      case 'quality_checks':
        return 'Quality Checks';
      case 'optimization':
        return 'Tour Optimization';
      default:
        return 'AI Processing';
    }
  };

  const getEstimatedTime = () => {
    if (!job?.estimated_duration) return null;

    const seconds = job.estimated_duration;
    if (seconds < 60) return `~${seconds}s remaining`;
    const minutes = Math.ceil(seconds / 60);
    return `~${minutes} min remaining`;
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
      {job && (job.status === 'queued' || job.status === 'pending' || job.status === 'processing') && (
        <div className="space-y-2">
          <Progress value={job.progress} />
          <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
            <span>{job.progress}%</span>
            {getEstimatedTime() && <span>{getEstimatedTime()}</span>}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-3 p-3 rounded-md bg-[var(--color-error-50)] text-[var(--color-error-600)] text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Processing details */}
      {job?.status === 'processing' && job.input_data && (
        <div className="mt-3 text-xs text-[var(--color-text-muted)]">
          {typeof job.input_data.scene_count === 'number' && (
            <p>Processing {job.input_data.scene_count} scenes...</p>
          )}
          {typeof job.input_data.image_count === 'number' && (
            <p>Analyzing {job.input_data.image_count} images...</p>
          )}
        </div>
      )}

      {/* Cancel button */}
      {showCancelButton && job && (job.status === 'queued' || job.status === 'pending' || job.status === 'processing') && (
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
      {job?.status === 'completed' && job.actual_duration && (
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          Completed in {job.actual_duration < 60
            ? `${job.actual_duration} seconds`
            : `${Math.round(job.actual_duration / 60)} minutes`}
        </p>
      )}
    </div>
  );
}
