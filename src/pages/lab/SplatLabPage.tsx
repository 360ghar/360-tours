import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  Film,
  RotateCcw,
  Crosshair,
  Brain,
  Package,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Download,
  ExternalLink,
  RefreshCw,
  Trash2,
  Plus,
  ChevronRight,
  Clock,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Progress,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@/components/ui';
import { useSplatPipeline, PIPELINE_STAGES } from '@/hooks/useSplatPipeline';
import type { SplatJob, SplatJobStatus, QualityPreset } from '@/types/lab';
import { formatRelativeTime } from '@/utils/format';
import { cn } from '@/utils';
import { ROUTES } from '@/constants';
import { useNavigate } from 'react-router-dom';

// ─── Stage icons map ──────────────────────────────────────────────────────────
const STAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  uploading: Upload,
  extracting: Film,
  converting: RotateCcw,
  sfm: Crosshair,
  training: Brain,
  compressing: Package,
  collision: Shield,
  ready: CheckCircle2,
};

type StageState = 'pending' | 'active' | 'done' | 'failed';

function getStageState(stageId: SplatJobStatus, currentStatus: SplatJobStatus): StageState {
  const order: SplatJobStatus[] = [
    'uploading',
    'extracting',
    'converting',
    'sfm',
    'training',
    'compressing',
    'collision',
    'ready',
  ];
  const currentIdx = order.indexOf(currentStatus === 'failed' ? 'failed' : currentStatus);
  const stageIdx = order.indexOf(stageId);

  if (currentStatus === 'failed') {
    if (stageIdx < currentIdx) return 'done';
    if (stageIdx === currentIdx) return 'failed';
    return 'pending';
  }
  if (stageIdx < currentIdx) return 'done';
  if (stageIdx === currentIdx) return 'active';
  return 'pending';
}

// ─── Pipeline Stage Tracker ───────────────────────────────────────────────────
function PipelineTracker({ job }: { job: SplatJob }) {
  return (
    <div className="flex items-start gap-1 overflow-x-auto pb-2">
      {PIPELINE_STAGES.map((stage, i) => {
        const state = getStageState(stage.id, job.status);
        const Icon = STAGE_ICONS[stage.id] ?? CheckCircle2;

        return (
          <React.Fragment key={stage.id}>
            <div className="flex min-w-[72px] flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300',
                  state === 'done' &&
                    'border-[var(--color-success-500)] bg-[var(--color-success-50)] text-[var(--color-success-600)]',
                  state === 'active' &&
                    'animate-pulse border-[var(--color-primary-500)] bg-[var(--color-primary-50)] text-[var(--color-primary-600)]',
                  state === 'pending' &&
                    'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]',
                  state === 'failed' &&
                    'border-[var(--color-error-500)] bg-[var(--color-error-50)] text-[var(--color-error-600)]'
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span
                className={cn(
                  'text-center text-[10px] font-medium leading-tight',
                  state === 'done' && 'text-[var(--color-success-600)]',
                  state === 'active' && 'text-[var(--color-primary-600)]',
                  state === 'pending' && 'text-[var(--color-text-muted)]',
                  state === 'failed' && 'text-[var(--color-error-600)]'
                )}
              >
                {stage.label}
              </span>
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <div
                className={cn(
                  'mt-4 h-0.5 min-w-[16px] flex-1 rounded-full transition-colors duration-500',
                  state === 'done'
                    ? 'bg-[var(--color-success-500)]'
                    : 'bg-[var(--color-border)]'
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: SplatJobStatus }) {
  const map: Record<SplatJobStatus, { label: string; variant: 'success' | 'secondary' | 'destructive' | 'warning' | 'outline' }> = {
    pending: { label: 'Pending', variant: 'secondary' },
    uploading: { label: 'Uploading', variant: 'outline' },
    extracting: { label: 'Extracting', variant: 'outline' },
    converting: { label: 'Converting', variant: 'outline' },
    sfm: { label: 'SfM', variant: 'outline' },
    training: { label: 'Training', variant: 'warning' },
    compressing: { label: 'Compressing', variant: 'outline' },
    collision: { label: 'Collision', variant: 'outline' },
    ready: { label: 'Ready', variant: 'success' },
    failed: { label: 'Failed', variant: 'destructive' },
  };
  const { label, variant } = map[status] ?? { label: status, variant: 'secondary' };
  return <Badge variant={variant}>{label}</Badge>;
}

// ─── GPU Warning Banner ───────────────────────────────────────────────────────
function GpuWarningBanner() {
  return (
    <div className="rounded-xl border border-[var(--color-warning-200)] bg-[var(--color-warning-50)] p-4">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-warning-600)]" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--color-warning-700)]">⚠️ GPU Not Available</p>
          <p className="mt-1 text-sm text-[var(--color-warning-600)]">
            The pipeline ran successfully through frame extraction and 3D point cloud generation.
            Gaussian Splatting training requires an NVIDIA GPU. Ask your Daytona admin to enable GPU
            sandbox access, or use Luma AI for now.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href="https://lumaai.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-warning-400)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--color-warning-700)] transition-colors hover:bg-[var(--color-warning-50)]"
            >
              Try Luma AI
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-warning-600)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-warning-700)]">
              Request GPU Access
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Past Jobs List ───────────────────────────────────────────────────────────
function PastJobCard({ job, onSelect }: { job: SplatJob; onSelect: (job: SplatJob) => void }) {
  return (
    <button
      onClick={() => onSelect(job)}
      className="flex w-full items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3 text-left transition-all hover:border-[var(--color-primary-300)] hover:shadow-sm"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-50)]">
        <Brain className="h-5 w-5 text-[var(--color-primary-600)]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{job.title}</p>
        <p className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <Clock className="h-3 w-3" />
          {formatRelativeTime(job.updated_at)}
        </p>
      </div>
      <StatusBadge status={job.status} />
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
    </button>
  );
}

// ─── Active Job View ──────────────────────────────────────────────────────────
function ActiveJobView({
  job,
  onClear,
}: {
  job: SplatJob;
  onClear: () => void;
}) {
  const isReady = job.status === 'ready';
  const isFailed = job.status === 'failed';
  const isGpuError = job.error_message?.includes('GPU_REQUIRED');

  return (
    <div className="space-y-6">
      {/* Job Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">{job.title}</h2>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={job.status} />
            {job.stage_message && (
              <span className="text-sm text-[var(--color-text-muted)]">{job.stage_message}</span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClear}>
          <Plus className="h-4 w-4 rotate-45" />
        </Button>
      </div>

      {/* Pipeline Stage Tracker */}
      <Card>
        <CardContent className="pt-6">
          <PipelineTracker job={job} />
          {!isReady && !isFailed && (
            <>
              <Progress value={job.progress} className="mt-4 h-2" />
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                {job.progress}% complete
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* GPU Warning */}
      {isFailed && isGpuError && <GpuWarningBanner />}

      {/* Generic Error */}
      {isFailed && !isGpuError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Pipeline Failed</AlertTitle>
          <AlertDescription>
            {job.error_message || 'An unexpected error occurred. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Ready: Viewer + Downloads */}
      {isReady && (
        <div className="space-y-4">
          {/* Download Actions */}
          <div className="flex flex-wrap gap-2">
            {job.splat_url && (
              <a href={job.splat_url} download className="inline-flex">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4" />
                  Download .ply
                </Button>
              </a>
            )}
            {job.splat_url && (
              <a href={job.splat_url} download className="inline-flex">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4" />
                  Download .spz
                </Button>
              </a>
            )}
            {job.supersplat_url && (
              <a href={job.supersplat_url} target="_blank" rel="noopener noreferrer" className="inline-flex">
                <Button size="sm">
                  <ExternalLink className="h-4 w-4" />
                  Open in SuperSplat
                </Button>
              </a>
            )}
          </div>

          {/* Viewer Tabs */}
          <Card>
            <CardHeader className="pb-0">
              <CardTitle>Viewer</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <Tabs defaultValue="quick">
                <TabsList>
                  <TabsTrigger value="quick">Quick Preview</TabsTrigger>
                  <TabsTrigger value="self-hosted">Self-Hosted</TabsTrigger>
                </TabsList>
                <TabsContent value="quick" className="mt-4">
                  {job.supersplat_url ? (
                    <iframe
                      src={job.supersplat_url}
                      className="h-[480px] w-full rounded-lg border border-[var(--color-border)]"
                      title="Gaussian Splat Preview"
                      allow="xr-spatial-tracking"
                    />
                  ) : (
                    <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)]">
                      No preview URL available
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="self-hosted" className="mt-4">
                  <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--color-border)]">
                    <Package className="h-8 w-8 text-[var(--color-text-muted)]" />
                    <div className="text-center">
                      <p className="font-medium text-[var(--color-text-secondary)]">
                        Self-hosted viewer coming soon
                      </p>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                        Install via <code className="rounded bg-[var(--color-surface)] px-1 py-0.5 font-mono text-xs">npm install @360tours/splat-viewer</code>
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Retry button for failed jobs */}
      {isFailed && (
        <div className="flex justify-start">
          <Button variant="outline" onClick={onClear}>
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Create Job Form ──────────────────────────────────────────────────────────
function CreateJobForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (data: { title: string; is360: boolean; maskPeople: boolean; quality: QualityPreset }, files: File[]) => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState('');
  const [is360, setIs360] = useState(true);
  const [maskPeople, setMaskPeople] = useState(false);
  const [quality, setQuality] = useState<QualityPreset>('balanced');
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
    if (dropped.length > 0) {
      setFiles(prev => [...prev, ...dropped]);
      if (!title) setTitle(dropped[0].name.replace(/\.[^.]+$/, '') + (dropped.length > 1 ? ' + more' : ''));
    }
  }, [title]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length > 0) {
      setFiles(prev => [...prev, ...picked]);
      if (!title) setTitle(picked[0].name.replace(/\.[^.]+$/, '') + (picked.length > 1 ? ' + more' : ''));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0 || !title.trim()) return;
    onSubmit({ title: title.trim(), is360, maskPeople, quality }, files);
  };

  const qualityOptions: { value: QualityPreset; label: string; desc: string }[] = [
    { value: 'fast', label: 'Fast', desc: '~10 min, lower detail' },
    { value: 'balanced', label: 'Balanced', desc: '~25 min, good quality' },
    { value: 'quality', label: 'Quality', desc: '~60 min, maximum detail' },
  ];

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
      {/* Title */}
      <div className="space-y-1.5">
        <label
          htmlFor="splat-title"
          className="text-sm font-medium text-[var(--color-text-secondary)]"
        >
          Job Title
        </label>
        <input
          id="splat-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Living Room Scan"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary-500)] focus:ring-1 focus:ring-[var(--color-primary-500)]"
          required
        />
      </div>

      {/* Drop Zone */}
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-10 transition-all duration-200',
          dragOver
            ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]'
            : files.length > 0
            ? 'border-[var(--color-success-500)] bg-[var(--color-success-50)]'
            : 'border-[var(--color-border)] hover:border-[var(--color-primary-400)] hover:bg-[var(--color-primary-50)]'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          className="sr-only"
          onChange={handleFileChange}
        />
        <div
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-xl',
            files.length > 0 ? 'bg-[var(--color-success-100)]' : 'bg-[var(--color-primary-100)]'
          )}
        >
          {files.length > 0 ? (
            <Film className="h-7 w-7 text-[var(--color-success-600)]" />
          ) : (
            <Upload className="h-7 w-7 text-[var(--color-primary-600)]" />
          )}
        </div>
        <div className="text-center">
          {files.length > 0 ? (
            <>
              <p className="font-semibold text-[var(--color-success-700)]">
                {files.length} {files.length === 1 ? 'file' : 'files'} selected
              </p>
              <p className="mt-0.5 text-sm text-[var(--color-success-600)]">
                {(files.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(1)} MB total — click to add more
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-[var(--color-text-primary)]">
                Drop your video(s) here
              </p>
              <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
                or click to browse — MP4, MOV, MKV supported
              </p>
            </>
          )}
        </div>
      </div>

      {/* Options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Processing Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  360° Video
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Enable for equirectangular / fisheye footage
                </p>
              </div>
              <Switch
                checked={is360}
                onCheckedChange={setIs360}
                id="is-360"
              />
            </div>
            <div className="h-px bg-[var(--color-border)]" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  Mask People
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Automatically remove people from the reconstruction
                </p>
              </div>
              <Switch
                checked={maskPeople}
                onCheckedChange={setMaskPeople}
                id="mask-people"
              />
            </div>
          </div>

          {/* Quality Preset */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Quality Preset</p>
            <div className="grid grid-cols-3 gap-2">
              {qualityOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setQuality(opt.value)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-all',
                    quality === opt.value
                      ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]'
                      : 'border-[var(--color-border)] hover:border-[var(--color-primary-300)]'
                  )}
                >
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      quality === opt.value
                        ? 'text-[var(--color-primary-700)]'
                        : 'text-[var(--color-text-primary)]'
                    )}
                  >
                    {opt.label}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={files.length === 0 || !title.trim() || isLoading}
      >
        {isLoading ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            Starting Pipeline…
          </>
        ) : (
          <>
            <Brain className="h-4 w-4" />
            ▶ Start Pipeline
          </>
        )}
      </Button>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function SplatLabPage() {
  const navigate = useNavigate();
  const { job, jobs, isCreating, stages: _stages, createAndStart, selectJob, clearJob, error } =
    useSplatPipeline();

  const hasJobs = jobs.length > 0;
  const pastJobs = jobs.filter((j) => j.id !== job?.id);

  const handleFormSubmit = (
    data: { title: string; is360: boolean; maskPeople: boolean; quality: QualityPreset },
    files: File[]
  ) => {
    void createAndStart(
      {
        title: data.title,
        is_360_video: data.is360,
        mask_people: data.maskPeople,
        quality_preset: data.quality,
      },
      files
    );
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* ── Gradient Header ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--color-primary-600)] via-[var(--color-primary-500)] to-[var(--color-secondary-500)] p-6 text-white shadow-lg">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%23ffffff%22 fill-opacity=%220.05%22%3E%3Ccircle cx=%2230%22 cy=%2230%22 r=%2220%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-40" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">🧪 Splat Lab</h1>
            <p className="mt-1 text-sm text-white/80">
              Convert 360° video into an immersive Gaussian Splat — no GPU setup required.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20"
              onClick={() => navigate(ROUTES.LAB_KITCHEN_TOUR)}
            >
              <Crosshair className="h-4 w-4" />
              Kitchen tour (constrained)
            </Button>
            {hasJobs && !job && (
              <Button
                variant="outline"
                size="sm"
                className="border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20"
                onClick={() => selectJob(jobs[0])}
              >
                <Plus className="h-4 w-4" />
                New Job
              </Button>
            )}
          </div>
        </div>

        {/* Subtle stats strip */}
        {hasJobs && (
          <div className="relative mt-4 flex gap-6 border-t border-white/20 pt-4">
            <div>
              <p className="text-lg font-bold">{jobs.length}</p>
              <p className="text-xs text-white/70">Total Jobs</p>
            </div>
            <div>
              <p className="text-lg font-bold">
                {jobs.filter((j) => j.status === 'ready').length}
              </p>
              <p className="text-xs text-white/70">Completed</p>
            </div>
            <div>
              <p className="text-lg font-bold">
                {jobs.filter((j) => j.status === 'failed').length}
              </p>
              <p className="text-xs text-white/70">Failed</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Main Content ── */}
      {job ? (
        <ActiveJobView job={job} onClear={clearJob} />
      ) : (
        <div className="space-y-8">
          {/* Empty state headline */}
          {!hasJobs && (
            <div className="py-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-primary-50)]">
                <Brain className="h-8 w-8 text-[var(--color-primary-600)]" />
              </div>
              <h2 className="mt-4 text-xl font-bold text-[var(--color-text-primary)]">
                Start your first Splat
              </h2>
              <p className="mt-2 text-[var(--color-text-muted)]">
                Upload a 360° video and we'll turn it into a navigable Gaussian Splat.
              </p>
            </div>
          )}

          <CreateJobForm onSubmit={handleFormSubmit} isLoading={isCreating} />
        </div>
      )}

      {/* ── Past Jobs ── */}
      {pastJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">
            Previous Jobs
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pastJobs.map((j) => (
              <div key={j.id} className="relative">
                <PastJobCard job={j} onSelect={selectJob} />
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const { labApi: api } = await import('@/api/lab');
                      await api.deleteJob(j.id);
                      window.location.reload();
                    } catch {
                      // Ignore
                    }
                  }}
                  className="absolute right-10 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-text-muted)] opacity-0 transition-opacity hover:text-[var(--color-error-600)] group-hover:opacity-100"
                  aria-label="Delete job"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
