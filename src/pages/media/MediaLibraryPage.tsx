import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen,
  Search,
  Trash2,
  Grid3X3,
  List,
  FileImage,
  Film,
  Download,
  Eye,
  Loader2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  Button,
  Input,
  Badge,
  Skeleton,
} from '@/components/ui';
import { uploadApi } from '@/api';
import { QUERY_KEYS } from '@/constants';
import { formatRelativeTime } from '@/utils/format';
import type { MediaFile } from '@/types';
import { cn } from '@/utils';
import { useToast } from '@/hooks/useToast';

type ViewMode = 'grid' | 'list';

export function MediaLibraryPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [mimeFilter, setMimeFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [previewFile, setPreviewFile] = useState<MediaFile | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [QUERY_KEYS.MEDIA_FILES, { page, search: searchQuery, mime: mimeFilter }],
    queryFn: () =>
      uploadApi.getMediaFiles({
        page,
        page_size: 24,
        mime_type: mimeFilter !== 'all' ? mimeFilter : undefined,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => uploadApi.deleteMediaFile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.MEDIA_FILES] });
      toast('success', 'File deleted.', { title: 'Deleted' });
    },
    onError: (error: Error) => {
      toast('error', error.message || 'Failed to delete file.', { title: 'Error' });
    },
  });

  const files = data?.items || [];
  const totalPages = data?.total_pages || 1;

  const handleDelete = async (file: MediaFile) => {
    if (confirm(`Delete "${file.original_filename || file.filename}"?`)) {
      await deleteMutation.mutateAsync(file.id);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImage = (mime: string) => mime.startsWith('image/');
  const isVideo = (mime: string) => mime.startsWith('video/');

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Media Library</h1>
        <p className="mt-1 text-[var(--color-text-muted)]">
          Browse and manage your uploaded files
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-4">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <Input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Search files..."
              className="pl-10"
            />
          </div>
          <select
            value={mimeFilter}
            onChange={(e) => { setMimeFilter(e.target.value); setPage(1); }}
            className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)]"
          >
            <option value="all">All Types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
          </select>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'rounded-md p-2 transition-colors',
              viewMode === 'grid'
                ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            )}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'rounded-md p-2 transition-colors',
              viewMode === 'list'
                ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className={cn(
          viewMode === 'grid'
            ? 'grid gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'
            : 'space-y-3'
        )}>
          {[...Array(12)].map((_, i) => (
            <Skeleton key={i} className={viewMode === 'grid' ? 'aspect-square w-full' : 'h-16 w-full'} />
          ))}
        </div>
      ) : files.length === 0 ? (
        <Card className="py-16">
          <CardContent className="text-center">
            <FolderOpen className="mx-auto h-16 w-16 text-[var(--color-text-muted)]" />
            <h3 className="mt-4 text-lg font-semibold text-[var(--color-text-primary)]">
              No files found
            </h3>
            <p className="mt-2 text-[var(--color-text-muted)]">
              Files will appear here when you upload scenes or images.
            </p>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {files.map((file) => (
            <div
              key={file.id}
              className="group relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition-shadow hover:shadow-md"
            >
              <div
                className="aspect-square cursor-pointer overflow-hidden bg-[var(--color-surface-elevated)]"
                onClick={() => setPreviewFile(file)}
              >
                {isImage(file.mime_type) ? (
                  <img
                    src={file.thumbnail_url || file.file_url}
                    alt={file.original_filename || file.filename}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                ) : isVideo(file.mime_type) ? (
                  <div className="flex h-full w-full items-center justify-center">
                    <Film className="h-10 w-10 text-[var(--color-text-muted)]" />
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <FileImage className="h-10 w-10 text-[var(--color-text-muted)]" />
                  </div>
                )}
              </div>
              <div className="p-2">
                <p className="truncate text-xs font-medium text-[var(--color-text-primary)]">
                  {file.original_filename || file.filename}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {formatFileSize(file.file_size)}
                </p>
              </div>
              {/* Hover actions */}
              <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => setPreviewFile(file)}
                  className="rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                <a
                  href={file.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                <button
                  onClick={() => handleDelete(file)}
                  className="rounded-md bg-black/60 p-1.5 text-white hover:bg-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <Card key={file.id} className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-3">
                <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-[var(--color-surface-elevated)]">
                  {isImage(file.mime_type) ? (
                    <img
                      src={file.thumbnail_url || file.file_url}
                      alt={file.original_filename || file.filename}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      {isVideo(file.mime_type) ? (
                        <Film className="h-5 w-5 text-[var(--color-text-muted)]" />
                      ) : (
                        <FileImage className="h-5 w-5 text-[var(--color-text-muted)]" />
                      )}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                    {file.original_filename || file.filename}
                  </p>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                    <span>{formatFileSize(file.file_size)}</span>
                    <span>{file.mime_type}</span>
                    {file.width && file.height && (
                      <span>{file.width}x{file.height}</span>
                    )}
                    <span>{formatRelativeTime(file.created_at)}</span>
                  </div>
                </div>
                <Badge variant={file.visibility === 'public' ? 'success' : 'secondary'}>
                  {file.visibility}
                </Badge>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => setPreviewFile(file)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <a href={file.file_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="icon-sm">
                      <Download className="h-4 w-4" />
                    </Button>
                  </a>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(file)}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-[var(--color-error-600)]" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-[var(--color-text-muted)]">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-lg bg-[var(--color-surface-elevated)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {isImage(previewFile.mime_type) ? (
              <img
                src={previewFile.file_url}
                alt={previewFile.original_filename || previewFile.filename}
                className="max-h-[80vh] max-w-full object-contain"
              />
            ) : isVideo(previewFile.mime_type) ? (
              <video
                src={previewFile.file_url}
                controls
                className="max-h-[80vh] max-w-full"
              />
            ) : (
              <div className="flex h-48 w-64 items-center justify-center">
                <FileImage className="h-16 w-16 text-[var(--color-text-muted)]" />
              </div>
            )}
            <div className="mt-3 text-center">
              <p className="font-medium text-[var(--color-text-primary)]">
                {previewFile.original_filename || previewFile.filename}
              </p>
              <p className="text-sm text-[var(--color-text-muted)]">
                {formatFileSize(previewFile.file_size)}
                {previewFile.width && previewFile.height && ` — ${previewFile.width}x${previewFile.height}`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
