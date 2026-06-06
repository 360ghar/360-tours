import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
  Alert,
  AlertDescription,
} from '@/components/ui';
import { cn } from '@/utils';

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

export function VideoUploader({
  open,
  onOpenChange,
  onUploadComplete,
  maxFileSize = DEFAULT_MAX_SIZE,
  acceptedFormats = DEFAULT_FORMATS,
}: VideoUploaderProps) {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [quality, setQuality] = useState<'auto' | '720p' | '1080p' | '4k'>('auto');
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

  const extractThumbnail = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;

      video.onloadeddata = () => {
        video.currentTime = 1; // Seek to 1 second
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } else {
          reject(new Error('Failed to get canvas context'));
        }
        URL.revokeObjectURL(video.src);
      };

      video.onerror = () => {
        reject(new Error('Failed to load video'));
      };

      video.src = URL.createObjectURL(file);
    });
  };

  const extractDuration = async (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';

      video.onloadedmetadata = () => {
        resolve(video.duration);
        URL.revokeObjectURL(video.src);
      };

      video.onerror = () => {
        reject(new Error('Failed to load video metadata'));
      };

      video.src = URL.createObjectURL(file);
    });
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const newVideos: VideoFile[] = [];

      for (const file of acceptedFiles) {
        // Validate file size
        if (file.size > maxFileSize * 1024 * 1024) {
          continue;
        }

        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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
            error: 'Failed to process video',
          });
        }
      }

      setVideos((prev) => [...prev, ...newVideos]);
    },
    [maxFileSize]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFormats.reduce(
      (acc, format) => ({ ...acc, [format]: [] }),
      {}
    ),
    multiple: true,
    maxSize: maxFileSize * 1024 * 1024,
  });

  const removeVideo = (id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  const uploadVideos = async () => {
    const pendingVideos = videos.filter((v) => v.status === 'pending');
    if (pendingVideos.length === 0) return;

    setIsUploading(true);

    for (const video of pendingVideos) {
      try {
        // Update status to uploading
        setVideos((prev) =>
          prev.map((v) =>
            v.id === video.id ? { ...v, status: 'uploading' as const } : v
          )
        );

        // Simulate upload progress
        for (let progress = 0; progress <= 100; progress += 10) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          setVideos((prev) =>
            prev.map((v) =>
              v.id === video.id ? { ...v, progress } : v
            )
          );
        }

        // Simulate processing
        setVideos((prev) =>
          prev.map((v) =>
            v.id === video.id ? { ...v, status: 'processing' as const, progress: 100 } : v
          )
        );

        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Mark as ready
        const fakeUrl = `https://cdn.360viewer.app/videos/${video.id}.mp4`;
        setVideos((prev) =>
          prev.map((v) =>
            v.id === video.id
              ? { ...v, status: 'ready' as const, url: fakeUrl }
              : v
          )
        );

        // Notify parent
        onUploadComplete({
          url: fakeUrl,
          thumbnail_url: video.thumbnail || '',
          duration: video.duration || 0,
          title: video.name.replace(/\.[^/.]+$/, ''),
        });
      } catch (error) {
        setVideos((prev) =>
          prev.map((v) =>
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
    setVideos((prev) =>
      prev.map((v) =>
        v.id === id ? { ...v, status: 'pending' as const, error: undefined, progress: 0 } : v
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Upload 360° Video
          </DialogTitle>
          <DialogDescription>
            Upload 360° videos to create immersive video tours. Supported formats:
            MP4, WebM, MOV.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden space-y-4">
          {/* Dropzone */}
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
            <FileVideo className="h-12 w-12 mx-auto mb-4 text-[var(--color-text-muted)]" />
            {isDragActive ? (
              <p className="text-[var(--color-primary-600)]">Drop your videos here...</p>
            ) : (
              <>
                <p className="text-[var(--color-text-primary)] font-medium">
                  Drag & drop 360° videos here
                </p>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  or click to browse • Max {maxFileSize}MB per file
                </p>
              </>
            )}
          </div>

          {/* Quality Setting */}
          <div className="flex items-center justify-between">
            <Label>Output Quality</Label>
            <Select value={quality} onValueChange={(v) => setQuality(v as typeof quality)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="720p">720p</SelectItem>
                <SelectItem value="1080p">1080p</SelectItem>
                <SelectItem value="4k">4K</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Video List */}
          {videos.length > 0 && (
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {videos.map((video) => (
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
                      {video.duration && (
                        <span>{formatDuration(video.duration)}</span>
                      )}
                    </div>

                    {/* Progress or Status */}
                    {video.status === 'uploading' && (
                      <Progress value={video.progress} className="mt-2 h-1.5" />
                    )}

                    {video.error && (
                      <p className="text-xs text-[var(--color-error-500)] mt-1">
                        {video.error}
                      </p>
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

                    {video.status === 'error' && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => retryVideo(video.id)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}

                    {(video.status === 'pending' || video.status === 'error') && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeVideo(video.id)}
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
              For best results, use equirectangular 360° videos with a 2:1 aspect ratio.
              Videos will be transcoded for optimal streaming.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={uploadVideos}
            disabled={videos.filter((v) => v.status === 'pending').length === 0 || isUploading}
            isLoading={isUploading}
          >
            <Upload className="h-4 w-4" />
            Upload Videos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
