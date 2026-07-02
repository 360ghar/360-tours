import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Upload,
  Save,
  MapPin,
  Layers,
  ChevronUp,
  ChevronDown,
  GripVertical,
  X,
  Check,
  Loader2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
  ScrollArea,
  Badge,
} from '@/components/ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui';
import { uploadApi } from '@/api';
import { cn } from '@/utils';
import { confirm } from '@/stores';
import type { FloorPlan, FloorPlanMarker, Scene } from '@/types';

interface FloorPlanEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  floorPlans: FloorPlan[];
  scenes: Scene[];
  onSave: (floorPlans: FloorPlan[]) => void | Promise<void>;
  isLoading?: boolean;
}

export function FloorPlanEditor({
  open,
  onOpenChange,
  floorPlans,
  scenes,
  onSave,
  isLoading = false,
}: FloorPlanEditorProps) {
  const [localFloorPlans, setLocalFloorPlans] = useState<FloorPlan[]>(floorPlans);
  const [selectedFloorIndex, setSelectedFloorIndex] = useState(0);
  const [isPlacingMarker, setIsPlacingMarker] = useState(false);
  const [pendingSceneId, setPendingSceneId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  const selectedFloorPlan = localFloorPlans[selectedFloorIndex];

  useEffect(() => {
    if (!open) return;
    setLocalFloorPlans(floorPlans);
    setSelectedFloorIndex(index => Math.min(index, Math.max(0, floorPlans.length - 1)));
  }, [floorPlans, open]);

  // Generate unique ID
  const generateId = () => `fp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Add new floor plan
  const handleAddFloorPlan = () => {
    const newFloorPlan: FloorPlan = {
      id: generateId(),
      name: `Floor ${localFloorPlans.length + 1}`,
      image_url: '',
      floor_number: localFloorPlans.length + 1,
      markers: [],
    };
    setLocalFloorPlans([...localFloorPlans, newFloorPlan]);
    setSelectedFloorIndex(localFloorPlans.length);
  };

  // Delete floor plan
  const handleDeleteFloorPlan = (index: number) => {
    void (async () => {
      if (
        !(await confirm({
          message: 'Delete this floor plan and its scene markers?',
          confirmLabel: 'Delete',
          destructive: true,
        }))
      ) {
        return;
      }

      const newFloorPlans = localFloorPlans.filter((_, i) => i !== index);
      setLocalFloorPlans(newFloorPlans);
      if (selectedFloorIndex >= newFloorPlans.length) {
        setSelectedFloorIndex(Math.max(0, newFloorPlans.length - 1));
      }
    })();
  };

  // Update floor plan
  const updateFloorPlan = (index: number, updates: Partial<FloorPlan>) => {
    setLocalFloorPlans(prev => prev.map((fp, i) => (i === index ? { ...fp, ...updates } : fp)));
  };

  // Move floor plan up/down
  const moveFloorPlan = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= localFloorPlans.length) return;

    const newFloorPlans = [...localFloorPlans];
    [newFloorPlans[index], newFloorPlans[newIndex]] = [
      newFloorPlans[newIndex],
      newFloorPlans[index],
    ];
    // Update floor numbers (map to new objects to avoid mutating state in place)
    const renumbered = newFloorPlans.map((fp, i) => ({ ...fp, floor_number: i + 1 }));
    setLocalFloorPlans(renumbered);
    setSelectedFloorIndex(newIndex);
  };

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedFloorPlan) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      const uploadResult = await uploadApi.uploadFile(file, {
        folder: 'floor-plans',
        visibility: 'public',
        onProgress: progress => setUploadProgress(progress),
      });

      updateFloorPlan(selectedFloorIndex, { image_url: uploadResult.public_url });
    } catch (error) {
      console.error('Failed to upload floor plan image:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to upload floor plan image');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      // Reset the input so the same file can be selected again
      e.target.value = '';
    }
  };

  // Start placing marker for a scene
  const handleStartPlacingMarker = (sceneId: string) => {
    setIsPlacingMarker(true);
    setPendingSceneId(sceneId);
  };

  // Handle click on floor plan image to place marker
  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isPlacingMarker || !pendingSceneId || !imageRef.current) return;

      const rect = imageRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      // Add or update marker
      const existingMarkerIndex = selectedFloorPlan.markers.findIndex(
        m => m.scene_id === pendingSceneId
      );

      const newMarker: FloorPlanMarker = {
        scene_id: pendingSceneId,
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
      };

      let newMarkers: FloorPlanMarker[];
      if (existingMarkerIndex >= 0) {
        newMarkers = selectedFloorPlan.markers.map((m, i) =>
          i === existingMarkerIndex ? newMarker : m
        );
      } else {
        newMarkers = [...selectedFloorPlan.markers, newMarker];
      }

      updateFloorPlan(selectedFloorIndex, { markers: newMarkers });
      setIsPlacingMarker(false);
      setPendingSceneId(null);
    },
    [isPlacingMarker, pendingSceneId, selectedFloorPlan, selectedFloorIndex]
  );

  // Remove marker (with confirmation — removal is irreversible until re-placed)
  const handleRemoveMarker = async (sceneId: string) => {
    if (
      !(await confirm({
        message: 'Remove this marker?',
        confirmLabel: 'Remove',
        destructive: true,
      }))
    )
      return;
    const newMarkers = selectedFloorPlan.markers.filter(m => m.scene_id !== sceneId);
    updateFloorPlan(selectedFloorIndex, { markers: newMarkers });
  };

  // Cancel marker placement
  const handleCancelPlacement = () => {
    setIsPlacingMarker(false);
    setPendingSceneId(null);
  };

  // Save changes
  const handleSave = async () => {
    if (isUploading || isSaving) return;

    setIsSaving(true);
    try {
      await onSave(localFloorPlans);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Get scene by ID
  const getScene = (sceneId: string) => scenes.find(s => s.id === sceneId);

  // Check if scene has marker on current floor
  const hasMarker = (sceneId: string) =>
    selectedFloorPlan?.markers.some(m => m.scene_id === sceneId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        data-testid="floor-plan-editor"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Floor Plan Editor
          </DialogTitle>
          <DialogDescription>
            Upload floor plan images and place scene markers to create an interactive map.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Left sidebar - Floor list */}
          <div className="w-56 shrink-0 border-r border-[var(--color-border)] pr-4">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium">Floors</Label>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleAddFloorPlan}
                aria-label="Add floor plan"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {localFloorPlans.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)] text-center py-4">
                    No floor plans yet.
                    <br />
                    Click + to add one.
                  </p>
                ) : (
                  localFloorPlans.map((fp, index) => (
                    <div
                      key={fp.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedFloorIndex === index}
                      aria-label={`Select ${fp.name || `Floor ${index + 1}`}`}
                      className={cn(
                        'group flex items-center gap-2 rounded-lg p-2 cursor-pointer transition-colors',
                        selectedFloorIndex === index
                          ? 'bg-[var(--color-primary-50)] border border-[var(--color-primary-200)]'
                          : 'hover:bg-[var(--color-surface-elevated)]'
                      )}
                      onClick={() => setSelectedFloorIndex(index)}
                      onKeyDown={e => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedFloorIndex(index);
                        }
                      }}
                    >
                      <GripVertical className="h-4 w-4 text-[var(--color-text-muted)] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <Input
                          value={fp.name}
                          onChange={e => updateFloorPlan(index, { name: e.target.value })}
                          onClick={e => e.stopPropagation()}
                          className="h-7 text-sm px-2"
                          placeholder="Floor name"
                        />
                      </div>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Move ${fp.name || `Floor ${index + 1}`} up`}
                          onClick={e => {
                            e.stopPropagation();
                            moveFloorPlan(index, 'up');
                          }}
                          disabled={index === 0}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Move ${fp.name || `Floor ${index + 1}`} down`}
                          onClick={e => {
                            e.stopPropagation();
                            moveFloorPlan(index, 'down');
                          }}
                          disabled={index === localFloorPlans.length - 1}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${fp.name || `Floor ${index + 1}`}`}
                          onClick={e => {
                            e.stopPropagation();
                            handleDeleteFloorPlan(index);
                          }}
                          className="text-[var(--color-error-500)]"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Center - Floor plan image */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedFloorPlan ? (
              <>
                {/* Image upload / display */}
                <div
                  ref={imageRef}
                  className={cn(
                    'relative flex-1 rounded-lg border-2 border-dashed overflow-hidden',
                    isPlacingMarker
                      ? 'border-[var(--color-primary-500)] cursor-crosshair'
                      : 'border-[var(--color-border)]'
                  )}
                  onClick={handleImageClick}
                >
                  {selectedFloorPlan.image_url ? (
                    <>
                      <img
                        src={selectedFloorPlan.image_url}
                        alt={selectedFloorPlan.name}
                        className="w-full h-full object-contain"
                      />

                      {/* Markers */}
                      <TooltipProvider>
                        {selectedFloorPlan.markers.map(marker => {
                          const scene = getScene(marker.scene_id);
                          return (
                            <Tooltip key={marker.scene_id}>
                              <TooltipTrigger asChild>
                                <div
                                  role="button"
                                  tabIndex={0}
                                  aria-label={`Remove marker for ${scene?.title || 'scene'}`}
                                  className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-primary-500)] border-2 border-white shadow-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
                                  style={{
                                    left: `${marker.x}%`,
                                    top: `${marker.y}%`,
                                  }}
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (!isPlacingMarker) {
                                      handleRemoveMarker(marker.scene_id);
                                    }
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (!isPlacingMarker) {
                                        handleRemoveMarker(marker.scene_id);
                                      }
                                    }
                                  }}
                                >
                                  <MapPin className="h-3 w-3 text-white" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                {scene?.title || 'Scene'} (click to remove)
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </TooltipProvider>

                      {/* Placement mode indicator */}
                      {isPlacingMarker && (
                        <div className="absolute top-2 left-2 right-2 flex items-center justify-between bg-[var(--color-primary-500)] text-white px-3 py-2 rounded-lg">
                          <span className="text-sm">
                            Click to place marker for:{' '}
                            <strong>{getScene(pendingSceneId!)?.title || 'Scene'}</strong>
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={e => {
                              e.stopPropagation();
                              handleCancelPlacement();
                            }}
                            className="text-white hover:bg-white/20"
                            aria-label="Cancel marker placement"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <label
                      className={cn(
                        'flex flex-col items-center justify-center h-full',
                        isUploading ? 'cursor-wait' : 'cursor-pointer'
                      )}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="h-10 w-10 text-[var(--color-primary-500)] mb-3 animate-spin" />
                          <span className="text-sm text-[var(--color-text-muted)]">
                            Uploading... {uploadProgress}%
                          </span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-10 w-10 text-[var(--color-text-muted)] mb-3" />
                          <span className="text-sm text-[var(--color-text-muted)]">
                            Click to upload floor plan image
                          </span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={isUploading}
                      />
                    </label>
                  )}
                </div>

                {/* Change image button */}
                {selectedFloorPlan.image_url && (
                  <div className="mt-2">
                    <label>
                      <Button variant="outline" size="sm" asChild disabled={isUploading}>
                        <span>
                          {isUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          {isUploading ? `Uploading... ${uploadProgress}%` : 'Change Image'}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                            disabled={isUploading}
                          />
                        </span>
                      </Button>
                    </label>
                  </div>
                )}
                {uploadError && (
                  <p role="alert" className="mt-2 text-sm text-[var(--color-error-600)]">
                    {uploadError}
                  </p>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)]">
                Select or add a floor plan to get started
              </div>
            )}
          </div>

          {/* Right sidebar - Scene list */}
          {selectedFloorPlan && (
            <div className="w-56 shrink-0 border-l border-[var(--color-border)] pl-4">
              <Label className="text-sm font-medium mb-3 block">Scenes</Label>
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {scenes.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-muted)] text-center py-4">
                      No scenes in this tour
                    </p>
                  ) : (
                    scenes.map(scene => (
                      <div
                        key={scene.id}
                        className={cn(
                          'flex items-center gap-2 rounded-lg p-2 transition-colors',
                          hasMarker(scene.id)
                            ? 'bg-[var(--color-success-50)] border border-[var(--color-success-200)]'
                            : 'bg-[var(--color-surface-elevated)]'
                        )}
                      >
                        <div className="w-10 h-10 rounded overflow-hidden shrink-0 bg-[var(--color-surface)]">
                          <img
                            src={scene.thumbnail_url || scene.image_url}
                            alt={scene.title || 'Scene'}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {scene.title || `Scene ${scene.order_index + 1}`}
                          </p>
                          {hasMarker(scene.id) && (
                            <Badge variant="success" className="text-xs mt-0.5">
                              <Check className="h-3 w-3 mr-0.5" />
                              Placed
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleStartPlacingMarker(scene.id)}
                          disabled={!selectedFloorPlan.image_url}
                          title={hasMarker(scene.id) ? 'Move marker' : 'Place marker'}
                          aria-label={`${hasMarker(scene.id) ? 'Move' : 'Place'} marker for ${
                            scene.title || `Scene ${scene.order_index + 1}`
                          }`}
                        >
                          <MapPin className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4 pt-4 border-t border-[var(--color-border)]">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} isLoading={isLoading || isSaving} disabled={isUploading}>
            <Save className="h-4 w-4" />
            Save Floor Plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
