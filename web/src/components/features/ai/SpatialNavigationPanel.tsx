import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Route,
  AlertTriangle,
} from 'lucide-react';
import { Button, Card, CardContent, Badge, Progress } from '@/components/ui';
import { aiApi, type SpatialGenerationResult } from '@/api';
import { QUERY_KEYS } from '@/constants';
import { cn } from '@/utils';
import { AIJobStatus } from './AIJobStatus';

const PROCESSING_STEP_LABELS: Record<string, string> = {
  15: 'Understanding rooms…',
  45: 'Detecting doorways…',
  70: 'Building navigation…',
};

interface SpatialNavigationPanelProps {
  tourId: string;
  sceneCount: number;
  tourStatus?: string;
  className?: string;
}

function getProcessingStep(progress: number): string {
  let label = 'Processing…';
  for (const [threshold, text] of Object.entries(PROCESSING_STEP_LABELS)) {
    if (progress >= Number(threshold)) label = text;
  }
  if (progress >= 70) label = 'Building navigation…';
  return label;
}

function qualityColor(score: number): string {
  if (score >= 80) return 'text-[var(--color-success-500)]';
  if (score >= 60) return 'text-[var(--color-warning-500)]';
  return 'text-[var(--color-error-500)]';
}

export function SpatialNavigationPanel({
  tourId,
  sceneCount,
  tourStatus,
  className,
}: SpatialNavigationPanelProps) {
  const queryClient = useQueryClient();
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const jobsQuery = useQuery({
    queryKey: [QUERY_KEYS.AI_JOBS, 'spatial', tourId],
    queryFn: () => aiApi.getJobs({ tour_id: tourId, limit: 10 }),
    enabled: !!tourId,
  });

  const spatialJobs = useMemo(
    () =>
      (jobsQuery.data?.items ?? []).filter(job => job.job_type === 'spatial_generation'),
    [jobsQuery.data]
  );

  const latestJob = spatialJobs[0] ?? null;
  const activeJobId = runningJobId ?? latestJob?.id ?? null;

  const latestIsTerminal = latestJob && !['pending', 'processing', 'queued'].includes(latestJob.status);
  const latestIsCompleted = latestJob?.status === 'completed';
  const showProcessing = !!activeJobId && !latestIsTerminal;

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.AI_JOBS, 'spatial', tourId] });
  }, [queryClient, tourId]);

  const handleStart = useCallback(async () => {
    setIsStarting(true);
    setStartError(null);
    try {
      const response = await aiApi.requestSpatialGeneration(tourId);
      setRunningJobId(response.job.id);
      await invalidate();
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not start AI navigation');
    } finally {
      setIsStarting(false);
    }
  }, [tourId, invalidate]);

  const handleTerminal = useCallback(() => {
    setRunningJobId(null);
    invalidate();
  }, [invalidate]);

  const cannotGenerate = sceneCount < 2;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-[var(--color-primary-500)]/10 p-2 text-[var(--color-primary-500)]">
              <Route className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">AI Spatial Navigation</h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                Automatically detects doorways and connects your rooms with
                navigation hotspots.
              </p>
            </div>
          </div>
        </div>

        {cannotGenerate ? (
          <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
            Add at least 2 scenes to generate AI navigation.
          </div>
        ) : showProcessing ? (
          <div className="mt-4">
            <AIJobStatus
              jobId={activeJobId}
              onComplete={handleTerminal}
              onError={handleTerminal}
              showCancelButton={false}
            />
            {activeJobId === latestJob?.id && latestJob?.status === 'processing' && (
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                {getProcessingStep(latestJob.progress)}
              </p>
            )}
          </div>
        ) : latestIsCompleted && activeJobId ? (
          <SpatialResult
            jobId={activeJobId}
            onRegenerate={handleStart}
            isStarting={isStarting}
          />
        ) : latestJob && latestJob.status === 'failed' ? (
          <FailureState
            error={latestJob.error_message}
            onRetry={handleStart}
            isStarting={isStarting}
            tourStatus={tourStatus}
          />
        ) : (
          <div className="mt-4">
            {tourStatus === 'published' && (
              <p className="mb-3 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                <CheckCircle2 className="h-4 w-4 text-[var(--color-success-500)]" />
                Your tour is live — AI navigation runs in the background and
                never blocks viewing.
              </p>
            )}
            {startError && (
              <p className="mb-3 rounded-lg bg-[var(--color-error-50)] p-3 text-xs text-[var(--color-error-600)]">
                {startError}
              </p>
            )}
            <Button onClick={handleStart} isLoading={isStarting} disabled={jobsQuery.isLoading}>
              <Sparkles className="h-4 w-4" />
              Run AI navigation
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SpatialResult({
  jobId,
  onRegenerate,
  isStarting,
}: {
  jobId: string;
  onRegenerate: () => void;
  isStarting: boolean;
}) {
  // Mounted only for a terminal job: the query key is stable for the whole
  // mount, so the fetch always runs and delivers its result.
  const resultQuery = useQuery({
    queryKey: [QUERY_KEYS.AI_JOBS, 'spatial-result', jobId],
    queryFn: () => aiApi.getJobStatus(jobId),
  });

  const result = resultQuery.data?.result as SpatialGenerationResult | undefined;
  return (
    <SuccessState result={result} onRegenerate={onRegenerate} isStarting={isStarting} />
  );
}

function SuccessState({
  result,
  onRegenerate,
  isStarting,
}: {
  result?: SpatialGenerationResult;
  onRegenerate: () => void;
  isStarting: boolean;
}) {
  const warnings = result?.quality?.warnings ?? [];
  const stats = result?.graph;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[var(--color-success-500)]">
          <CheckCircle2 className="h-5 w-5" />
          <p className="font-medium">Tour navigation ready</p>
        </div>
        {result?.quality && (
          <div className="text-right">
            <p
              className={cn(
                'text-2xl font-bold leading-none',
                qualityColor(result.quality.overall_score)
              )}
            >
              {result.quality.overall_score}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">tour score</p>
          </div>
        )}
      </div>

      {result ? (
        <>
          {warnings.length > 0 && (
            <div className="rounded-lg border border-[var(--color-warning-500)]/30 bg-[var(--color-warning-50)] p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-warning-600)]">
                <AlertTriangle className="h-4 w-4" />
                Warnings
              </div>
              <ul className="mt-1 list-disc pl-5 text-xs text-[var(--color-text-muted)]">
                {warnings.map(warning => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-3">
            <Stat label="Rooms analysed" value={stats?.scene_count ?? 0} />
            <Stat label="Navigation links" value={stats?.edge_count ?? 0} />
            <Stat label="Scenes reachable" value={stats?.reachable_scenes ?? 0} />
          </div>

          {(result.scenes?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {result.scenes.map(scene => (
                <Badge key={scene.scene_id ?? scene.room_type} variant="secondary">
                  {scene.room_type ?? 'room'}
                  {typeof scene.room_confidence === 'number'
                    ? ` · ${Math.round(scene.room_confidence * 100)}%`
                    : ''}
                </Badge>
              ))}
            </div>
          )}

          {(result.unanalysed_scene_ids?.length ?? 0) > 0 && (
            <p className="text-xs text-[var(--color-text-muted)]">
              {result.unanalysed_scene_ids.length} scene(s) could not be analysed
              — they remain in the tour without AI links.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">
          Navigation hotspots were generated. Open the tour to explore it.
        </p>
      )}

      <Button variant="outline" size="sm" onClick={onRegenerate} isLoading={isStarting}>
        <RefreshCw className="h-4 w-4" />
        Regenerate
      </Button>
    </div>
  );
}

function FailureState({
  error,
  onRetry,
  isStarting,
  tourStatus,
}: {
  error?: string | null;
  onRetry: () => void;
  isStarting: boolean;
  tourStatus?: string;
}) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2 text-[var(--color-error-500)]">
        <XCircle className="h-5 w-5" />
        <p className="font-medium">AI navigation couldn't be generated</p>
      </div>
      <p className="text-sm text-[var(--color-text-muted)]">
        {tourStatus === 'published'
          ? 'Your tour is ready and remains available — manual navigation still works.'
          : 'Manual navigation is unaffected.'}
      </p>
      {error && (
        <p className="rounded-lg bg-[var(--color-error-50)] p-3 text-xs text-[var(--color-error-600)]">
          {error}
        </p>
      )}
      <Button variant="outline" size="sm" onClick={onRetry} isLoading={isStarting}>
        <RefreshCw className="h-4 w-4" />
        Retry AI processing
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}

export function SpatialNavigationSkeleton() {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary-500)]" />
          <p className="text-sm text-[var(--color-text-muted)]">Checking AI navigation…</p>
        </div>
        <Progress value={0} className="mt-3" />
      </CardContent>
    </Card>
  );
}
