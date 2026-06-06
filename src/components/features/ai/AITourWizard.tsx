import { useState, useCallback } from 'react';
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
import { aiApi } from '@/api';
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
  const [result, setResult] = useState<{ tour?: Tour; scenes?: Scene[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handle image drop
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newImages = acceptedFiles.map((file) => ({
      id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      file,
      preview: URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...newImages]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.webp'],
    },
    multiple: true,
  });

  const removeImage = (id: string) => {
    setImages((prev) => {
      const image = prev.find((img) => img.id === id);
      if (image) {
        URL.revokeObjectURL(image.preview);
      }
      return prev.filter((img) => img.id !== id);
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

    try {
      const response = await aiApi.generateTour(
        {
          images: images.map((img) => img.file),
          title: title || undefined,
          description: description || undefined,
          auto_detect_rooms: options.auto_detect_rooms,
          auto_place_hotspots: options.auto_place_hotspots,
          auto_generate_descriptions: options.auto_generate_descriptions,
        },
        setUploadProgress
      );
      setJobId(response.job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start tour generation');
      setStep('options');
    }
  };

  const handleJobComplete = (job: unknown, jobResult: unknown) => {
    setJobId(null);
    if (jobResult && typeof jobResult === 'object') {
      const data = jobResult as { tour?: Tour; scenes?: Scene[] };
      setResult(data);
      setStep('review');
    }
  };

  const handleJobError = (job: unknown, errorMessage: string) => {
    setJobId(null);
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
    images.forEach((img) => URL.revokeObjectURL(img.preview));
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
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
                  or click to select files (JPG, PNG, WebP)
                </p>
              </div>

              {images.length > 0 && (
                <div>
                  <Label className="mb-2 block">
                    {images.length} image{images.length !== 1 ? 's' : ''} selected
                  </Label>
                  <ScrollArea className="h-[200px]">
                    <div className="grid grid-cols-4 gap-2">
                      {images.map((image) => (
                        <div key={image.id} className="relative group">
                          <img
                            src={image.preview}
                            alt="Preview"
                            className="w-full h-20 object-cover rounded"
                          />
                          <button
                            onClick={() => removeImage(image.id)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
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
                  onChange={(e) => setTitle(e.target.value)}
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
                  onChange={(e) => setDescription(e.target.value)}
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
                  {images.slice(0, 6).map((image) => (
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
                  checked={options.auto_detect_rooms}
                  onCheckedChange={(checked) =>
                    setOptions((prev) => ({ ...prev, auto_detect_rooms: checked }))
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
                  checked={options.auto_place_hotspots}
                  onCheckedChange={(checked) =>
                    setOptions((prev) => ({ ...prev, auto_place_hotspots: checked }))
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
                  checked={options.auto_generate_descriptions}
                  onCheckedChange={(checked) =>
                    setOptions((prev) => ({ ...prev, auto_generate_descriptions: checked }))
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
                  <li>
                    • Room detection: {options.auto_detect_rooms ? 'Enabled' : 'Disabled'}
                  </li>
                  <li>
                    • Auto hotspots: {options.auto_place_hotspots ? 'Enabled' : 'Disabled'}
                  </li>
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
