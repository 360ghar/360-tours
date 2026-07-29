import { useState, useEffect, useRef, useCallback } from 'react';
import { labApi } from '@/api/lab';
import type { SplatJob, SplatJobStatus, CreateSplatJobRequest, SplatPipelineStage } from '@/types/lab';

const POLL_INTERVAL_MS = 3000;

const ACTIVE_STATUSES: SplatJobStatus[] = [
  'pending',
  'uploading',
  'extracting',
  'converting',
  'sfm',
  'training',
  'compressing',
  'collision',
];

const TERMINAL_STATUSES: SplatJobStatus[] = ['ready', 'failed'];

export const PIPELINE_STAGES: SplatPipelineStage[] = [
  { id: 'uploading', label: 'Upload', description: 'Uploading video file to storage' },
  { id: 'extracting', label: 'Extract', description: 'Extracting frames from video' },
  { id: 'converting', label: 'Convert', description: 'Converting frames for processing' },
  { id: 'sfm', label: 'SfM', description: 'Running Structure-from-Motion point cloud' },
  { id: 'training', label: 'Train', description: 'Training Gaussian Splat model' },
  { id: 'compressing', label: 'Compress', description: 'Compressing splat output' },
  { id: 'collision', label: 'Collision', description: 'Generating collision mesh' },
  { id: 'ready', label: 'Ready', description: 'Pipeline complete' },
];

async function uploadToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (!response.ok) {
    throw new Error(`Failed to upload ${file.name}: ${response.status} ${response.statusText}`);
  }
}

interface UseSplatPipelineReturn {
  job: SplatJob | null;
  jobs: SplatJob[];
  isPolling: boolean;
  isCreating: boolean;
  createAndStart: (data: CreateSplatJobRequest, videoFiles: File[]) => Promise<void>;
  selectJob: (job: SplatJob) => void;
  clearJob: () => void;
  error: string | null;
}

export function useSplatPipeline(): UseSplatPipelineReturn {
  const [job, setJob] = useState<SplatJob | null>(null);
  const [jobs, setJobs] = useState<SplatJob[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentJobIdRef = useRef<string | null>(null);
  const pollInFlightRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    currentJobIdRef.current = null;
    setIsPolling(false);
  }, []);

  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    currentJobIdRef.current = jobId;
    setIsPolling(true);

    const scheduleNext = () => {
      if (currentJobIdRef.current !== jobId) return;
      pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    };

    const poll = async () => {
      if (currentJobIdRef.current !== jobId || pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const updated = await labApi.getJob(jobId);
        // The selected job may have changed while this request was in flight.
        if (currentJobIdRef.current !== jobId) return;
        setJob(updated);
        if (TERMINAL_STATUSES.includes(updated.status)) {
          currentJobIdRef.current = null;
          if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
          }
          setIsPolling(false);
          try {
            const allJobs = await labApi.getJobs();
            setJobs(allJobs);
          } catch {
            // Best-effort refresh — the job itself already updated above.
          }
          return;
        }
      } catch {
        // Silently ignore poll errors; will retry next cycle.
      } finally {
        pollInFlightRef.current = false;
      }
      scheduleNext();
    };

    void poll();
  }, [stopPolling]);

  // Load all jobs on mount
  useEffect(() => {
    labApi
      .getJobs()
      .then((allJobs) => {
        setJobs(allJobs);
        // Resume polling if a job is still active
        const activeJob = allJobs.find((j) => ACTIVE_STATUSES.includes(j.status));
        if (activeJob) {
          setJob(activeJob);
          startPolling(activeJob.id);
        }
      })
      .catch(() => {
        // Not critical — page still renders
      });

    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const createAndStart = useCallback(
    async (data: CreateSplatJobRequest, videoFiles: File[]) => {
      setError(null);
      setIsCreating(true);
      try {
        // 1. Create job record with multiple filenames
        const dataWithFilenames = {
          ...data,
          filenames: videoFiles.map(f => f.name)
        };
        const newJob = await labApi.createJob(dataWithFilenames);
        setJob({ ...newJob, status: 'uploading', progress: 0, stage_message: 'Preparing upload…' });

        // 2 & 3. Get presigned upload URLs and PUT directly to storage in parallel
        await Promise.all(
          videoFiles.map(async (file) => {
            const { upload_url } = await labApi.getUploadUrl(newJob.id, file.name);
            await uploadToPresignedUrl(upload_url, file);
          })
        );

        // 4. Kick off the pipeline, then start polling immediately — an
        // unrelated failure refreshing the jobs list below must not stop us
        // from tracking a pipeline that already started successfully.
        const started = await labApi.startPipeline(newJob.id);
        setJob(started);
        startPolling(started.id);

        try {
          const allJobs = await labApi.getJobs();
          setJobs(allJobs);
        } catch {
          // Best-effort — polling is already running for the new job.
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start pipeline';
        setError(message);
        setJob(null);
      } finally {
        setIsCreating(false);
      }
    },
    [startPolling]
  );

  const selectJob = useCallback(
    (selected: SplatJob) => {
      if (ACTIVE_STATUSES.includes(selected.status)) {
        setJob(selected);
        startPolling(selected.id);
      } else {
        stopPolling();
        setJob(selected);
      }
    },
    [startPolling, stopPolling]
  );

  const clearJob = useCallback(() => {
    stopPolling();
    setJob(null);
  }, [stopPolling]);

  return {
    job,
    jobs,
    isPolling,
    isCreating,
    createAndStart,
    selectJob,
    clearJob,
    error,
  };
}
