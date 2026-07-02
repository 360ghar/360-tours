import { useState, useCallback } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import {
  Video,
  Upload,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileVideo,
  Settings,
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
  Progress,
  Badge,
  Alert,
  AlertDescription,
} from '@/components/ui';
import { uploadApi } from '@/api';
import { cn } from '@/utils';
import { confirm } from '@/stores';

interface VideoFile {
  id: string;
  file: File;
  name: string;
  size: number;
  duration?: number;
  thumbnail?: string;
  status: 'pending' | 'uploading' | 'processing' | 'ready' | 'error';
  progress: number;
  error?: string;
  canRetry?: boolean;
  url?: string;
}

interface VideoUploaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete: (video: {
    url: string;
    thumbnail_url: string;
    duration: number;
    title: string;
  }) => void;
  maxFileSize?: number; // in MB
  acceptedFormats?: string[];
}

const DEFAULT_MAX_SIZE = 500; // 500MB
const DEFAULT_FORMATS = ['video/mp4', 'video/webm', 'video/quicktime'];

const createVideoId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

export function VideoUploader({
  open,
  onOpenChange,
  onUploadComplete,
  maxFileSize = DEFAULT_MAX_SIZE,
  acceptedFormats = DEFAULT_FORMATS,
}: VideoUploaderProps) {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const acceptedFormatLabel = acceptedFormats
    .map(format => format.replace('video/', '').replace('quicktime', 'mov').toUpperCase())
    .join(', ');

  const extractThumbnail = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      const objectUrl = URL.createObjectURL(file);
      let settled = false;

      const dispose = () => {
        if (!settled) {
          settled = true;
          URL.revokeObjectURL(objectUrl);
        }
      };

      video.onloadeddata = () => {
        // Clamp seek target to a small fraction of duration to support very
        // short videos where seeking to 1s would never fire `onseeked`.
        const target =
          video.duration && isFinite(video.duration) && video.duration < 1 ? video.duration / 2 : 1;
        video.currentTime = Math.min(target, video.duration || target);
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          dispose();
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } else {
          dispose();
          reject(new Error('Failed to get canvas context'));
        }
      };

      video.onerror = () => {
        dispose();
        reject(new Error('Failed to load video'));
      };

      // Safety net: if neither onseeked nor onerror fires (e.g., decode stall),
      // revoke after a timeout so the blob URL is never orphaned.
      setTimeout(() => {
        if (!settled) {
          dispose();
          reject(new Error('Timed out extracting thumbnail'));
        }
      }, 10000);

      video.src = objectUrl;
    });
  };

  const extractDuration = async (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      const objectUrl = URL.createObjectURL(file);

      video.onloadedmetadata = () => {
        resolve(video.duration);
        URL.revokeObjectURL(objectUrl);
      };

      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load video metadata'));
      };

      video.src = objectUrl;
    });
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const newVideos: VideoFile[] = [];

      for (const file of acceptedFiles) {
        // Validate file size
        if (file.size > maxFileSize * 1024 * 1024) {
          const id = createVideoId();
          newVideos.push({
            id,
            file,
            name: file.name,
            size: file.size,
            status: 'error',
            progress: 0,
            error: `File exceeds ${maxFileSize}MB size limit`,
            canRetry: false,
          });
          continue;
        }

        const id = createVideoId();

        try {
          const [duration, thumbnail] = await Promise.all([
            extractDuration(file),
            extractThumbnail(file),
          ]);

          newVideos.push({
            id,
            file,
            name: file.name,
            size: file.size,
            duration,
            thumbnail,
            status: 'pending',
            progress: 0,
          });
        } catch {
          newVideos.push({
            id,
            file,
            name: file.name,
            size: file.size,
            status: 'error',
            progress: 0,
            error: 'Failed to read video metadata. Try again or choose a different file.',
            canRetry: true,
          });
        }
      }

      setVideos(prev => [...prev, ...newVideos]);
    },
    [maxFileSize]
  );

  const onDropRejected = useCallback(
    (fileRejections: FileRejection[]) => {
      const rejectedVideos = fileRejections.map(({ file, errors }) => {
        const isTooLarge = errors.some(error => error.code === 'file-too-large');
        const isInvalidType = errors.some(error => error.code === 'file-invalid-type');
        const error = isTooLarge
          ? `File exceeds ${maxFileSize}MB size limit`
          : isInvalidType
            ? `Unsupported video format. Use ${acceptedFormatLabel}.`
            : errors[0]?.message || 'This file could not be added.';

        return {
          id: createVideoId(),
          file,
          name: file.name,
          size: file.size,
          status: 'error' as const,
          progress: 0,
          error,
          canRetry: false,
        };
      });

      setVideos(prev => [...prev, ...rejectedVideos]);
    },
    [acceptedFormatLabel, maxFileSize]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: acceptedFormats.reduce((acc, format) => ({ ...acc, [format]: [] }), {}),
    multiple: true,
    maxSize: maxFileSize * 1024 * 1024,
    disabled: isUploading,
  });

  const removeVideo = (id: string) => {
    setVideos(prev => prev.filter(v => v.id !== id));
  };

  const uploadVideos = async () => {
    const pendingVideos = videos.filter(v => v.status === 'pending');
    if (pendingVideos.length === 0) return;

    setIsUploading(true);

    for (const video of pendingVideos) {
      try {
        setVideos(prev =>
          prev.map(v =>
            v.id === video.id ? { ...v, status: 'uploading' as const, progress: 0 } : v
          )
        );

        const uploadResult = await uploadApi.uploadFile(video.file, {
          folder: 'hotspot_media',
          visibility: 'public',
          onProgress: progress => {
            setVideos(prev => prev.map(v => (v.id === video.id ? { ...v, progress } : v)));
          },
        });

        setVideos(prev =>
          prev.map(v =>
            v.id === video.id
              ? { ...v, status: 'ready' as const, progress: 100, url: uploadResult.public_url }
              : v
          )
        );

        // Persist the client-extracted thumbnail as its own image so the record
        // stores a durable URL, not a bloated base64 blob that won't survive a
        // reload. Best-effort: a thumbnail failure must not fail the video upload.
        let thumbnailUrl = '';
        if (video.thumbnail) {
          try {
            const res = await fetch(video.thumbnail);
            const blob = await res.blob();
            const thumbFile = new File([blob], `${video.id}-thumb.jpg`, { type: 'image/jpeg' });
            const thumbResult = await uploadApi.uploadFile(thumbFile, {
              folder: 'hotspot_media',
              visibility: 'public',
            });
            thumbnailUrl = thumbResult.public_url;
          } catch {
            // Leave thumbnailUrl empty; the video URL still works as a fallback poster.
          }
        }

        onUploadComplete({
          url: uploadResult.public_url,
          thumbnail_url: thumbnailUrl,
          duration: video.duration || 0,
          title: video.name.replace(/\.[^/.]+$/, ''),
        });
      } catch (error) {
        setVideos(prev =>
          prev.map(v =>
            v.id === video.id
              ? {
                  ...v,
                  status: 'error' as const,
                  error: error instanceof Error ? error.message : 'Upload failed',
                }
              : v
          )
        );
      }
    }

    setIsUploading(false);
  };

  const retryVideo = async (id: string) => {
    setVideos(prev =>
      prev.map(v =>
        v.id === id && v.canRetry !== false
          ? { ...v, status: 'pending' as const, error: undefined, progress: 0 }
          : v
      )
    );
  };

  const getStatusIcon = (status: VideoFile['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-[var(--color-text-muted)]" />;
      case 'uploading':
        return <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary-500)]" />;
      case 'processing':
        return <Settings className="h-4 w-4 animate-spin text-[var(--color-warning-500)]" />;
      case 'ready':
        return <CheckCircle2 className="h-4 w-4 text-[var(--color-success-500)]" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-[var(--color-error-500)]" />;
    }
  };

  const getStatusLabel = (status: VideoFile['status']) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'uploading':
        return 'Uploading...';
      case 'processing':
        return 'Processing...';
      case 'ready':
        return 'Ready';
      case 'error':
        return 'Failed';
    }
  };

  const handleClose = async (nextOpen = false) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }

    const hasInProgress = videos.some(v => v.status === 'uploading' || v.status === 'pending');
    if (hasInProgress) {
      const shouldClose = await confirm({
        title: 'Uploads in progress',
        message: 'Close the uploader while video uploads are still in progress?',
        confirmLabel: 'Close uploader',
        cancelLabel: 'Keep open',
        destructive: true,
      });
      if (!shouldClose) return;
    }

    onOpenChange(false);
  };

  const pendingCount = videos.filter(v => v.status === 'pending').length;

  return (
    <Dialog open={open} onOpenChange={nextOpen => void handleClose(nextOpen)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Upload 360° Video
          </DialogTitle>
          <DialogDescription>
            Upload 360° videos to create immersive video tours. Supported formats: MP4, WebM, MOV.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden space-y-4">
          {/* Dropzone */}
          <div
            {...getRootProps({
              'aria-label': 'Upload 360 video files',
            })}
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
              isUploading && 'cursor-not-allowed opacity-70',
              isDragActive
                ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]'
                : 'border-[var(--color-border)] hover:border-[var(--color-primary-300)]'
            )}
          >
            <input {...getInputProps({ 'aria-label': 'Choose 360 video files' })} />
            <FileVideo className="h-12 w-12 mx-auto mb-4 text-[var(--color-text-muted)]" />
            {isDragActive ? (
              <p className="text-[var(--color-primary-600)]">Drop your videos here...</p>
            ) : (
              <>
                <p className="text-[var(--color-text-primary)] font-medium">
                  Drag & drop 360° videos here
                </p>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  or click to browse - {acceptedFormatLabel} - Max {maxFileSize}MB per file
                </p>
              </>
            )}
          </div>

          {/* Quality selector removed — no backend support yet */}

          {/* Video List */}
          {videos.length > 0 && (
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {videos.map(video => (
                <div
                  key={video.id}
                  className="flex gap-3 p-3 rounded-lg border border-[var(--color-border)]"
                >
                  {/* Thumbnail */}
                  <div className="w-24 h-16 rounded overflow-hidden bg-[var(--color-surface)] flex-shrink-0">
                    {video.thumbnail ? (
                      <img
                        src={video.thumbnail}
                        alt={video.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Video className="h-6 w-6 text-[var(--color-text-muted)]" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{video.name}</p>
                    <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)] mt-1">
                      <span>{formatFileSize(video.size)}</span>
                      {video.duration && <span>{formatDuration(video.duration)}</span>}
                    </div>

                    {/* Progress or Status */}
                    {video.status === 'uploading' && (
                      <Progress value={video.progress} className="mt-2 h-1.5" />
                    )}

                    {video.error && (
                      <p className="text-xs text-[var(--color-error-500)] mt-1">{video.error}</p>
                    )}
                  </div>

                  {/* Status & Actions */}
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        video.status === 'ready'
                          ? 'success'
                          : video.status === 'error'
                            ? 'destructive'
                            : 'secondary'
                      }
                      className="gap-1"
                    >
                      {getStatusIcon(video.status)}
                      {getStatusLabel(video.status)}
                    </Badge>

                    {video.status === 'error' && video.canRetry !== false && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => retryVideo(video.id)}
                        aria-label={`Retry ${video.name}`}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}

                    {(video.status === 'pending' || video.status === 'error') && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeVideo(video.id)}
                        aria-label={`Remove ${video.name}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tips */}
          <Alert>
            <Video className="h-4 w-4" />
            <AlertDescription>
              For best results, use equirectangular 360° videos with a 2:1 aspect ratio. Videos will
              be transcoded for optimal streaming.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => void handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={uploadVideos}
            disabled={pendingCount === 0 || isUploading}
            isLoading={isUploading}
          >
            <Upload className="h-4 w-4" />
            {pendingCount === 1 ? 'Upload Video' : 'Upload Videos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
