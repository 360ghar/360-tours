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
  X,
} from 'lucide-react';
import { Card, CardContent, Button, Input, Badge, Skeleton } from '@/components/ui';
import { uploadApi } from '@/api';
import { QUERY_KEYS } from '@/constants';
import { formatRelativeTime } from '@/utils/format';
import type { MediaFile } from '@/types';
import { cn } from '@/utils';
import { useToast } from '@/hooks/useToast';
import { confirm } from '@/stores';

type ViewMode = 'grid' | 'list';

export function MediaLibraryPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [mimeFilter, setMimeFilter] = useState<string>('all');
  const [cursor, setCursor] = useState<string | null>(null);
  // Stack of cursors used for previous pages, enabling a "Prev" navigation.
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [previewFile, setPreviewFile] = useState<MediaFile | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds(prev =>
      prev.size === files.length ? new Set() : new Set(files.map(f => f.id))
    );
  };
  const clearSelection = () => setSelectedIds(new Set());

  const resetToFirstPage = () => {
    setCursor(null);
    setCursorHistory([]);
    clearSelection();
  };

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [QUERY_KEYS.MEDIA_FILES, { cursor, search: searchQuery, mime: mimeFilter }],
    queryFn: () =>
      uploadApi.getMediaFiles({
        cursor,
        limit: 24,
        mime_type: mimeFilter !== 'all' ? mimeFilter : undefined,
        search: searchQuery || undefined,
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

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => uploadApi.deleteMediaFiles(ids),
    onSuccess: result => {
      toast('success', `${result.deleted.length} file(s) deleted.`, { title: 'Deleted' });
    },
    onError: (error: Error) => {
      toast('error', error.message || 'Failed to delete files.', { title: 'Error' });
    },
    // Some deletes may succeed even when others fail (the API throws on partial
    // failure), so always refresh the list and clear selection.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.MEDIA_FILES] });
      clearSelection();
    },
  });

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (
      !(await confirm({
        title: 'Delete files',
        message: `Delete ${count} selected file(s)?`,
        confirmLabel: 'Delete',
        destructive: true,
      }))
    )
      return;
    bulkDeleteMutation.mutate(Array.from(selectedIds));
  };

  const files = data?.items || [];
  const hasMore = data?.has_more ?? false;
  const canGoBack = cursorHistory.length > 0;
  const hasActiveFilters = searchQuery.trim().length > 0 || mimeFilter !== 'all';

  const handleNext = () => {
    if (!data?.next_cursor) return;
    setCursorHistory(h => [...h, cursor ?? '']);
    setCursor(data.next_cursor);
    clearSelection();
  };

  const handlePrev = () => {
    if (cursorHistory.length === 0) return;
    const prev = cursorHistory[cursorHistory.length - 1];
    setCursorHistory(h => h.slice(0, -1));
    setCursor(prev || null);
    clearSelection();
  };

  const handleDelete = async (file: MediaFile) => {
    if (
      await confirm({
        title: 'Delete file',
        message: `Delete "${file.original_filename || file.filename}"?`,
        confirmLabel: 'Delete',
        destructive: true,
      })
    ) {
      setDeletingId(file.id);
      try {
        await deleteMutation.mutateAsync(file.id);
      } finally {
        setDeletingId(null);
      }
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
        <p className="mt-1 text-[var(--color-text-muted)]">Browse and manage your uploaded files</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-4">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <Input
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                resetToFirstPage();
              }}
              placeholder="Search files..."
              aria-label="Search media files"
              className="pl-10"
            />
          </div>
          <select
            value={mimeFilter}
            onChange={e => {
              setMimeFilter(e.target.value);
              resetToFirstPage();
            }}
            aria-label="Filter media by type"
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
            aria-label="Show media as grid"
            aria-pressed={viewMode === 'grid'}
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
            aria-label="Show media as list"
            aria-pressed={viewMode === 'list'}
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

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-2 shadow">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleSelectAll}>
              {selectedIds.size === files.length && files.length > 0
                ? 'Deselect all'
                : 'Select all'}
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Clear
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div
          className={cn(
            viewMode === 'grid'
              ? 'grid gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'
              : 'space-y-3'
          )}
        >
          {[...Array(12)].map((_, i) => (
            <Skeleton
              key={i}
              className={viewMode === 'grid' ? 'aspect-square w-full' : 'h-16 w-full'}
            />
          ))}
        </div>
      ) : isError ? (
        <Card className="py-16">
          <CardContent className="text-center">
            <FolderOpen className="mx-auto h-16 w-16 text-[var(--color-text-muted)]" />
            <h3 className="mt-4 text-lg font-semibold text-[var(--color-text-primary)]">
              Media could not be loaded
            </h3>
            <p className="mx-auto mt-2 max-w-md text-[var(--color-text-muted)]">
              {error instanceof Error
                ? error.message
                : 'Check your connection and try loading the library again.'}
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : files.length === 0 ? (
        <Card className="py-16">
          <CardContent className="text-center">
            <FolderOpen className="mx-auto h-16 w-16 text-[var(--color-text-muted)]" />
            <h3 className="mt-4 text-lg font-semibold text-[var(--color-text-primary)]">
              {hasActiveFilters ? 'No matching files' : 'No files yet'}
            </h3>
            <p className="mt-2 text-[var(--color-text-muted)]">
              {hasActiveFilters
                ? 'Try a different search or file type filter.'
                : 'Files will appear here when you upload scenes, images, or videos.'}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {files.map(file => (
            <div
              key={file.id}
              className="group relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition-shadow hover:shadow-md"
            >
              <button
                onClick={() => toggleSelect(file.id)}
                className={cn(
                  'absolute left-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded border transition-colors',
                  selectedIds.has(file.id)
                    ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-500)] text-white'
                    : 'border-white/60 bg-black/40 text-transparent hover:border-white'
                )}
                aria-label="Select file"
              >
                ✓
              </button>
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
                  aria-label={`Preview ${file.original_filename || file.filename}`}
                  className="rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                <a
                  href={file.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${file.original_filename || file.filename} in a new tab`}
                  className="rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                <button
                  onClick={() => handleDelete(file)}
                  disabled={deletingId !== null}
                  aria-label={`Delete ${file.original_filename || file.filename}`}
                  className="rounded-md bg-black/60 p-1.5 text-white hover:bg-red-600"
                >
                  {deletingId === file.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {files.map(file => (
            <Card key={file.id} className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-3">
                <button
                  onClick={() => toggleSelect(file.id)}
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                    selectedIds.has(file.id)
                      ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-500)] text-white'
                      : 'border-[var(--color-border)] text-transparent hover:border-[var(--color-primary-500)]'
                  )}
                  aria-label="Select file"
                >
                  ✓
                </button>
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
                      <span>
                        {file.width}x{file.height}
                      </span>
                    )}
                    <span>{formatRelativeTime(file.created_at)}</span>
                  </div>
                </div>
                <Badge variant={file.visibility === 'public' ? 'success' : 'secondary'}>
                  {file.visibility}
                </Badge>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setPreviewFile(file)}
                    aria-label={`Preview ${file.original_filename || file.filename}`}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <a href={file.file_url} target="_blank" rel="noopener noreferrer">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Open ${file.original_filename || file.filename} in a new tab`}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </a>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(file)}
                    disabled={deletingId !== null}
                    aria-label={`Delete ${file.original_filename || file.filename}`}
                  >
                    {deletingId === file.id ? (
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

      {/* Pagination (cursor-based Prev / Next) */}
      {(canGoBack || hasMore) && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={!canGoBack} onClick={handlePrev}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={!hasMore} onClick={handleNext}>
            Next
          </Button>
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8"
          onClick={() => setPreviewFile(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="media-preview-title"
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-lg bg-[var(--color-surface-elevated)] p-4"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewFile(null)}
              className="absolute right-3 top-3 rounded-md bg-black/60 p-2 text-white hover:bg-black/80"
              aria-label="Close media preview"
            >
              <X className="h-4 w-4" />
            </button>
            {isImage(previewFile.mime_type) ? (
              <img
                src={previewFile.file_url}
                alt={previewFile.original_filename || previewFile.filename}
                className="max-h-[80vh] max-w-full object-contain"
              />
            ) : isVideo(previewFile.mime_type) ? (
              <video src={previewFile.file_url} controls className="max-h-[80vh] max-w-full" />
            ) : (
              <div className="flex h-48 w-64 items-center justify-center">
                <FileImage className="h-16 w-16 text-[var(--color-text-muted)]" />
              </div>
            )}
            <div className="mt-3 text-center">
              <p id="media-preview-title" className="font-medium text-[var(--color-text-primary)]">
                {previewFile.original_filename || previewFile.filename}
              </p>
              <p className="text-sm text-[var(--color-text-muted)]">
                {formatFileSize(previewFile.file_size)}
                {previewFile.width &&
                  previewFile.height &&
                  ` — ${previewFile.width}x${previewFile.height}`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
