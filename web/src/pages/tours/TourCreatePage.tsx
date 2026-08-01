import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  X,
  Images,
  ArrowLeft,
  Loader2,
  Sparkles,
  Camera,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Input,
  Progress,
} from '@/components/ui';
import { toursApi, uploadApi } from '@/api';
import { tourSchema } from '@/utils/validation';
import type { TourFormData } from '@/utils/validation';
import { validateImageFile } from '@/utils/validation';
import { ROUTES, QUERY_KEYS, DEFAULT_TOUR_SETTINGS } from '@/constants';
import { cn } from '@/utils';
import type { Tour } from '@/types';
import { AITourWizard } from '@/components/features';

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  url?: string;
  /**
   * True only when the file failed DURING an upload attempt (transport or
   * scene-creation error). Validation rejections are never retryable.
   */
  retryable?: boolean;
}

function createUploadId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function TourCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'choose' | 'info' | 'upload'>('choose');
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [createdTour, setCreatedTour] = useState<Tour | null>(null);
  const [showAIWizard, setShowAIWizard] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TourFormData>({
    resolver: zodResolver(tourSchema),
    defaultValues: {
      title: '',
      description: '',
      status: 'draft',
      visibility: 'private',
      settings: DEFAULT_TOUR_SETTINGS,
    },
  });

  // Pre-fill the form with createdTour data when returning to the info step
  // so the user can edit their previously entered info.
  useEffect(() => {
    if (createdTour && step === 'info') {
      reset({
        title: createdTour.title,
        description: createdTour.description ?? '',
        status: createdTour.status,
        visibility: createdTour.visibility,
        settings: createdTour.settings ?? DEFAULT_TOUR_SETTINGS,
      });
    }
  }, [createdTour, step, reset]);

  // Create tour mutation
  const createMutation = useMutation({
    mutationFn: (data: TourFormData) => toursApi.createTour(data),
    onSuccess: tour => {
      setCreatedTour(tour);
      setStep('upload');
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOURS] });
    },
  });

  // Update tour mutation - used when the user goes back to edit info after
  // the tour has already been created.
  const updateTourMutation = useMutation({
    mutationFn: (data: TourFormData) => toursApi.updateTour(createdTour!.id, data),
    onSuccess: tour => {
      setCreatedTour(tour);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, createdTour!.id] });
      setStep('upload');
    },
  });

  // Add scene mutation
  const addSceneMutation = useMutation({
    mutationFn: ({
      tourId,
      imageUrl,
      title,
    }: {
      tourId: string;
      imageUrl: string;
      title: string;
    }) => toursApi.createScene(tourId, { image_url: imageUrl, title }),
  });

  const onSubmit = async (data: TourFormData) => {
    try {
      if (createdTour) {
        await updateTourMutation.mutateAsync(data);
      } else {
        await createMutation.mutateAsync(data);
      }
    } catch {
      // Mutation errors are rendered inline below the form.
    }
  };

  const handleAIComplete = (tour: Tour) => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOURS] });
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, tour.id] });
    navigate(`/tours/${tour.id}/edit`);
  };

  const addSelectedFiles = useCallback((files: File[]) => {
    const validFiles: UploadingFile[] = [];

    files.forEach(file => {
      const validation = validateImageFile(file);
      if (validation.valid) {
        validFiles.push({
          id: createUploadId(),
          file,
          progress: 0,
          status: 'pending',
        });
      } else {
        validFiles.push({
          id: createUploadId(),
          file,
          progress: 0,
          status: 'error',
          error: validation.error,
        });
      }
    });

    setUploadingFiles(prev => [...prev, ...validFiles]);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      addSelectedFiles(Array.from(e.target.files || []));
      e.target.value = '';
    },
    [addSelectedFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      addSelectedFiles(Array.from(e.dataTransfer.files));
    },
    [addSelectedFiles]
  );

  const removeFile = (id: string) => {
    setUploadingFiles(prev => prev.filter(file => file.id !== id));
  };

  // Upload a single file: POST /upload then POST /tours/:id/scenes. Used by the
  // batch uploader and by per-row/per-batch retry. Never throws — failures are
  // written back into the row's status so the UI can offer a retry.
  const uploadOne = useCallback(
    async (item: UploadingFile, tourId: string) => {
      try {
        const uploadResult = await uploadApi.uploadFile(item.file, {
          folder: 'scenes',
          visibility: 'public',
          onProgress: progress => {
            setUploadingFiles(prev => prev.map(f => (f.id === item.id ? { ...f, progress } : f)));
          },
        });

        await addSceneMutation.mutateAsync({
          tourId,
          imageUrl: uploadResult.public_url,
          title: item.file.name.replace(/\.[^/.]+$/, ''),
        });

        setUploadingFiles(prev =>
          prev.map(f =>
            f.id === item.id
              ? {
                  ...f,
                  status: 'completed' as const,
                  progress: 100,
                  url: uploadResult.public_url,
                }
              : f
          )
        );
      } catch (err) {
        setUploadingFiles(prev =>
          prev.map(f =>
            f.id === item.id
              ? {
                  ...f,
                  status: 'error' as const,
                  retryable: true,
                  error: err instanceof Error ? err.message : 'Upload failed',
                }
              : f
          )
        );
      }
    },
    [addSceneMutation]
  );

  const uploadFiles = async () => {
    if (!createdTour) return;

    const pending = uploadingFiles.filter(item => item.status === 'pending');

    if (pending.length === 0) return;
    const pendingIds = new Set(pending.map(item => item.id));

    // Mark all pending files as uploading immediately (parallel uploads)
    setUploadingFiles(prev =>
      prev.map(f =>
        pendingIds.has(f.id) ? { ...f, status: 'uploading' as const, progress: 0 } : f
      )
    );

    await Promise.allSettled(pending.map(item => uploadOne(item, createdTour.id)));

    // Refresh tour data
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOURS] });
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, createdTour.id] });
  };

  // Retry a single failed upload row. The file object is captured before the
  // status flip so the retry doesn't depend on (stale) component state.
  const retryFile = (id: string) => {
    if (!createdTour || isUploading) return;
    const item = uploadingFiles.find(f => f.id === id);
    if (!item || item.status !== 'error') return;

    setUploadingFiles(prev =>
      prev.map(f =>
        f.id === id ? { ...f, status: 'uploading' as const, progress: 0, error: undefined } : f
      )
    );
    void uploadOne({ ...item, status: 'uploading', error: undefined }, createdTour.id);
  };

  // Reset every upload-failed row to a fresh attempt (validation rejections are
  // left as-is — retrying them would just fail again).
  const retryFailedFiles = async () => {
    if (!createdTour || isUploading) return;
    const failed = uploadingFiles.filter(f => f.status === 'error' && f.retryable);
    if (failed.length === 0) return;
    const failedIds = new Set(failed.map(f => f.id));

    setUploadingFiles(prev =>
      prev.map(f =>
        failedIds.has(f.id)
          ? { ...f, status: 'uploading' as const, progress: 0, error: undefined }
          : f
      )
    );

    await Promise.allSettled(failed.map(item => uploadOne(item, createdTour.id)));

    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOURS] });
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, createdTour.id] });
  };

  const pendingCount = uploadingFiles.filter(f => f.status === 'pending').length;
  const completedCount = uploadingFiles.filter(f => f.status === 'completed').length;
  const errorCount = uploadingFiles.filter(f => f.status === 'error').length;
  const isUploading = uploadingFiles.some(f => f.status === 'uploading');
  const hasRetryableErrors = uploadingFiles.some(f => f.status === 'error' && f.retryable);
  const formError = createMutation.error || updateTourMutation.error;

  // Every added file failed (no scene was created) → block "Continue to Editor"
  // until at least one upload succeeds or the failed rows are removed.
  const allUploadsFailed =
    uploadingFiles.length > 0 && completedCount === 0 && errorCount === uploadingFiles.length;

  const totalUploadBytes = uploadingFiles
    .filter(f => f.status === 'pending' || f.status === 'uploading' || f.status === 'completed')
    .reduce((sum, f) => sum + f.file.size, 0);
  const uploadedBytes = uploadingFiles
    .filter(f => f.status === 'pending' || f.status === 'uploading' || f.status === 'completed')
    .reduce((sum, f) => {
      if (f.status === 'completed') return sum + f.file.size;
      return sum + Math.round((f.progress / 100) * f.file.size);
    }, 0);
  const overallProgress =
    totalUploadBytes > 0 ? Math.round((uploadedBytes * 100) / totalUploadBytes) : 0;
  const attentionLabel = `${errorCount} file${errorCount === 1 ? '' : 's'} ${
    errorCount === 1 ? 'needs' : 'need'
  } attention`;
  const uploadStatusLabel =
    errorCount > 0
      ? `${completedCount} uploaded, ${attentionLabel}`
      : `${completedCount} of ${uploadingFiles.length} uploaded`;

  return (
    <div className="animate-fade-in mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to tours"
            onClick={() => navigate(ROUTES.TOURS)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Create New Tour</h1>
            <p className="text-[var(--color-text-muted)]">
              {step === 'choose' && 'Choose how to add content'}
              {step === 'info' && 'Step 1: Tour Information'}
              {step === 'upload' && 'Step 2: Upload Scenes'}
            </p>
          </div>
        </div>
        {step !== 'choose' && (
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => setShowAIWizard(true)}
          >
            <Sparkles className="h-4 w-4" />
            AI Generate
          </Button>
        )}
      </div>

      {/* Path selection */}
      {step === 'choose' && (
        <div className="grid gap-4 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => navigate(ROUTES.TOUR_CAPTURE)}
            className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-left transition hover:border-[var(--color-primary-400)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary-50)] text-[var(--color-primary-600)] group-hover:bg-[var(--color-primary-100)]">
              <Camera className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-[var(--color-text-primary)]">Guided capture</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Use the device camera. Turn in place, capture with overlap, upload into a draft tour.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setStep('info')}
            className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-left transition hover:border-[var(--color-primary-400)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]">
              <Upload className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-[var(--color-text-primary)]">Upload panoramas</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Already have equirectangular 360° images? Drop them in and edit as usual.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setShowAIWizard(true)}
            className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-left transition hover:border-[var(--color-primary-400)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-[var(--color-text-primary)]">AI generate</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Upload images and let AI order rooms, labels, and hotspot suggestions.
            </p>
          </button>
        </div>
      )}

      {/* Step 1: Tour Info */}
      {step === 'info' && (
        <Card>
          <CardHeader>
            <CardTitle>Tour Information</CardTitle>
            <CardDescription>Enter the basic information for your virtual tour</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-[var(--color-error-200)] bg-[var(--color-error-50)] p-3 text-sm text-[var(--color-error-700)]"
                >
                  {formError instanceof Error
                    ? formError.message
                    : 'Tour information could not be saved.'}
                </div>
              )}

              <Input
                label="Tour Title"
                {...register('title')}
                placeholder="e.g., Modern Downtown Apartment"
                error={errors.title?.message}
              />

              <div className="w-full">
                <label
                  htmlFor="tour-description"
                  className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]"
                >
                  Description
                </label>
                <textarea
                  {...register('description')}
                  id="tour-description"
                  placeholder="Describe your virtual tour..."
                  rows={4}
                  aria-invalid={!!errors.description}
                  aria-describedby={errors.description ? 'tour-description-error' : undefined}
                  className="flex w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]"
                />
                {errors.description && (
                  <p
                    id="tour-description-error"
                    className="mt-1.5 text-sm text-[var(--color-error-500)]"
                  >
                    {errors.description.message}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setStep('choose')}>
                  Back
                </Button>
                <Button
                  type="submit"
                  isLoading={createMutation.isPending || updateTourMutation.isPending}
                >
                  {createdTour ? 'Save & Return to Upload' : 'Continue to Upload'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Upload */}
      {step === 'upload' && createdTour && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Upload 360° Images</CardTitle>
              <CardDescription>
                Drag and drop your panoramic images or click to browse
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Drop Zone */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                disabled={isUploading}
                className="hidden"
              />
              <button
                type="button"
                onDrop={handleDrop}
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={e => {
                  e.preventDefault();
                  setIsDragOver(false);
                }}
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className={cn(
                  'flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-70',
                  isDragOver
                    ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary-500)] hover:bg-[var(--color-surface)]'
                )}
              >
                <Upload className="h-10 w-10 text-[var(--color-text-muted)]" />
                <p className="mt-4 text-sm font-medium text-[var(--color-text-primary)]">
                  {isUploading ? 'Uploading selected files' : 'Drop files here or click to upload'}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  JPEG, PNG, or WebP up to 50MB each
                </p>
              </button>

              {/* File List */}
              {uploadingFiles.length > 0 && (
                <div className="mt-6 space-y-3">
                  {uploadingFiles.map(file => (
                    <div
                      key={file.id}
                      className="flex items-center gap-4 rounded-lg border border-[var(--color-border)] p-3"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface)]">
                        <Images className="h-5 w-5 text-[var(--color-text-muted)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                          {file.file.name}
                        </p>
                        {file.status === 'uploading' && (
                          <Progress value={file.progress} className="mt-1 h-1" />
                        )}
                        {file.status === 'error' && (
                          <p className="text-xs text-[var(--color-error-600)]">{file.error}</p>
                        )}
                        {file.status === 'completed' && (
                          <p className="text-xs text-[var(--color-success-600)]">Uploaded</p>
                        )}
                      </div>
                      {file.status === 'uploading' ? (
                        <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary-600)]" />
                      ) : file.status === 'error' && file.retryable ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`Retry ${file.file.name}`}
                            onClick={() => retryFile(file.id)}
                            disabled={isUploading}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Retry
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${file.file.name}`}
                            onClick={() => removeFile(file.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : file.status !== 'completed' ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${file.file.name}`}
                          onClick={() => removeFile(file.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setStep('info')}>
                <ArrowLeft className="h-4 w-4" />
                Edit Info
              </Button>
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:items-end">
              {uploadingFiles.length > 0 && isUploading && (
                <div className="flex w-full flex-col gap-1 sm:w-40">
                  <Progress value={overallProgress} className="h-1.5" />
                  <span className="text-xs text-[var(--color-text-muted)]">{overallProgress}%</span>
                </div>
              )}
              {uploadingFiles.length > 0 && (
                <span className="text-sm text-[var(--color-text-muted)]">{uploadStatusLabel}</span>
              )}
              {pendingCount > 0 && (
                <Button onClick={() => void uploadFiles()} disabled={isUploading}>
                  Upload {pendingCount} Files
                </Button>
              )}
              {isUploading && pendingCount === 0 && (
                <Button disabled>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading
                </Button>
              )}
              {!isUploading && pendingCount === 0 && !allUploadsFailed && (
                <div className="flex flex-col items-end gap-1.5">
                  {completedCount > 0 && errorCount > 0 && (
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {errorCount} failed upload{errorCount === 1 ? '' : 's'} skipped — you can
                      retry them or continue without them.
                    </span>
                  )}
                  <Button onClick={() => navigate(`/tours/${createdTour.id}/edit`)}>
                    Continue to Editor
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* All uploads failed — block Continue until at least one scene exists. */}
          {allUploadsFailed && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-lg border border-[var(--color-error-200)] bg-[var(--color-error-50)] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-error-600)]" />
                <div>
                  <p className="font-medium text-[var(--color-error-800)]">
                    No scenes were uploaded
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--color-error-700)]">
                    Every file failed to upload, so the tour has no scenes yet. Retry the failed
                    uploads or remove them before continuing to the editor.
                  </p>
                </div>
              </div>
              {hasRetryableErrors && (
                <Button
                  variant="outline"
                  onClick={() => void retryFailedFiles()}
                  disabled={isUploading}
                  className="shrink-0"
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry failed uploads
                </Button>
              )}
            </div>
          )}
        </>
      )}

      <AITourWizard
        open={showAIWizard}
        onOpenChange={setShowAIWizard}
        onComplete={handleAIComplete}
      />
    </div>
  );
}
