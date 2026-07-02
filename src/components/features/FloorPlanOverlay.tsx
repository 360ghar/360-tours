import { useMemo, useState } from 'react';
import { Map, ChevronUp, ChevronDown, X, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui';
import { cn } from '@/utils';
import type { FloorPlan, FloorPlanMarker, Scene } from '@/types';

interface FloorPlanOverlayProps {
  floorPlans: FloorPlan[];
  currentSceneId: string;
  scenes: Scene[];
  onSceneChange: (sceneId: string) => void;
  className?: string;
  defaultExpanded?: boolean;
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
}

export function FloorPlanOverlay({
  floorPlans,
  currentSceneId,
  scenes,
  onSceneChange,
  className,
  defaultExpanded = false,
  position = 'bottom-left',
}: FloorPlanOverlayProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isMinimized, setIsMinimized] = useState(false);
  const [manualFloorSelection, setManualFloorSelection] = useState<{
    index: number;
    sceneId: string;
  } | null>(null);

  // Sort floor plans by floor number
  const sortedFloorPlans = useMemo(
    () => [...floorPlans].sort((a, b) => a.floor_number - b.floor_number),
    [floorPlans]
  );

  const sceneFloorIndex = useMemo(() => {
    const index = sortedFloorPlans.findIndex(floorPlan =>
      floorPlan.markers.some(marker => marker.scene_id === currentSceneId)
    );
    return index >= 0 ? index : 0;
  }, [sortedFloorPlans, currentSceneId]);

  const displayedFloorIndex = useMemo(() => {
    if (!sortedFloorPlans.length) return 0;

    if (manualFloorSelection && manualFloorSelection.sceneId === currentSceneId) {
      return Math.min(Math.max(manualFloorSelection.index, 0), sortedFloorPlans.length - 1);
    }

    return sceneFloorIndex;
  }, [sortedFloorPlans.length, manualFloorSelection, currentSceneId, sceneFloorIndex]);

  const currentFloorPlan = sortedFloorPlans[displayedFloorIndex];

  const handleFloorChange = (direction: 'up' | 'down') => {
    const maxIndex = sortedFloorPlans.length - 1;
    if (direction === 'up' && displayedFloorIndex < maxIndex) {
      setManualFloorSelection({
        index: displayedFloorIndex + 1,
        sceneId: currentSceneId,
      });
    } else if (direction === 'down' && displayedFloorIndex > 0) {
      setManualFloorSelection({
        index: displayedFloorIndex - 1,
        sceneId: currentSceneId,
      });
    }
  };

  const handleMarkerClick = (marker: FloorPlanMarker) => {
    onSceneChange(marker.scene_id);
  };

  const getSceneTitle = (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    return scene?.title || 'Scene';
  };

  // Get position classes
  const positionClasses = {
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
  };

  if (!floorPlans.length || !currentFloorPlan) {
    return null;
  }

  // Minimized state - just show toggle button
  if (isMinimized) {
    return (
      <div className={cn('absolute z-10', positionClasses[position], className)}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setIsMinimized(false)}
                className="rounded-full shadow-lg bg-[var(--color-surface-elevated)]"
                aria-label="Show floor plan"
              >
                <Map className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Show floor plan</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className={cn('absolute z-10', positionClasses[position], className)}>
      <div
        className={cn(
          'rounded-lg bg-[var(--color-surface-elevated)] shadow-xl overflow-hidden transition-all duration-300',
          isExpanded ? 'w-80 h-72' : 'w-48 h-40'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center gap-2">
            <Map className="h-4 w-4 text-[var(--color-text-muted)]" />
            <span className="text-sm font-medium truncate">{currentFloorPlan.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? 'Collapse' : 'Expand'}
              aria-label={isExpanded ? 'Collapse floor plan' : 'Expand floor plan'}
              aria-expanded={isExpanded}
            >
              {isExpanded ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsMinimized(true)}
              title="Minimize"
              aria-label="Minimize floor plan"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Floor Plan Image with Markers */}
        <div className="relative flex-1 p-2" style={{ height: 'calc(100% - 72px)' }}>
          <div className="relative w-full h-full rounded overflow-hidden bg-[var(--color-surface)]">
            <img
              src={currentFloorPlan.image_url}
              alt={currentFloorPlan.name}
              className="w-full h-full object-contain"
            />

            {/* Scene Markers */}
            <TooltipProvider>
              {currentFloorPlan.markers.map(marker => (
                <Tooltip key={marker.scene_id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleMarkerClick(marker)}
                      aria-label={`Open ${marker.label || getSceneTitle(marker.scene_id)} from floor plan`}
                      aria-current={marker.scene_id === currentSceneId}
                      className={cn(
                        'absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-transform duration-200 motion-reduce:transition-none',
                        marker.scene_id === currentSceneId ? 'scale-110' : 'hover:scale-110'
                      )}
                      style={{
                        left: `${marker.x}%`,
                        top: `${marker.y}%`,
                      }}
                    >
                      <span
                        className={cn(
                          'h-4 w-4 rounded-full border-2',
                          marker.scene_id === currentSceneId
                            ? 'border-white bg-[var(--color-primary-500)] ring-2 ring-[var(--color-primary-500)]/50'
                            : 'border-[var(--color-primary-500)] bg-white'
                        )}
                      />
                      {marker.scene_id === currentSceneId && (
                        <span className="absolute h-4 w-4 motion-safe:animate-ping rounded-full bg-[var(--color-primary-500)] opacity-75" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{marker.label || getSceneTitle(marker.scene_id)}</TooltipContent>
                </Tooltip>
              ))}
            </TooltipProvider>
          </div>
        </div>

        {/* Floor Navigation (if multiple floors) */}
        {sortedFloorPlans.length > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--color-border)]">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => handleFloorChange('down')}
              disabled={displayedFloorIndex === 0}
              aria-label="Show lower floor"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <span className="text-xs text-[var(--color-text-muted)]">
              Floor {currentFloorPlan.floor_number}
              {sortedFloorPlans.length > 1 && (
                <span className="ml-1">
                  ({displayedFloorIndex + 1}/{sortedFloorPlans.length})
                </span>
              )}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => handleFloorChange('up')}
              disabled={displayedFloorIndex === sortedFloorPlans.length - 1}
              aria-label="Show higher floor"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
