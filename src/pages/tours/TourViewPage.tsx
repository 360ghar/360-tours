import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Share2, BarChart3, Film } from 'lucide-react';
import {
  Button,
  PageLoader,
  Badge,
  Card,
  CardContent,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui';
import { toursApi } from '@/api';
import { QUERY_KEYS, ROUTES } from '@/constants';
import { formatCompactNumber, formatDate } from '@/utils/format';
import { PanoramaViewer } from '@/components/features/PanoramaViewer';
import { ShareModal } from '@/components/features/ShareModal';
import { ReelGeneratorModal } from '@/components/features/ai';

export function TourViewPage() {
  const { id } = useParams<{ id: string }>();
  const [shareOpen, setShareOpen] = useState(false);
  const [reelOpen, setReelOpen] = useState(false);

  const { data: tour, isLoading: isLoadingTour } = useQuery({
    queryKey: [QUERY_KEYS.TOUR, id],
    queryFn: () => toursApi.getTour(id!),
    enabled: !!id,
  });

  const { data: scenes, isLoading: isLoadingScenes } = useQuery({
    queryKey: [QUERY_KEYS.SCENES, id],
    queryFn: () => toursApi.getScenes(id!),
    enabled: !!id,
  });

  const sortedScenes = useMemo(
    () => (scenes ? [...scenes].sort((a, b) => a.order_index - b.order_index) : undefined),
    [scenes]
  );

  if (isLoadingTour || isLoadingScenes) {
    return <PageLoader message="Loading tour..." />;
  }

  if (!tour) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-xl font-semibold">Tour not found</h2>
        <Link to={ROUTES.TOURS}>
          <Button variant="outline" className="mt-4">
            Back to Tours
          </Button>
        </Link>
      </div>
    );
  }

  const firstScene = sortedScenes?.[0];

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Link to={ROUTES.TOURS}>
            <Button variant="ghost" size="icon" aria-label="Back to tours">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{tour.title}</h1>
              <Badge variant={tour.status === 'published' ? 'success' : 'secondary'}>
                {tour.status}
              </Badge>
            </div>
            {tour.description && (
              <p className="mt-1 text-[var(--color-text-muted)]">{tour.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/tours/${id}/analytics`}>
            <Button variant="outline">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </Button>
          </Link>
          {tour.status === 'published' ? (
            <Button variant="outline" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4" />
              Share
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button variant="outline" disabled title="Publish the tour to share it">
                      <Share2 className="h-4 w-4" />
                      Share
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Publish the tour to share it</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button
            variant="outline"
            onClick={() => setReelOpen(true)}
            disabled={!scenes || scenes.length === 0}
            title={!scenes || scenes.length === 0 ? 'Add scenes before creating a reel' : undefined}
          >
            <Film className="h-4 w-4" />
            Create Reel
          </Button>
          <Link to={`/tours/${id}/edit`}>
            <Button>
              <Pencil className="h-4 w-4" />
              Edit Tour
            </Button>
          </Link>
        </div>
      </div>

      {/* Preview */}
      <Card>
        <CardContent className="p-0">
          <div className="aspect-video overflow-hidden rounded-t-xl">
            {firstScene ? (
              <PanoramaViewer scene={firstScene} hotspots={firstScene.hotspots || []} />
            ) : (
              <div className="flex h-full min-h-[400px] items-center justify-center bg-[var(--color-surface)]">
                <p className="text-[var(--color-text-muted)]">
                  No scenes available. Add 360° images to view the tour.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tour Info */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-[var(--color-text-muted)]">Total Views</p>
            <p className="mt-1 text-2xl font-bold">{formatCompactNumber(tour.view_count)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-[var(--color-text-muted)]">Likes</p>
            <p className="mt-1 text-2xl font-bold">{formatCompactNumber(tour.like_count)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-[var(--color-text-muted)]">Shares</p>
            <p className="mt-1 text-2xl font-bold">{formatCompactNumber(tour.share_count)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-[var(--color-text-muted)]">Scenes</p>
            <p className="mt-1 text-2xl font-bold">{scenes?.length || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Scenes Grid */}
      {sortedScenes && sortedScenes.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Scenes</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sortedScenes.map(scene => (
              <Card key={scene.id} className="overflow-hidden">
                <div className="aspect-video overflow-hidden bg-[var(--color-surface)]">
                  {scene.thumbnail_url ? (
                    <img
                      src={scene.thumbnail_url}
                      alt={scene.title || 'Scene'}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <img
                      src={scene.image_url}
                      alt={scene.title || 'Scene'}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <CardContent className="p-3">
                  <p className="truncate font-medium">
                    {scene.title || `Scene ${scene.order_index + 1}`}
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {scene.hotspots?.length || 0} hotspots
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tour Details */}
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Tour Details</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-sm text-[var(--color-text-muted)]">Created</p>
              <p className="font-medium">{formatDate(tour.created_at)}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--color-text-muted)]">Last Updated</p>
              <p className="font-medium">{formatDate(tour.updated_at)}</p>
            </div>
            {tour.published_at && (
              <div>
                <p className="text-sm text-[var(--color-text-muted)]">Published</p>
                <p className="font-medium">{formatDate(tour.published_at)}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-[var(--color-text-muted)]">Visibility</p>
              <Badge
                variant={
                  tour.visibility === 'public'
                    ? 'success'
                    : tour.visibility === 'unlisted'
                      ? 'warning'
                      : 'secondary'
                }
              >
                {tour.visibility === 'public'
                  ? 'Public'
                  : tour.visibility === 'unlisted'
                    ? 'Unlisted'
                    : 'Private'}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-[var(--color-text-muted)]">Auto Rotate</p>
              <p className="font-medium">{tour.settings?.auto_rotate ? 'Enabled' : 'Disabled'}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--color-text-muted)]">VR Mode</p>
              <p className="font-medium">{tour.settings?.enable_vr ? 'Enabled' : 'Disabled'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Share Modal */}
      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        tourId={id!}
        tourTitle={tour.title}
        tourDescription={tour.description || undefined}
      />

      {/* Reel Generator Modal */}
      <ReelGeneratorModal
        open={reelOpen}
        onOpenChange={setReelOpen}
        tourId={id!}
        scenes={scenes ?? []}
      />
    </div>
  );
}
