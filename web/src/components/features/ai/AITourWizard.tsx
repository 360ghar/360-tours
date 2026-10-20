import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Sparkles,
  Upload,
  X,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  Loader2,
  Route,
  Map,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Textarea,
  Switch,
  Label,
  ScrollArea,
  Progress,
  Badge,
} from '@/components/ui';
import { cn } from '@/utils';
import { useToast } from '@/hooks';
import { confirm, useAuthStore } from '@/stores';
import { AIJobStatus } from './AIJobStatus';
import { aiApi, toursApi, readTourGenerationResult, type GeneratedTourSummary } from '@/api';
import { removeAccountItem, readAccountItem, writeAccountItem } from '@/lib/accountStorage';
import { API_LIMITS } from '@/lib/api/limits.gen';
import {
  SCENE_UPLOAD_ACCEPT,
  SCENE_UPLOAD_MAX_FILE_COUNT,
  SCENE_UPLOAD_MAX_SIZE_MB,
  validateSceneUploadFile,
} from '@/lib/sceneUpload';

interface AITourWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the id of the generated tour when the user finishes the review step. */
  onComplete: (tourId: string) => void;
}

type WizardStep = 'upload' | 'details' | 'options' | 'processing' | 'review';

interface UploadedImage {
  id: string;
  file: File;
  preview: string;
}

/**
 * The in-flight AI job id is kept in account-scoped session storage (see
 * `lib/accountStorage`). Closing the wizard while a job runs keeps the job
 * alive server-side (it is not cancellable by closing the dialog); the id is
 * persisted so reopening offers to resume monitoring it. Sign-out purges it.
 */
function persistPendingJob(userId: number | undefined, jobId: string | null): void {
  if (jobId) {
    writeAccountItem('aiPendingJob', userId, jobId);
  } else {
    removeAccountItem('aiPendingJob', userId);
  }
}

/** `place_hotspots` is sent as `spatial`: doorway detection places the navigation hotspots. */
const DEFAULT_OPTIONS = {
  generate_titles: true,
  place_hotspots: true,
  generate_descriptions: true,
};

export function AITourWizard({ open, onOpenChange, onComplete }: AITourWizardProps) {
  const { error: toastError } = useToast();
  const userId = useAuthStore(s => s.user?.id);
  const [step, setStep] = useState<WizardStep>('upload');
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedTourSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSketchingPlan, setIsSketchingPlan] = useState(false);
  const [hasSketch, setHasSketch] = useState(false);
  const imagesRef = useRef<UploadedImage[]>([]);
  // Set when the user starts a new generation: a saved-job status check that is
  // still pending must then be ignored, or it would overwrite the new run.
  const newGenerationRef = useRef(false);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach(img => URL.revokeObjectURL(img.preview));
    };
  }, []);

  // Handle image drop
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const validatedFiles = acceptedFiles.map(file => ({
        file,
        validation: validateSceneUploadFile(file),
      }));
      const invalidFiles = validatedFiles.filter(item => !item.validation.valid);
      const validFiles = validatedFiles
        .filter(item => item.validation.valid)
        .map(item => item.file);

      // Enforce total file count (including already-selected images)
      const projectedCount = images.length + validFiles.length;
      const allowedNewFiles =
        projectedCount > SCENE_UPLOAD_MAX_FILE_COUNT
          ? validFiles.slice(0, Math.max(0, SCENE_UPLOAD_MAX_FILE_COUNT - images.length))
          : validFiles;

      // Combine ALL rejection reasons into one message. The previous version
      // called setError twice in sequence, so the count-cap error silently
      // overwrote the oversized-rejection error and the user had no idea why
      // their files were dropped.
      const errors: string[] = [];
      if (invalidFiles.length > 0) {
        const messages = Array.from(
          new Set(invalidFiles.map(item => item.validation.error || 'Invalid file'))
        );
        errors.push(
          `${invalidFiles.length} file${invalidFiles.length !== 1 ? 's' : ''} ${invalidFiles.length !== 1 ? 'were' : 'was'} removed. ${messages.join(' ')}`
        );
      }
      if (projectedCount > SCENE_UPLOAD_MAX_FILE_COUNT) {
        errors.push(
          `Maximum ${SCENE_UPLOAD_MAX_FILE_COUNT} files allowed. Only ${allowedNewFiles.length} of ${validFiles.length} file${validFiles.length !== 1 ? 's' : ''} were added.`
        );
      }
      if (errors.length > 0) {
        setError(errors.join(' '));
      } else {
        setError(null);
      }

      if (allowedNewFiles.length === 0) return;

      const newImages = allowedNewFiles.map(file => ({
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        file,
        preview: URL.createObjectURL(file),
      }));
      setImages(prev => [...prev, ...newImages]);
    },
    [images.length]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: SCENE_UPLOAD_ACCEPT,
    multiple: true,
  });

  const removeImage = (id: string) => {
    setImages(prev => {
      const image = prev.find(img => img.id === id);
      if (image) {
        URL.revokeObjectURL(image.preview);
      }
      return prev.filter(img => img.id !== id);
    });
  };

  const handleNext = () => {
    switch (step) {
      case 'upload':
        setStep('details');
        break;
      case 'details':
        setStep('options');
        break;
      case 'options':
        handleStartGeneration();
        break;
      case 'review':
        handleComplete();
        break;
    }
  };

  const handleBack = () => {
    switch (step) {
      case 'details':
        setStep('upload');
        break;
      case 'options':
        setStep('details');
        break;
    }
  };

  const handleStartGeneration = async () => {
    newGenerationRef.current = true;
    setStep('processing');
    setError(null);

    try {
      const response = await aiApi.generateTour(
        {
          images: images.map(img => img.file),
          title: title || undefined,
          description: description || undefined,
          generate_titles: options.generate_titles,
          generate_descriptions: options.generate_descriptions,
          spatial: options.place_hotspots,
        },
        setUploadProgress
      );
      setJobId(response.job.id);
      persistPendingJob(userId, response.job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start tour generation');
      setStep('options');
    }
  };

  const handleJobComplete = (job: unknown, jobResult: unknown) => {
    setJobId(null);
    persistPendingJob(userId, null);
    // generate_tour result: {tour_id, tour, scenes[], generated[], created_hotspots[]}
    const generated = readTourGenerationResult(jobResult);
    if (generated) {
      setResult(generated);
      setStep('review');
      return;
    }

    const message = 'Tour generation finished, but the generated tour data was not returned.';
    setError(message);
    setStep('options');
    toastError(message, { title: 'Tour generation incomplete' });
  };

  const handleJobError = (job: unknown, errorMessage: string) => {
    setJobId(null);
    persistPendingJob(userId, null);
    setError(errorMessage);
    setStep('options');
    toastError(errorMessage, { title: 'Tour generation failed' });
  };

  // The tour exists by now, so the plan can be sketched from its rooms and
  // doorway links without leaving the wizard.
  const handleSketchFloorPlan = async () => {
    if (!result) return;
    setIsSketchingPlan(true);
    try {
      await toursApi.generateFloorPlan(result.tour_id);
      setHasSketch(true);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Could not sketch a floor plan.', {
        title: 'Floor plan failed',
      });
    } finally {
      setIsSketchingPlan(false);
    }
  };
  const handleComplete = () => {
    if (result) {
      onComplete(result.tour_id);
      handleClose();
    }
  };

  const handleClose = async () => {
    // A running job is not cancelled by closing the dialog — it keeps
    // processing server-side. Confirm the user really wants to close, and keep
    // the job id persisted so reopening offers to resume monitoring it.
    if (jobId) {
      const shouldClose = await confirm({
        title: 'AI job in progress',
        message: 'The AI job keeps running in the background. You can close this and check later.',
        confirmLabel: 'Close anyway',
        cancelLabel: 'Keep waiting',
      });
      if (!shouldClose) {
        return;
      }
    }

    // Cleanup
    images.forEach(img => URL.revokeObjectURL(img.preview));
    setImages([]);
    setTitle('');
    setDescription('');
    setOptions(DEFAULT_OPTIONS);
    setStep('upload');
    setJobId(null);
    setResult(null);
    setError(null);
    setUploadProgress(0);
    // Persist (or clear) the in-flight job id — done last so an async close
    // never races the resume effect on the next open.
    // Only ever write a live id here. With no jobId, a saved id may still be
    // waiting on its status check and must survive the close; finished jobs
    // clear their own id.
    if (jobId) persistPendingJob(userId, jobId);
    onOpenChange(false);
  };

  const canProceed = () => {
    switch (step) {
      case 'upload':
        return images.length > 0;
      case 'details':
        return true; // Title and description are optional
      case 'options':
        return true;
      case 'review':
        return result !== null;
      default:
        return false;
    }
  };

  const getStepNumber = () => {
    const steps: WizardStep[] = ['upload', 'details', 'options', 'processing', 'review'];
    return steps.indexOf(step) + 1;
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }

    void handleClose();
  };

  // On reopen, look for a persisted in-flight job (closed-while-running) and
  // offer to resume: jump back to the processing step for live status, or
  // collect the result/error if it finished while the dialog was closed.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    newGenerationRef.current = false;
    const saved = readAccountItem('aiPendingJob', userId);
    if (!saved) return;

    (async () => {
      try {
        const response = await aiApi.getJobStatus(saved);
        if (cancelled || newGenerationRef.current) return;
        const status = response.job.status;
        if (status === 'completed') {
          const generated = readTourGenerationResult(response.result);
          persistPendingJob(userId, null);
          if (generated) {
            setResult(generated);
            setJobId(null);
            setStep('review');
          } else {
            setError('Tour generation finished without usable results.');
            setStep('options');
          }
        } else if (status === 'failed' || status === 'cancelled') {
          persistPendingJob(userId, null);
          setError(
            response.job.error_message ||
              (status === 'cancelled' ? 'Processing was cancelled' : 'Processing failed')
          );
          setStep('options');
        } else {
          // Still running — resume live monitoring.
          setJobId(saved);
          setStep('processing');
        }
      } catch {
        // Status check failed (network/backend down). Keep the persisted id so
        // the user can reopen and try again.
        if (!cancelled && !newGenerationRef.current) {
          setError(
            'Could not check the status of your previous AI job. Reopen the wizard to try again.'
          );
          setStep('options');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--color-primary-500)]" />
            AI Tour Generation
          </DialogTitle>
          <DialogDescription>
            Create a complete virtual tour from your 360° images using AI.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 py-4">
          {['Upload', 'Details', 'Options', 'Processing', 'Review'].map((label, index) => (
            <div key={label} className="flex items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                  getStepNumber() > index + 1
                    ? 'bg-[var(--color-success-500)] text-white'
                    : getStepNumber() === index + 1
                      ? 'bg-[var(--color-primary-500)] text-white'
                      : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]'
                )}
              >
                {getStepNumber() > index + 1 ? <Check className="h-4 w-4" /> : index + 1}
              </div>
              {index < 4 && (
                <div
                  className={cn(
                    'w-8 h-0.5 mx-1',
                    getStepNumber() > index + 1
                      ? 'bg-[var(--color-success-500)]'
                      : 'bg-[var(--color-border)]'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {/* Step 1: Upload Images */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                {...getRootProps()}
                className={cn(
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                  isDragActive
                    ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary-300)]'
                )}
              >
                <input {...getInputProps()} />
                <Upload className="h-10 w-10 mx-auto text-[var(--color-text-muted)] mb-3" />
                <p className="font-medium">
                  {isDragActive ? 'Drop your images here' : 'Drag & drop 360° images'}
                </p>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  or click to select files (JPG, PNG, WebP). Max {SCENE_UPLOAD_MAX_SIZE_MB}MB per
                  file, up to {SCENE_UPLOAD_MAX_FILE_COUNT} files.
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-md bg-[var(--color-error-50)] text-[var(--color-error-600)] text-sm flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {images.length > 0 && (
                <div>
                  <Label className="mb-2 block">
                    {images.length} image{images.length !== 1 ? 's' : ''} selected
                  </Label>
                  <ScrollArea className="h-[200px]">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {images.map(image => (
                        <div key={image.id} className="relative group">
                          <img
                            src={image.preview}
                            alt="Preview"
                            className="w-full h-20 object-cover rounded"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(image.id)}
                            className="absolute top-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                            aria-label={`Remove ${image.file.name}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Tour Details */}
          {step === 'details' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Tour Title (optional)</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g., Modern Downtown Apartment"
                  maxLength={API_LIMITS.tour.titleMax}
                />
                <p className="text-xs text-[var(--color-text-muted)]">
                  Leave blank to let AI generate a title based on your images
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe your property or space..."
                  rows={4}
                  maxLength={API_LIMITS.tour.descriptionMax}
                />
                <p className="text-xs text-[var(--color-text-muted)]">
                  Add details to help AI understand your space better
                </p>
              </div>

              {/* Preview of uploaded images */}
              <div className="pt-4 border-t border-[var(--color-border)]">
                <Label className="mb-2 block">Images to process</Label>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {images.slice(0, 6).map(image => (
                    <img
                      key={image.id}
                      src={image.preview}
                      alt="Preview"
                      className="w-16 h-12 object-cover rounded shrink-0"
                    />
                  ))}
                  {images.length > 6 && (
                    <div className="w-16 h-12 rounded bg-[var(--color-surface-elevated)] flex items-center justify-center shrink-0">
                      <span className="text-sm text-[var(--color-text-muted)]">
                        +{images.length - 6}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: AI Options */}
          {step === 'options' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-[var(--color-border)]">
                <div>
                  <Label>Generate Scene Titles</Label>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    AI will name each scene after the room it shows
                  </p>
                </div>
                <Switch
                  id="ai-generate-titles"
                  aria-label="Generate scene titles"
                  checked={options.generate_titles}
                  onCheckedChange={checked =>
                    setOptions(prev => ({ ...prev, generate_titles: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between py-3 border-b border-[var(--color-border)]">
                <div>
                  <Label>Auto-Place Hotspots</Label>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    AI will create navigation links between scenes
                  </p>
                </div>
                <Switch
                  id="ai-auto-place-hotspots"
                  aria-label="Auto-place hotspots"
                  checked={options.place_hotspots}
                  onCheckedChange={checked =>
                    setOptions(prev => ({ ...prev, place_hotspots: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between py-3">
                <div>
                  <Label>Generate Descriptions</Label>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    AI will write descriptions for each scene
                  </p>
                </div>
                <Switch
                  id="ai-generate-descriptions"
                  aria-label="Generate descriptions"
                  checked={options.generate_descriptions}
                  onCheckedChange={checked =>
                    setOptions(prev => ({ ...prev, generate_descriptions: checked }))
                  }
                />
              </div>

              {error && (
                <div className="p-3 rounded-md bg-[var(--color-error-50)] text-[var(--color-error-600)] text-sm flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Summary */}
              <div className="mt-4 p-4 rounded-lg bg-[var(--color-surface-elevated)]">
                <h4 className="font-medium mb-2">Summary</h4>
                <ul className="text-sm text-[var(--color-text-muted)] space-y-1">
                  <li>• {images.length} images to process</li>
                  {title && <li>• Title: {title}</li>}
                  <li>• Scene titles: {options.generate_titles ? 'Enabled' : 'Disabled'}</li>
                  <li>• Auto hotspots: {options.place_hotspots ? 'Enabled' : 'Disabled'}</li>
                  <li>• Descriptions: {options.generate_descriptions ? 'Enabled' : 'Disabled'}</li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 4: Processing */}
          {step === 'processing' && (
            <div className="py-8">
              {uploadProgress < 100 && !jobId && (
                <div className="space-y-4">
                  <div className="flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-500)]" />
                  </div>
                  <p className="text-center font-medium">Uploading images...</p>
                  <Progress value={uploadProgress} />
                  <p className="text-center text-sm text-[var(--color-text-muted)]">
                    {uploadProgress}% complete
                  </p>
                </div>
              )}

              {jobId && (
                <AIJobStatus
                  jobId={jobId}
                  onComplete={handleJobComplete}
                  onError={handleJobError}
                  showCancelButton={true}
                  onCancel={() => {
                    setJobId(null);
                    persistPendingJob(userId, null);
                    setStep('options');
                  }}
                />
              )}
            </div>
          )}

          {/* Step 5: Review */}
          {step === 'review' && result && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-[var(--color-success-50)] text-[var(--color-success-600)] flex items-start gap-3">
                <Check className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Tour Generated Successfully!</p>
                  <p className="text-sm mt-1">
                    Created {result.scenes.length} scenes with AI-generated content.
                  </p>
                </div>
              </div>

              {result.title && (
                <div className="space-y-2">
                  <Label>Tour Title</Label>
                  <p className="font-medium">{result.title}</p>
                </div>
              )}

              {result.scenes.length > 0 && (
                <div>
                  <Label className="mb-2 block">Generated Scenes</Label>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {result.scenes.map((scene, index) => (
                        <div
                          key={scene.id}
                          className="flex items-center gap-3 p-2 rounded-lg bg-[var(--color-surface-elevated)]"
                        >
                          <div className="w-16 h-12 rounded overflow-hidden bg-[var(--color-surface)]">
                            <img
                              src={scene.thumbnail_url || scene.image_url}
                              alt={scene.title || `Scene ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {scene.title || `Scene ${index + 1}`}
                            </p>
                            {scene.description && (
                              <p className="text-xs text-[var(--color-text-muted)] truncate">
                                {scene.description}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {result.spatial_summary && (
                <div className="p-3 rounded-lg border border-[var(--color-border)] space-y-2">
                  <div className="flex items-center gap-2">
                    <Route className="h-4 w-4 text-[var(--color-primary-500)]" />
                    <Label>Room Connections</Label>
                    <Badge variant="secondary" className="text-xs">
                      {result.spatial_summary.linkCount} link
                      {result.spatial_summary.linkCount !== 1 ? 's' : ''} across{' '}
                      {result.spatial_summary.sceneCount} room
                      {result.spatial_summary.sceneCount !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  {result.spatial_summary.warnings.length > 0 ? (
                    <ul className="space-y-1" role="status">
                      {result.spatial_summary.warnings.map(warning => (
                        <li
                          key={warning}
                          className="flex items-start gap-2 text-sm text-[var(--color-warning-500)]"
                        >
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{warning}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[var(--color-text-muted)]">
                      Every room is reachable and every link has a way back. You can adjust the
                      links in the editor after saving.
                    </p>
                  )}
                </div>
              )}

              <div className="p-3 rounded-lg border border-[var(--color-border)] flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Floor plan</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    {hasSketch
                      ? 'Sketch added. Open Floor Plans in the editor to adjust it.'
                      : 'Sketch a schematic plan from these rooms and doorways. Optional, and you can adjust it later.'}
                  </p>
                </div>
                {hasSketch ? (
                  <Badge variant="secondary" className="shrink-0 gap-1">
                    <Check className="h-3 w-3" />
                    Added
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={handleSketchFloorPlan}
                    isLoading={isSketchingPlan}
                  >
                    <Map className="h-4 w-4" />
                    Sketch plan
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4 pt-4 border-t border-[var(--color-border)]">
          {step !== 'processing' && (
            <>
              {step !== 'upload' && step !== 'review' && (
                <Button variant="outline" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
              {step === 'upload' && (
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
              )}
              <Button onClick={handleNext} disabled={!canProceed()}>
                {step === 'review' ? (
                  <>
                    <Check className="h-4 w-4" />
                    Complete
                  </>
                ) : step === 'options' ? (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Tour
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
