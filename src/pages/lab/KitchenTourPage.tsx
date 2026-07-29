import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Button, Spinner, Alert, AlertDescription, AlertTitle } from '@/components/ui';
import { SplatTourViewer } from '@/components/SplatTourViewer';
import type { TourSpatialManifest } from '@/types/tourSpatial';
import { ROUTES } from '@/constants';

const MANIFEST_URL = '/splats/kitchen_manifest.json';
const SPLAT_URL = '/splats/kitchen.splat';

/**
 * Phase A demo: constrained kitchen Gaussian tour (image-dataset splat).
 * Default path uses standpoint navigation — not SuperSplat free-flight.
 */
export function KitchenTourPage() {
  const [manifest, setManifest] = useState<TourSpatialManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(MANIFEST_URL);
        if (!res.ok) throw new Error(`Failed to load manifest (${res.status})`);
        const data = (await res.json()) as TourSpatialManifest;
        if (!cancelled) setManifest(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load tour');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] min-h-[560px] gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to={ROUTES.LAB}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Lab
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Kitchen tour (constrained)</h1>
            <p className="text-xs text-muted-foreground">
              Image-dataset GS · spawn inside · free-look + waypoints · no free-flight
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a
            href={`https://playcanvas.com/supersplat/editor?load=${encodeURIComponent(window.location.origin + SPLAT_URL)}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            Advanced free-fly (SuperSplat)
          </a>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not open tour</AlertTitle>
          <AlertDescription>
            {error}. Ensure <code className="text-xs">public/splats/kitchen.splat</code> and{' '}
            <code className="text-xs">kitchen_manifest.json</code> exist.
          </AlertDescription>
        </Alert>
      )}

      {!manifest && !error && (
        <div className="flex-1 flex items-center justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      )}

      {manifest && (
        <div className="flex-1 min-h-0">
          <SplatTourViewer manifest={manifest} splatUrl={SPLAT_URL} className="h-full" />
        </div>
      )}
    </div>
  );
}

export default KitchenTourPage;
