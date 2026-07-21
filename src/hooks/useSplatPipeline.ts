import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { labApi } from '@/api/lab';
import type { SplatJob, SplatJobStatus, CreateSplatJobRequest, SplatPipelineStage } from '@/types/lab';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

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

interface UseSplatPipelineReturn {
  job: SplatJob | null;
  jobs: SplatJob[];
  isPolling: boolean;
  isCreating: boolean;
  stages: SplatPipelineStage[];
  createAndStart: (data: CreateSplatJobRequest, videoFiles: File[]) => Promise<void>;
  cancelJob: () => void;
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

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentJobIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      currentJobIdRef.current = jobId;
      setIsPolling(true);

      const poll = async () => {
        if (currentJobIdRef.current !== jobId) return;
        try {
          const updated = await labApi.getJob(jobId);
          setJob(updated);
          if (TERMINAL_STATUSES.includes(updated.status)) {
            stopPolling();
            // Refresh jobs list
            const allJobs = await labApi.getJobs();
            setJobs(allJobs);
          }
        } catch {
          // Silently ignore poll errors; will retry next cycle
        }
      };

      void poll();
      pollIntervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    },
    [stopPolling]
  );

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

        // 2 & 3. Get upload URLs and upload directly to Supabase storage in parallel
        await Promise.all(
          videoFiles.map(async (file) => {
            const { storage_path } = await labApi.getUploadUrl(newJob.id, file.name);
            const { error: uploadError } = await supabase.storage
              .from('splat-jobs')
              .upload(storage_path, file, { upsert: true });

            if (uploadError) {
              throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);
            }
          })
        );

        // 4. Kick off the pipeline
        const started = await labApi.startPipeline(newJob.id);
        setJob(started);

        // 5. Refresh jobs list and start polling
        const allJobs = await labApi.getJobs();
        setJobs(allJobs);
        startPolling(started.id);
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

  const cancelJob = useCallback(() => {
    stopPolling();
    currentJobIdRef.current = null;
    setJob(null);
  }, [stopPolling]);

  const selectJob = useCallback(
    (selected: SplatJob) => {
      setJob(selected);
      if (ACTIVE_STATUSES.includes(selected.status)) {
        startPolling(selected.id);
      }
    },
    [startPolling]
  );

  const clearJob = useCallback(() => {
    stopPolling();
    currentJobIdRef.current = null;
    setJob(null);
  }, [stopPolling]);

  return {
    job,
    jobs,
    isPolling,
    isCreating,
    stages: PIPELINE_STAGES,
    createAndStart,
    cancelJob,
    selectJob,
    clearJob,
    error,
  };
}
