import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  Film,
  RefreshCw,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Checkbox,
  ScrollArea,
  Slider,
} from '@/components/ui';
import { VideoPlayer } from '@/components/features/VideoPlayer';
import { copyToClipboard } from '@/utils';
import { aiApi } from '@/api';
import type { ReelResult } from '@/api';
import type { AIProcessingJob, Scene } from '@/types';
import { AIJobStatus } from './AIJobStatus';

interface ReelGeneratorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tourId: string;
  scenes: Scene[];
}

type ReelStep = 'configure' | 'generating' | 'done' | 'error';

const DEFAULT_SCENE_DURATION = 3;
const MIN_SCENE_DURATION = 2;
const MAX_SCENE_DURATION = 6;

/**
 * Build a Cloudinary download URL that forces the browser to save the file
 */
function buildDownloadUrl(videoUrl: string) {
  return videoUrl.replace('/upload/', '/upload/fl_attachment/');
}

function isReelResult(value: unknown): value is ReelResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ReelResult>;
  return (
    typeof candidate.video_url === 'string' &&
    typeof candidate.duration_seconds === 'number' &&
    typeof candidate.scene_count === 'number'
  );
}

export function ReelGeneratorModal({
  open,
  onOpenChange,
  tourId,
  scenes,
}: ReelGeneratorModalProps) {
  const [step, setStep] = useState<ReelStep>('configure');
  const [orderedSceneIds, setOrderedSceneIds] = useState<string[]>([]);
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(new Set());
  const [sceneDuration, setSceneDuration] = useState(DEFAULT_SCENE_DURATION);
  const [isStarting, setIsStarting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<ReelResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const initializeScenes = useCallback(() => {
    const sorted = [...scenes].sort((a, b) => a.order_index - b.order_index);
    setOrderedSceneIds(sorted.map((s) => s.id));
    setSelectedSceneIds(new Set(sorted.map((s) => s.id)));
  }, [scenes]);

  const resetState = useCallback(() => {
    setStep('configure');
    setSceneDuration(DEFAULT_SCENE_DURATION);
    setIsStarting(false);
    setJobId(null);
    setResult(null);
    setErrorMessage(null);
    setCopied(false);
    clearTimeout(copiedTimerRef.current);
    initializeScenes();
  }, [initializeScenes]);

  // Initialize scene order/selection when the modal opens
  useEffect(() => {
    if (open) {
      initializeScenes();
    }
  }, [open, initializeScenes]);

  // Clear copy timer on unmount
  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState();
    }
    onOpenChange(nextOpen);
  };

  const handleToggleScene = (sceneId: string) => {
    setSelectedSceneIds((prev) => {
      const next = new Set(prev);
      if (next.has(sceneId)) {
        next.delete(sceneId);
      } else {
        next.add(sceneId);
      }
      return next;
    });
  };

  const handleMoveScene = (sceneId: string, direction: -1 | 1) => {
    setOrderedSceneIds((prev) => {
      const index = prev.indexOf(sceneId);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const handleGenerate = async () => {
    const sceneIds = orderedSceneIds.filter((id) => selectedSceneIds.has(id));
    if (sceneIds.length === 0) return;

    setIsStarting(true);
    setErrorMessage(null);
    try {
      const response = await aiApi.generateReel(tourId, {
        scene_ids: sceneIds,
        scene_duration: sceneDuration,
      });
      setJobId(response.job.id);
      setStep('generating');
    } catch (error) {
      console.error('Failed to start reel generation:', error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Failed to start reel generation. Please try again.'
      );
      setStep('error');
    } finally {
      setIsStarting(false);
    }
  };

  const handleJobComplete = (job: AIProcessingJob, jobResult: unknown) => {
    const resultCandidate = isReelResult(jobResult) ? jobResult : job.output_data;

    if (isReelResult(resultCandidate)) {
      setResult(resultCandidate);
      setJobId(null);
      setErrorMessage(null);
      setStep('done');
      return;
    }

    setJobId(null);
    setErrorMessage('Reel generation finished, but the video result was not returned.');
    setStep('error');
  };

  const handleJobError = (job: AIProcessingJob | null, message: string) => {
    setErrorMessage(message || 'Reel generation failed');
    setJobId(null);
    setStep('error');
  };

  const handleCopyLink = async () => {
    if (!result) return;
    const success = await copyToClipboard(result.video_url);
    if (success) {
      setCopied(true);
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCreateAnother = () => {
    setJobId(null);
    setResult(null);
    setErrorMessage(null);
    setCopied(false);
    setStep('configure');
  };

  const getScene = (sceneId: string) => scenes.find((s) => s.id === sceneId);

  const selectedCount = selectedSceneIds.size;
  const estimatedDuration = Math.round(selectedCount * sceneDuration);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="h-5 w-5 text-[var(--color-primary-500)]" />
            Create 360 Reel
          </DialogTitle>
          <DialogDescription>
            Turn your tour into a vertical video reel, ready to share on social media.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Configure */}
          {step === 'configure' && (
            <div className="flex flex-col gap-4">
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {orderedSceneIds.map((sceneId, index) => {
                    const scene = getScene(sceneId);
                    if (!scene) return null;
                    const isSelected = selectedSceneIds.has(sceneId);

                    return (
                      <div
                        key={sceneId}
                        className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-2"
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleScene(sceneId)}
                          aria-label={`Include ${scene.title || `Scene ${scene.order_index + 1}`}`}
                        />
                        <div className="w-16 h-10 rounded overflow-hidden shrink-0 bg-[var(--color-surface)]">
                          <img
                            src={scene.thumbnail_url || scene.image_url}
                            alt={scene.title || 'Scene'}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="flex-1 min-w-0 truncate text-sm font-medium">
                          {scene.title || `Scene ${scene.order_index + 1}`}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={index === 0}
                            onClick={() => handleMoveScene(sceneId, -1)}
                            aria-label="Move scene up"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={index === orderedSceneIds.length - 1}
                            onClick={() => handleMoveScene(sceneId, 1)}
                            aria-label="Move scene down"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Seconds per scene</span>
                  <span className="text-sm text-[var(--color-text-muted)]">{sceneDuration}s</span>
                </div>
                <Slider
                  value={sceneDuration}
                  onValueChange={setSceneDuration}
                  min={MIN_SCENE_DURATION}
                  max={MAX_SCENE_DURATION}
                  step={1}
                  aria-label="Seconds per scene"
                />
              </div>

              <p className="text-sm text-[var(--color-text-muted)]">
                {selectedCount} scene{selectedCount !== 1 ? 's' : ''} · ~{estimatedDuration}s reel
              </p>
            </div>
          )}

          {/* Generating */}
          {step === 'generating' && (
            <div className="py-8 px-4">
              {jobId ? (
                <AIJobStatus
                  jobId={jobId}
                  onComplete={handleJobComplete}
                  onError={handleJobError}
                  onCancel={() => {
                    setJobId(null);
                    setStep('configure');
                  }}
                />
              ) : (
                <p className="text-center text-sm text-[var(--color-text-muted)]">
                  Starting reel generation...
                </p>
              )}
            </div>
          )}

          {/* Done */}
          {step === 'done' && result && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="w-full max-w-[280px]">
                <div className="aspect-[9/16] max-h-[55vh] mx-auto">
                  <VideoPlayer
                    src={result.video_url}
                    poster={result.thumbnail_url}
                    className="h-full w-full"
                  />
                </div>
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">
                {result.scene_count} scene{result.scene_count !== 1 ? 's' : ''} ·{' '}
                {Math.round(result.duration_seconds)}s · {result.width}×{result.height}
              </p>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="flex flex-col items-center justify-center gap-4 py-12 px-4 text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--color-error-50)] flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-[var(--color-error-500)]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-1">Reel generation failed</h3>
                <p className="text-sm text-[var(--color-text-muted)] max-w-md">
                  {errorMessage || 'Something went wrong while creating your reel.'}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4 pt-4 border-t border-[var(--color-border)]">
          {step === 'configure' && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={selectedCount === 0}
                isLoading={isStarting}
              >
                <Film className="h-4 w-4" />
                Generate Reel
              </Button>
            </>
          )}

          {step === 'done' && result && (
            <>
              <Button variant="ghost" onClick={handleCreateAnother}>
                <RefreshCw className="h-4 w-4" />
                Create another
              </Button>
              <Button variant="outline" asChild>
                <a href={buildDownloadUrl(result.video_url)} download>
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </Button>
              <Button variant="outline" onClick={handleCopyLink}>
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-[var(--color-success-500)]" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy link
                  </>
                )}
              </Button>
              <Button onClick={() => handleOpenChange(false)}>Close</Button>
            </>
          )}

          {step === 'error' && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
              <Button onClick={() => setStep('configure')}>
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
