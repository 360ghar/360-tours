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
} from '@/components/ui';
import { cn } from '@/utils';
import { useToast } from '@/hooks';
import { AIJobStatus } from './AIJobStatus';
import { aiApi, toursApi } from '@/api';
import {
  SCENE_UPLOAD_ACCEPT,
  SCENE_UPLOAD_MAX_FILE_COUNT,
  SCENE_UPLOAD_MAX_SIZE_MB,
  validateSceneUploadFile,
} from '@/lib/sceneUpload';
import type { Tour, Scene } from '@/types';

interface AITourWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (tour: Tour, scenes: Scene[]) => void;
}

type WizardStep = 'upload' | 'details' | 'options' | 'processing' | 'review';

interface UploadedImage {
  id: string;
  file: File;
  preview: string;
}

export function AITourWizard({ open, onOpenChange, onComplete }: AITourWizardProps) {
  const { error: toastError } = useToast();
  const [step, setStep] = useState<WizardStep>('upload');
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState({
    auto_detect_rooms: true,
    auto_place_hotspots: true,
    auto_generate_descriptions: true,
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [generatedTourId, setGeneratedTourId] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [result, setResult] = useState<{ tour?: Tour; scenes?: Scene[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imagesRef = useRef<UploadedImage[]>([]);

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
    setStep('processing');
    setError(null);
    setGeneratedTourId(null);

    try {
      const response = await aiApi.generateTour(
        {
          images: images.map(img => img.file),
          title: title || undefined,
          description: description || undefined,
          auto_detect_rooms: options.auto_detect_rooms,
          auto_place_hotspots: options.auto_place_hotspots,
          auto_generate_descriptions: options.auto_generate_descriptions,
        },
        setUploadProgress
      );
      setJobId(response.job.id);
      setGeneratedTourId(response.tour_id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start tour generation');
      setStep('options');
    }
  };

  const handleJobComplete = async (_job: unknown, jobResult: unknown) => {
    setJobId(null);
    let parsedResult: unknown = jobResult;

    if (typeof parsedResult === 'string') {
      try {
        parsedResult = JSON.parse(parsedResult);
      } catch {
        parsedResult = null;
      }
    }

    const data =
      parsedResult && typeof parsedResult === 'object'
        ? (parsedResult as { tour_id?: string; tour?: Tour; scenes?: Scene[] })
        : {};
    const tourId = data.tour_id ?? generatedTourId;

    if (!tourId && (!data.tour || !Array.isArray(data.scenes))) {
      const message = 'Tour generation finished without usable results.';
      setError(message);
      setStep('options');
      toastError(message, { title: 'Tour generation incomplete' });
      return;
    }

    setIsFinalizing(true);
    try {
      let tour = data.tour;
      let scenes = data.scenes;

      // The backend returns the created tour ID immediately and the completed
      // job result may contain only that ID. Fetch the canonical records before
      // showing the review step.
      if (tourId) {
        try {
          [tour, scenes] = await Promise.all([
            toursApi.getTour(tourId),
            toursApi.getScenes(tourId),
          ]);
        } catch {
          // A complete result payload is still usable if the follow-up fetch
          // temporarily fails.
          if (!tour || !Array.isArray(scenes)) throw new Error('Tour records could not be loaded');
        }
      }

      if (!tour || !Array.isArray(scenes)) {
        throw new Error('Generated tour data was not returned');
      }

      setResult({ tour, scenes });
      setStep('review');
    } catch {
      const message = 'Tour generation finished, but the generated tour data could not be loaded.';
      setError(message);
      setStep('options');
      toastError(message, { title: 'Tour generation incomplete' });
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleJobError = (job: unknown, errorMessage: string) => {
    setJobId(null);
    setGeneratedTourId(null);
    setError(errorMessage);
    setStep('options');
    toastError(errorMessage, { title: 'Tour generation failed' });
  };

  const handleComplete = () => {
    if (result?.tour && result?.scenes) {
      onComplete(result.tour, result.scenes);
      handleClose();
    }
  };

  const handleClose = () => {
    // Cleanup
    images.forEach(img => URL.revokeObjectURL(img.preview));
    setImages([]);
    setTitle('');
    setDescription('');
    setOptions({
      auto_detect_rooms: true,
      auto_place_hotspots: true,
      auto_generate_descriptions: true,
    });
    setStep('upload');
    setJobId(null);
    setGeneratedTourId(null);
    setResult(null);
    setError(null);
    setUploadProgress(0);
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
        return result?.tour && result?.scenes;
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

    handleClose();
  };

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
                  <Label>Auto-Detect Room Types</Label>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    AI will identify and label each room automatically
                  </p>
                </div>
                <Switch
                  id="ai-auto-detect-rooms"
                  aria-label="Auto-detect room types"
                  checked={options.auto_detect_rooms}
                  onCheckedChange={checked =>
                    setOptions(prev => ({ ...prev, auto_detect_rooms: checked }))
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
                  checked={options.auto_place_hotspots}
                  onCheckedChange={checked =>
                    setOptions(prev => ({ ...prev, auto_place_hotspots: checked }))
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
                  checked={options.auto_generate_descriptions}
                  onCheckedChange={checked =>
                    setOptions(prev => ({ ...prev, auto_generate_descriptions: checked }))
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
                  <li>• Room detection: {options.auto_detect_rooms ? 'Enabled' : 'Disabled'}</li>
                  <li>• Auto hotspots: {options.auto_place_hotspots ? 'Enabled' : 'Disabled'}</li>
                  <li>
                    • Descriptions: {options.auto_generate_descriptions ? 'Enabled' : 'Disabled'}
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 4: Processing */}
          {step === 'processing' && (
            <div className="py-8">
              {uploadProgress < 100 && !jobId && !isFinalizing && (
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

              {jobId && !isFinalizing && (
                <AIJobStatus
                  jobId={jobId}
                  onComplete={handleJobComplete}
                  onError={handleJobError}
                  showCancelButton={true}
                  onCancel={() => {
                    setJobId(null);
                    setStep('options');
                  }}
                />
              )}

              {isFinalizing && (
                <div className="space-y-4 py-8">
                  <div className="flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-500)]" />
                  </div>
                  <p className="text-center font-medium">Loading your generated tour...</p>
                  <p className="text-center text-sm text-[var(--color-text-muted)]">
                    Fetching the latest scenes and AI-generated navigation.
                  </p>
                </div>
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
                    Created {result.scenes?.length || 0} scenes with AI-generated content.
                  </p>
                </div>
              </div>

              {result.tour && (
                <div className="space-y-2">
                  <Label>Tour Title</Label>
                  <p className="font-medium">{result.tour.title}</p>
                </div>
              )}

              {result.scenes && result.scenes.length > 0 && (
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
