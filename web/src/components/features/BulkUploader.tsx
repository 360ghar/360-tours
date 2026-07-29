import { useState, useRef, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, X, CheckCircle, AlertCircle, FileImage, Loader2, FolderOpen } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Progress,
  ScrollArea,
} from '@/components/ui';
import { QUERY_KEYS } from '@/constants';
import { cn } from '@/utils';
import { useToast } from '@/hooks/useToast';
import { confirm } from '@/stores';
import {
  SCENE_UPLOAD_ACCEPT_ATTRIBUTE,
  SCENE_UPLOAD_MAX_CONCURRENT,
  SCENE_UPLOAD_MAX_SIZE_MB,
  isSceneUploadValidationError,
  uploadSceneFiles,
  validateSceneUploadFile,
} from '@/lib/sceneUpload';

interface BulkUploaderProps {
  tourId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  previewUrl?: string;
}

export function BulkUploader({ tourId, open, onOpenChange }: BulkUploaderProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Mirror files state in a ref so unmount cleanup can revoke outstanding preview URLs
  const filesRef = useRef<UploadFile[]>([]);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Revoke any remaining preview object URLs on unmount
  useEffect(
    () => () => {
      filesRef.current.forEach(f => {
        if (f.previewUrl) {
          URL.revokeObjectURL(f.previewUrl);
        }
      });
    },
    []
  );

  // Calculate overall progress
  const totalFiles = files.length;
  const completedFiles = files.filter(f => f.status === 'success' || f.status === 'error').length;

  const totalBytes = files.reduce((sum, f) => sum + f.file.size, 0);
  const uploadedBytes = files
    // 'error' is terminal too — count its full size so the bar can reach 100%
    // once every file has settled, instead of stalling when any upload fails.
    .filter(f => f.status === 'success' || f.status === 'error' || f.status === 'uploading')
    .reduce((sum, f) => {
      if (f.status === 'uploading') return sum + Math.round((f.progress / 100) * f.file.size);
      return sum + f.file.size;
    }, 0);
  const overallProgress = totalBytes > 0 ? (uploadedBytes / totalBytes) * 100 : 0;

  // Add files to the queue
  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const uploadFiles: UploadFile[] = fileArray.map(file => {
      const validation = validateSceneUploadFile(file);
      return {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        status: validation.valid ? 'pending' : 'error',
        progress: 0,
        error: validation.valid ? undefined : validation.error,
        previewUrl: validation.valid ? URL.createObjectURL(file) : undefined,
      };
    });

    setFiles(prev => [...prev, ...uploadFiles]);
  }, []);

  // Remove a file from the queue
  const removeFile = useCallback((id: string) => {
    setFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
      return prev.filter(f => f.id !== id);
    });
  }, []);

  // Clear all files
  const clearFiles = useCallback(() => {
    files.forEach(f => {
      if (f.previewUrl) {
        URL.revokeObjectURL(f.previewUrl);
      }
    });
    setFiles([]);
  }, [files]);

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
      e.target.value = '';
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isUploading) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isUploading) return;
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  };

  // Upload all pending files (bounded concurrency)
  const uploadFiles = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);

    // Mark all pending files as uploading immediately (queue state)
    setFiles(prev =>
      prev.map(f => (f.status === 'pending' ? { ...f, status: 'uploading', progress: 0 } : f))
    );

    const results = await uploadSceneFiles(
      tourId,
      pendingFiles.map(uploadFile => uploadFile.file),
      {
        concurrency: SCENE_UPLOAD_MAX_CONCURRENT,
        onFileProgress: (_file, index, progress) => {
          const uploadFile = pendingFiles[index];
          if (!uploadFile) return;
          setFiles(prev => prev.map(f => (f.id === uploadFile.id ? { ...f, progress } : f)));
        },
        onFileSuccess: (_file, index) => {
          const uploadFile = pendingFiles[index];
          if (!uploadFile) return;
          setFiles(prev =>
            prev.map(f =>
              f.id === uploadFile.id ? { ...f, status: 'success', progress: 100 } : f
            )
          );
        },
        onFileError: (_file, index, err) => {
          const uploadFile = pendingFiles[index];
          if (!uploadFile) return;
          setFiles(prev =>
            prev.map(f =>
              f.id === uploadFile.id
                ? {
                    ...f,
                    status: 'error',
                    progress: 0,
                    error: err instanceof Error ? err.message : 'Upload failed',
                  }
                : f
            )
          );
        },
      }
    );

    setIsUploading(false);

    // Refresh scenes
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SCENES, tourId] });

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const errorCount = results.filter(r => r.status === 'rejected').length;

    if (successCount > 0) {
      toast(
        errorCount > 0 ? 'warning' : 'success',
        `${successCount} scene${successCount > 1 ? 's' : ''} added${errorCount > 0 ? `, ${errorCount} failed` : ''}.`,
        { title: 'Upload complete' }
      );
    } else if (errorCount > 0) {
      toast('error', 'All files failed to upload.', { title: 'Upload failed' });
    }
  };

  // Retry failed uploads
  const retryFailed = () => {
    setFiles(prev =>
      prev.map(f =>
        f.status === 'error' && !isSceneUploadValidationError(f.error)
          ? { ...f, status: 'pending', progress: 0, error: undefined }
          : f
      )
    );
  };

  // Handle close
  const handleClose = async (nextOpen?: boolean) => {
    if (nextOpen === true) return;
    if (isUploading) {
      const shouldClose = await confirm({
        title: 'Upload in progress',
        message: 'Close the uploader while files are still uploading?',
        confirmLabel: 'Close uploader',
        cancelLabel: 'Keep open',
        destructive: true,
      });
      if (!shouldClose) {
        return;
      }
    }
    clearFiles();
    onOpenChange(false);
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const hasRetryable = files.some(
    f => f.status === 'error' && !isSceneUploadValidationError(f.error)
  );

  return (
    <Dialog open={open} onOpenChange={nextOpen => void handleClose(nextOpen)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Bulk Upload Scenes
          </DialogTitle>
          <DialogDescription>
            Drag and drop 360° panorama images or click to browse. Supported formats: JPG, PNG, WebP
            (max {SCENE_UPLOAD_MAX_SIZE_MB}MB each).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Drop Zone */}
          <button
            type="button"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={cn(
              'w-full rounded-lg border-2 border-dashed p-8 text-center transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-70',
              isDragOver
                ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]'
                : 'border-[var(--color-border)] hover:border-[var(--color-primary-300)]'
            )}
          >
            <FolderOpen
              className={cn(
                'h-12 w-12 mx-auto mb-4',
                isDragOver ? 'text-[var(--color-primary-500)]' : 'text-[var(--color-text-muted)]'
              )}
            />
            <p className="text-[var(--color-text-primary)] font-medium">
              {isUploading
                ? 'Uploading selected files'
                : isDragOver
                  ? 'Drop files here'
                  : 'Drag & drop files here'}
            </p>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">or click to browse</p>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept={SCENE_UPLOAD_ACCEPT_ATTRIBUTE}
            multiple
            onChange={handleFileChange}
            disabled={isUploading}
            className="hidden"
          />

          {/* File List */}
          {files.length > 0 && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  {files.length} file{files.length > 1 ? 's' : ''} selected
                </p>
                {!isUploading && (
                  <Button variant="ghost" size="sm" onClick={clearFiles}>
                    Clear all
                  </Button>
                )}
              </div>

              {/* Progress bar */}
              {isUploading && (
                <div className="mb-3">
                  <Progress value={overallProgress} className="h-2" />
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    Uploading {completedFiles} of {totalFiles}...
                  </p>
                </div>
              )}

              <ScrollArea className="flex-1 max-h-[300px]">
                <div className="space-y-2 pr-2">
                  {files.map(uploadFile => (
                    <div
                      key={uploadFile.id}
                      className={cn(
                        'flex items-center gap-3 p-2 rounded-lg border',
                        uploadFile.status === 'error'
                          ? 'border-[var(--color-error-200)] bg-[var(--color-error-50)]'
                          : uploadFile.status === 'success'
                            ? 'border-[var(--color-success-200)] bg-[var(--color-success-50)]'
                            : 'border-[var(--color-border)]'
                      )}
                    >
                      {/* Preview */}
                      <div className="h-12 w-12 flex-shrink-0 rounded overflow-hidden bg-[var(--color-surface)]">
                        {uploadFile.previewUrl ? (
                          <img
                            src={uploadFile.previewUrl}
                            alt={uploadFile.file.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <FileImage className="h-6 w-6 text-[var(--color-text-muted)]" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                          {uploadFile.file.name}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {(uploadFile.file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        {uploadFile.error && (
                          <p className="text-xs text-[var(--color-error-600)]">
                            {uploadFile.error}
                          </p>
                        )}
                      </div>

                      {/* Status Icon */}
                      <div className="flex-shrink-0">
                        {uploadFile.status === 'pending' && (
                          <div className="h-6 w-6 rounded-full bg-[var(--color-surface)] flex items-center justify-center">
                            <span className="text-xs text-[var(--color-text-muted)]">•</span>
                          </div>
                        )}
                        {uploadFile.status === 'uploading' && (
                          <Loader2 className="h-5 w-5 text-[var(--color-primary-500)] animate-spin" />
                        )}
                        {uploadFile.status === 'success' && (
                          <CheckCircle className="h-5 w-5 text-[var(--color-success-500)]" />
                        )}
                        {uploadFile.status === 'error' && (
                          <AlertCircle className="h-5 w-5 text-[var(--color-error-500)]" />
                        )}
                      </div>

                      {/* Remove button */}
                      {!isUploading && uploadFile.status !== 'uploading' && (
                        <button
                          type="button"
                          onClick={() => removeFile(uploadFile.id)}
                          aria-label={`Remove ${uploadFile.file.name}`}
                          className="flex-shrink-0 p-1 rounded hover:bg-[var(--color-surface)] transition-colors"
                        >
                          <X className="h-4 w-4 text-[var(--color-text-muted)]" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4 border-t border-[var(--color-border)] pt-4">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-[var(--color-text-muted)]">
              {pendingCount > 0 && `${pendingCount} pending`}
              {pendingCount > 0 && errorCount > 0 && ', '}
              {errorCount > 0 && `${errorCount} failed`}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => void handleClose(false)}>
                {isUploading ? 'Close uploader' : 'Close'}
              </Button>
              {hasRetryable && !isUploading && (
                <Button variant="outline" onClick={retryFailed}>
                  Retry Failed
                </Button>
              )}
              <Button
                onClick={uploadFiles}
                disabled={pendingCount === 0 || isUploading}
                isLoading={isUploading}
              >
                <Upload className="h-4 w-4" />
                Upload {pendingCount > 0 ? `(${pendingCount})` : ''}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
