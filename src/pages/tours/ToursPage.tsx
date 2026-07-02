import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  MoreVertical,
  Eye,
  Pencil,
  Trash2,
  Copy,
  ExternalLink,
  Grid3X3,
  List,
  Images,
  Clock,
  Archive,
  ArchiveRestore,
} from 'lucide-react';
import { Card, CardContent, Button, Input, Badge, Skeleton, SkeletonCard } from '@/components/ui';
import { toursApi } from '@/api';
import { useUIStore, confirm } from '@/stores';
import { ROUTES, QUERY_KEYS, TOUR_STATUS_OPTIONS } from '@/constants';
import { formatCompactNumber, formatRelativeTime } from '@/utils/format';
import { useDebounce } from '@/hooks';
import type { Tour } from '@/types';
import { cn } from '@/utils';

type ViewMode = 'grid' | 'list';

export function ToursPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const addToast = useUIStore(s => s.addToast);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [cursor, setCursor] = useState<string | null>(null);
  // Stack of cursors used for previous pages, enabling a "Prev" navigation.
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Fetch tours (cursor pagination)
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [QUERY_KEYS.TOURS, { cursor, search: debouncedSearch, status: statusFilter }],
    queryFn: () =>
      toursApi.getTours({
        cursor,
        limit: 12,
        search: debouncedSearch || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
  });

  // Reset to first page whenever the debounced search or status filter changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCursor(null);
    setCursorHistory([]);
  }, [debouncedSearch, statusFilter]);

  // Delete tour mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => toursApi.deleteTour(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOURS] });
    },
    onError: (error: Error) => {
      addToast({ type: 'error', message: error.message || 'Action failed' });
    },
  });

  // Duplicate tour mutation
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => toursApi.duplicateTour(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOURS] });
    },
    onError: (error: Error) => {
      addToast({ type: 'error', message: error.message || 'Action failed' });
    },
  });

  // Archive/unarchive tour mutation
  const archiveMutation = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      toursApi.updateTour(id, { status: archive ? 'archived' : 'draft' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOURS] });
    },
    onError: (error: Error) => {
      addToast({ type: 'error', message: error.message || 'Action failed' });
    },
  });

  const tours = data?.items || [];
  const total = data?.total;
  const hasMore = data?.has_more ?? false;
  const canGoBack = cursorHistory.length > 0;
  const hasActiveFilters = searchQuery.trim().length > 0 || statusFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
  };

  const handleNext = () => {
    if (!data?.next_cursor) return;
    setCursorHistory(h => [...h, cursor ?? '']);
    setCursor(data.next_cursor);
  };

  const handlePrev = () => {
    if (cursorHistory.length === 0) return;
    const prev = cursorHistory[cursorHistory.length - 1];
    setCursorHistory(h => h.slice(0, -1));
    setCursor(prev || null);
  };

  const handleDelete = async (tour: Tour) => {
    if (
      await confirm({
        title: 'Delete tour',
        message: `Are you sure you want to delete "${tour.title}"?`,
        confirmLabel: 'Delete',
        destructive: true,
      })
    ) {
      try {
        await deleteMutation.mutateAsync(tour.id);
      } catch {
        // Error toast is handled by the mutation.
      }
    }
  };

  const handleDuplicate = async (tour: Tour) => {
    try {
      await duplicateMutation.mutateAsync(tour.id);
    } catch {
      // Error toast is handled by the mutation.
    }
  };

  const handleArchive = async (tour: Tour) => {
    const archive = tour.status !== 'archived';
    try {
      await archiveMutation.mutateAsync({ id: tour.id, archive });
    } catch {
      // Error toast is handled by the mutation.
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Tours</h1>
          <p className="mt-1 text-[var(--color-text-muted)]">
            Manage and organize your virtual tours
          </p>
        </div>
        <Link to={ROUTES.TOUR_CREATE}>
          <Button>
            <Plus className="h-4 w-4" />
            Create Tour
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tours..."
              aria-label="Search tours"
              className="pl-10"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            aria-label="Filter tours by status"
            className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)]"
          >
            <option value="all">All Status</option>
            {TOUR_STATUS_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] p-1">
          <button
            type="button"
            aria-label="Show tours as grid"
            aria-pressed={viewMode === 'grid'}
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
            type="button"
            aria-label="Show tours as list"
            aria-pressed={viewMode === 'list'}
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

      {/* Tours Grid/List */}
      {isLoading ? (
        <div
          className={cn(
            viewMode === 'grid'
              ? 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              : 'space-y-4'
          )}
        >
          {[...Array(12)].map((_, i) =>
            viewMode === 'grid' ? (
              <SkeletonCard key={i} />
            ) : (
              <Skeleton key={i} className="h-20 w-full" />
            )
          )}
        </div>
      ) : isError ? (
        <Card className="py-16">
          <CardContent className="text-center">
            <Images className="mx-auto h-16 w-16 text-[var(--color-text-muted)]" />
            <h3 className="mt-4 text-lg font-semibold text-[var(--color-text-primary)]">
              Tours could not load
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-text-muted)]">
              {error instanceof Error ? error.message : 'Refresh the list and try again.'}
            </p>
            <Button type="button" variant="outline" className="mt-6" onClick={() => void refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : tours.length === 0 ? (
        <Card className="py-16">
          <CardContent className="text-center">
            <Images className="mx-auto h-16 w-16 text-[var(--color-text-muted)]" />
            <h3 className="mt-4 text-lg font-semibold text-[var(--color-text-primary)]">
              {hasActiveFilters ? 'No tours match these filters' : 'No tours yet'}
            </h3>
            <p className="mt-2 text-[var(--color-text-muted)]">
              {hasActiveFilters
                ? 'Clear the search or status filter to see more tours.'
                : 'Create your first virtual tour to get started'}
            </p>
            {hasActiveFilters ? (
              <Button type="button" variant="outline" className="mt-6" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Link to={ROUTES.TOUR_CREATE}>
                <Button className="mt-6">
                  <Plus className="h-4 w-4" />
                  Create Tour
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tours.map(tour => (
            <TourCard
              key={tour.id}
              tour={tour}
              onEdit={() => navigate(`/tours/${tour.id}/edit`)}
              onDelete={() => handleDelete(tour)}
              onDuplicate={() => handleDuplicate(tour)}
              onArchive={() => handleArchive(tour)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {tours.map(tour => (
            <TourListItem
              key={tour.id}
              tour={tour}
              onEdit={() => navigate(`/tours/${tour.id}/edit`)}
              onDelete={() => handleDelete(tour)}
              onDuplicate={() => handleDuplicate(tour)}
              onArchive={() => handleArchive(tour)}
            />
          ))}
        </div>
      )}

      {/* Pagination (cursor-based Prev / Next) */}
      {(canGoBack || hasMore) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={!canGoBack} onClick={handlePrev}>
            Previous
          </Button>
          <span className="px-3 text-sm text-[var(--color-text-muted)]">
            Showing {tours.length}
            {typeof total === 'number' ? ` of ${total}` : ''} tours
          </span>
          <Button variant="outline" size="sm" disabled={!hasMore} onClick={handleNext}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

// Tour Card Component
interface TourCardProps {
  tour: Tour;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
}

function TourCard({ tour, onEdit, onDelete, onDuplicate, onArchive }: TourCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <Card className="group transition-shadow hover:shadow-md">
      <div className="relative aspect-video overflow-hidden rounded-t-lg bg-[var(--color-surface)]">
        {tour.thumbnail_url ? (
          <img
            src={tour.thumbnail_url}
            alt={tour.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Images className="h-12 w-12 text-[var(--color-text-muted)]" />
          </div>
        )}
        <div className="absolute right-2 top-2">
          <Badge
            variant={
              tour.status === 'published'
                ? 'success'
                : tour.status === 'archived'
                  ? 'warning'
                  : 'secondary'
            }
          >
            {tour.status}
          </Badge>
        </div>
      </div>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-[var(--color-text-primary)]">
              {tour.title}
            </h3>
            <div className="mt-2 flex items-center gap-4 text-sm text-[var(--color-text-muted)]">
              <span className="flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                {formatCompactNumber(tour.view_count)}
              </span>
              <span className="flex items-center gap-1">
                <Images className="h-3.5 w-3.5" />
                {tour.scene_count || 0} scenes
              </span>
            </div>
            <p className="mt-1 flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(tour.updated_at)}
            </p>
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Open actions for ${tour.title}`}
              onClick={() => setShowMenu(!showMenu)}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onEdit();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-[var(--color-surface)]"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onDuplicate();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-[var(--color-surface)]"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </button>
                  {tour.status === 'published' && (
                    <a
                      href={`/view/${tour.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-[var(--color-surface)]"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Live
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onArchive();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-[var(--color-surface)]"
                  >
                    {tour.status === 'archived' ? (
                      <>
                        <ArchiveRestore className="h-4 w-4" />
                        Unarchive
                      </>
                    ) : (
                      <>
                        <Archive className="h-4 w-4" />
                        Archive
                      </>
                    )}
                  </button>
                  <hr className="my-1 border-[var(--color-border)]" />
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onDelete();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--color-error-600)] hover:bg-[var(--color-error-50)]"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Tour List Item Component
function TourListItem({ tour, onEdit, onDelete, onDuplicate, onArchive }: TourCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="h-36 w-full flex-shrink-0 overflow-hidden rounded-lg bg-[var(--color-surface)] sm:h-16 sm:w-24">
          {tour.thumbnail_url ? (
            <img
              src={tour.thumbnail_url}
              alt={tour.title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Images className="h-8 w-8 text-[var(--color-text-muted)]" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-[var(--color-text-primary)]">
              {tour.title}
            </h3>
            <Badge
              variant={
                tour.status === 'published'
                  ? 'success'
                  : tour.status === 'archived'
                    ? 'warning'
                    : 'secondary'
              }
            >
              {tour.status}
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-4 text-sm text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" />
              {formatCompactNumber(tour.view_count)} views
            </span>
            <span className="flex items-center gap-1">
              <Images className="h-3.5 w-3.5" />
              {tour.scene_count || 0} scenes
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatRelativeTime(tour.updated_at)}
            </span>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Duplicate ${tour.title}`}
            onClick={onDuplicate}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${tour.status === 'archived' ? 'Unarchive' : 'Archive'} ${tour.title}`}
            title={tour.status === 'archived' ? 'Unarchive' : 'Archive'}
            onClick={onArchive}
          >
            {tour.status === 'archived' ? (
              <ArchiveRestore className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${tour.title}`}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 text-[var(--color-error-600)]" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
