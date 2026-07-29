import { useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageLoader } from '@/components/ui';
import { toursApi } from '@/api';
import { useSkyboxRenderer } from '@/hooks/useSkyboxRenderer';

function TourFallbackLink({ tourId }: { tourId: string }) {
  return (
    <Link
      to={`/view/${tourId}`}
      className="text-sm text-white/60 underline underline-offset-4 hover:text-white"
    >
      Open the 360° tour instead
    </Link>
  );
}

function SkyboxViewer({ meshUrl, tourId }: { meshUrl: string; tourId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const status = useSkyboxRenderer(canvasRef, meshUrl);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} aria-label="3D world" className="block h-full w-full touch-none" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <PageLoader message="Loading 3D world..." />
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black">
          <p className="text-white">Failed to load the 3D world</p>
          <TourFallbackLink tourId={tourId} />
        </div>
      )}
    </div>
  );
}

export function View3DPage() {
  const { id } = useParams<{ id: string }>();

  const { data: tour, isLoading, isError } = useQuery({
    queryKey: ['public-tour', id],
    queryFn: () => toursApi.getPublicTour(id!, { track: false }),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black">
        <PageLoader message="Loading 3D world..." />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-2 bg-black">
        <p className="text-white">Couldn't load this tour.</p>
        <TourFallbackLink tourId={id!} />
      </div>
    );
  }

  const world3d = tour?.settings?.world_3d;

  if (world3d?.mesh_url) {
    // key: remount (and reset the loading state) if the mesh URL ever changes
    return <SkyboxViewer key={world3d.mesh_url} meshUrl={world3d.mesh_url} tourId={id!} />;
  }

  // Back-compat: older jobs stored a hosted viewer URL instead of a mesh.
  if (world3d?.viewer_url) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-black">
        <iframe
          src={world3d.viewer_url}
          allow="fullscreen; xr-spatial-tracking"
          title="3D world"
          className="h-full w-full border-0"
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-2 bg-black">
      <p className="text-white">3D world not available for this tour</p>
      <TourFallbackLink tourId={id!} />
    </div>
  );
}
