import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Eye,
  Save,
  Settings,
  Share2,
  Trash2,
  ExternalLink,
  MoreVertical,
  Archive,
  Copy,
  Upload,
  Crosshair,
  Palette,
  Map,
  Sparkles,
  Wand2,
  Lightbulb,
} from 'lucide-react';
import {
  Button,
  PageLoader,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui';
import { toursApi } from '@/api';
import { QUERY_KEYS, ROUTES } from '@/constants';
import { useTourEditorStore } from '@/stores';
import { PanoramaViewer } from '@/components/features/PanoramaViewer';
import { ScenePanel } from '@/components/features/ScenePanel';
import { HotspotPanel } from '@/components/features/HotspotPanel';
import { HotspotEditorModal } from '@/components/features/HotspotEditorModal';
import { TourSettingsPanel } from '@/components/features/TourSettingsPanel';
import { BulkUploader } from '@/components/features/BulkUploader';
import { BrandingPanel } from '@/components/features/BrandingPanel';
import { FloorPlanEditor } from '@/components/features/FloorPlanEditor';
import { SceneAnalysis, DescriptionGenerator, HotspotSuggestions } from '@/components/features/ai';
import { cn } from '@/utils';
import { useEffect, useState, useCallback } from 'react';
import { useToast } from '@/hooks/useToast';
import { DEFAULT_TOUR_SETTINGS } from '@/constants';
import type { BrandingSettings, FloorPlan, HotspotCreateInput, Tour } from '@/types';
import type { HotspotSuggestion } from '@/api';

export function TourEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Local state
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkUploader, setShowBulkUploader] = useState(false);
  const [showBranding, setShowBranding] = useState(false);
  const [showFloorPlans, setShowFloorPlans] = useState(false);
  const [showSceneAnalysis, setShowSceneAnalysis] = useState(false);
  const [showDescriptions, setShowDescriptions] = useState(false);
  const [showHotspotSuggestions, setShowHotspotSuggestions] = useState(false);
  const [isPlacingHotspot, setIsPlacingHotspot] = useState(false);
  const [placementPosition, setPlacementPosition] = useState<{ yaw: number; pitch: number } | null>(null);
  const [showHotspotEditor, setShowHotspotEditor] = useState(false);

  const {
    currentTour,
    currentSceneId,
    showScenePanel,
    showHotspotPanel,
    hasUnsavedChanges,
    setCurrentTour,
    setCurrentScene,
    selectHotspot,
    reset,
  } = useTourEditorStore();
  const currentScene = currentTour?.scenes?.find((s) => s.id === currentSceneId);

  // Block navigation if there are unsaved changes
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname
  );

  // Block browser close/refresh if there are unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Fetch tour data
  const { data: tour, isLoading } = useQuery({
    queryKey: [QUERY_KEYS.TOUR, id],
    queryFn: () => toursApi.getTour(id!),
    enabled: !!id,
  });

  // Fetch scenes
  const { data: scenes } = useQuery({
    queryKey: [QUERY_KEYS.SCENES, id],
    queryFn: () => toursApi.getScenes(id!),
    enabled: !!id,
  });

  // Update tour mutation
  const updateMutation = useMutation({
    mutationFn: () => {
      if (!currentTour) throw new Error('No tour to update');
      return toursApi.updateTour(currentTour.id, {
        title: currentTour.title,
        description: currentTour.description ?? undefined,
        status: currentTour.status,
        visibility: currentTour.visibility,
        settings: currentTour.settings ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, id] });
      toast('success', 'Your changes have been saved successfully.', { title: 'Tour saved' });
    },
    onError: () => {
      toast('error', 'Something went wrong. Please try again.', { title: 'Failed to save' });
    },
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges) {
          updateMutation.mutate();
        }
      }
      // Escape to deselect scene or exit hotspot placement mode
      if (e.key === 'Escape') {
        if (isPlacingHotspot) {
          setIsPlacingHotspot(false);
        } else if (currentSceneId) {
          setCurrentScene(null);
        }
      }
      // 'H' to toggle hotspot placement mode
      if (e.key === 'h' || e.key === 'H') {
        if (currentSceneId) {
          setIsPlacingHotspot((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentSceneId,
    hasUnsavedChanges,
    isPlacingHotspot,
    setCurrentScene,
    updateMutation,
  ]);

  // Publish tour mutation
  const publishMutation = useMutation({
    mutationFn: () => toursApi.publishTour(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, id] });
      toast('success', 'Your tour is now live and can be shared.', { title: 'Tour published' });
    },
    onError: () => {
      toast('error', 'Something went wrong. Please try again.', { title: 'Failed to publish' });
    },
  });

  // Unpublish tour mutation
  const unpublishMutation = useMutation({
    mutationFn: () => toursApi.unpublishTour(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, id] });
      toast('success', 'Your tour has been set to draft.', { title: 'Tour unpublished' });
    },
  });

  // Duplicate tour mutation
  const duplicateMutation = useMutation({
    mutationFn: () => toursApi.duplicateTour(id!),
    onSuccess: (duplicatedTour) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOURS] });
      toast('success', 'A copy of your tour has been created.', { title: 'Tour duplicated' });
      navigate(`${ROUTES.TOURS}/${duplicatedTour.id}/edit`);
    },
  });

  // Delete tour mutation
  const deleteMutation = useMutation({
    mutationFn: () => toursApi.deleteTour(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOURS] });
      toast('success', 'Your tour has been permanently deleted.', { title: 'Tour deleted' });
      navigate(ROUTES.TOURS);
    },
  });

  // Handle settings save
  const handleSettingsSave = useCallback(
    (updates: Partial<Tour>) => {
      if (!currentTour) return;

      // Update local state
      setCurrentTour({
        ...currentTour,
        ...updates,
      });

      // Save to server - handle null values for description
      const updatePayload = {
        ...updates,
        description: updates.description ?? undefined,
      };

      toursApi
        .updateTour(currentTour.id, updatePayload as Parameters<typeof toursApi.updateTour>[1])
        .then(() => {
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, id] });
          toast('success', 'Tour settings have been updated.', { title: 'Settings saved' });
          setShowSettings(false);
        })
        .catch(() => {
          toast('error', 'Something went wrong. Please try again.', { title: 'Failed to save settings' });
        });
    },
    [currentTour, id, queryClient, setCurrentTour, toast]
  );

  // Handle preview
  const handlePreview = useCallback(() => {
    window.open(`/view/${id}`, '_blank');
  }, [id]);

  // Handle position click for hotspot placement
  const handlePositionClick = useCallback((position: { yaw: number; pitch: number }) => {
    if (isPlacingHotspot && currentSceneId) {
      setPlacementPosition(position);
      setShowHotspotEditor(true);
      setIsPlacingHotspot(false);
    }
  }, [isPlacingHotspot, currentSceneId]);

  // Handle hotspot editor close
  const handleHotspotEditorClose = useCallback((open: boolean) => {
    setShowHotspotEditor(open);
    if (!open) {
      setPlacementPosition(null);
    }
  }, []);

  // Handle hotspot drag-to-reposition
  const handleHotspotDrag = useCallback(async (hotspotId: string, position: { yaw: number; pitch: number }) => {
    try {
      await toursApi.updateHotspotPosition(hotspotId, position);
      // Refresh scenes to update hotspot position in UI
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SCENES, id] });
      toast('success', 'Position updated successfully.', { title: 'Hotspot moved' });
    } catch {
      toast('error', 'Could not update hotspot position.', { title: 'Failed to move hotspot' });
    }
  }, [id, queryClient, toast]);

  const saveTourSettings = useCallback(
    async (settings: Tour['settings'], successTitle: string, successMessage: string) => {
      if (!currentTour || !settings) return;

      setCurrentTour({
        ...currentTour,
        settings,
      });

      await toursApi.updateTour(currentTour.id, { settings });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, id] });
      toast('success', successMessage, { title: successTitle });
    },
    [currentTour, id, queryClient, setCurrentTour, toast]
  );

  const handleBrandingSave = useCallback(
    (branding: BrandingSettings) => {
      const settings = {
        ...DEFAULT_TOUR_SETTINGS,
        ...(currentTour?.settings ?? {}),
        branding: {
          ...DEFAULT_TOUR_SETTINGS.branding,
          ...branding,
        },
      };

      saveTourSettings(settings, 'Branding saved', 'Branding has been applied to this tour.').catch(() => {
        toast('error', 'Could not save branding. Please try again.', { title: 'Failed to save branding' });
      });
    },
    [currentTour?.settings, saveTourSettings, toast]
  );

  const handleFloorPlansSave = useCallback(
    (floorPlans: FloorPlan[]) => {
      const settings = {
        ...DEFAULT_TOUR_SETTINGS,
        ...(currentTour?.settings ?? {}),
        floor_plans: floorPlans,
      };

      saveTourSettings(settings, 'Floor plans saved', 'Floor plan navigation has been updated.').catch(() => {
        toast('error', 'Could not save floor plans. Please try again.', { title: 'Failed to save floor plans' });
      });
    },
    [currentTour?.settings, saveTourSettings, toast]
  );

  const handleApplySceneAnalysis = useCallback(
    (updates: Array<{ scene_id: string; title?: string; description?: string }>) => {
      Promise.all(
        updates.map((update) =>
          toursApi.updateScene(update.scene_id, {
            title: update.title,
            description: update.description,
          })
        )
      )
        .then(() => {
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SCENES, id] });
          toast('success', `${updates.length} scene${updates.length === 1 ? '' : 's'} updated.`, {
            title: 'AI suggestions applied',
          });
        })
        .catch(() => {
          toast('error', 'Could not apply AI scene suggestions.', { title: 'Failed to update scenes' });
        });
    },
    [id, queryClient, toast]
  );

  const handleApplyDescriptions = useCallback(
    (descriptions: Record<string, string>) => {
      const entries = Object.entries(descriptions);
      Promise.all(
        entries.map(([sceneId, description]) =>
          toursApi.updateScene(sceneId, { description })
        )
      )
        .then(() => {
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SCENES, id] });
          toast('success', `${entries.length} description${entries.length === 1 ? '' : 's'} applied.`, {
            title: 'Descriptions updated',
          });
        })
        .catch(() => {
          toast('error', 'Could not apply AI descriptions.', { title: 'Failed to update descriptions' });
        });
    },
    [id, queryClient, toast]
  );

  const handleApplyHotspotSuggestions = useCallback(
    (suggestions: HotspotSuggestion[]) => {
      if (!currentScene) return;

      Promise.all(
        suggestions.map((suggestion) => {
          const payload: HotspotCreateInput = {
            type: suggestion.type,
            position: suggestion.position,
            target_scene_id: suggestion.target_scene_id ?? null,
            title: suggestion.suggested_title ?? null,
            icon_name: suggestion.type === 'navigation' ? 'arrow-right' : 'info',
            icon_color: suggestion.type === 'navigation' ? '#FF5733' : '#10b981',
            icon_size: 32,
            content:
              suggestion.type === 'navigation'
                ? { kind: 'navigation', label: suggestion.suggested_title }
                : { kind: 'info', text: suggestion.reasoning },
          };

          return toursApi.createHotspot(currentScene.id, payload);
        })
      )
        .then(() => {
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SCENES, id] });
          toast('success', `${suggestions.length} hotspot${suggestions.length === 1 ? '' : 's'} added.`, {
            title: 'AI hotspots applied',
          });
        })
        .catch(() => {
          toast('error', 'Could not add AI hotspot suggestions.', { title: 'Failed to add hotspots' });
        });
    },
    [currentScene, id, queryClient, toast]
  );

  // Initialize tour in store
  useEffect(() => {
    if (tour && scenes) {
      setCurrentTour({ ...tour, scenes });
    }
    return () => reset();
  }, [tour, scenes, setCurrentTour, reset]);

  if (isLoading) {
    return <PageLoader message="Loading tour..." />;
  }

  if (!tour) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-xl font-semibold">Tour not found</h2>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate(ROUTES.TOURS)}
        >
          Back to Tours
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-4rem)] flex-col">
        {/* Editor Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
          <div className="flex items-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => navigate(ROUTES.TOURS)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to Tours</TooltipContent>
            </Tooltip>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-[var(--color-text-primary)]">
                  {currentTour?.title || tour.title}
                </h1>
                <Badge
                  variant={currentTour?.status === 'published' ? 'success' : 'secondary'}
                >
                  {currentTour?.status || tour.status}
                </Badge>
                {hasUnsavedChanges && (
                  <Badge variant="warning">Unsaved changes</Badge>
                )}
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">
                {currentTour?.scenes?.length || 0} scenes
                <span className="mx-2">•</span>
                <span className="text-xs">Ctrl+S to save</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBulkUploader(true)}
                >
                  <Upload className="h-4 w-4" />
                  Upload
                </Button>
              </TooltipTrigger>
              <TooltipContent>Bulk upload 360° images</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handlePreview}>
                  <Eye className="h-4 w-4" />
                  Preview
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open tour in new tab</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSettings(true)}
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Button>
              </TooltipTrigger>
              <TooltipContent>Tour settings & embed code</TooltipContent>
            </Tooltip>

            <Button
              size="sm"
              isLoading={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
              disabled={!hasUnsavedChanges}
            >
              <Save className="h-4 w-4" />
              Save
            </Button>

            {currentTour?.status !== 'published' ? (
              <Button
                variant="success"
                size="sm"
                isLoading={publishMutation.isPending}
                onClick={() => publishMutation.mutate()}
              >
                Publish
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                isLoading={unpublishMutation.isPending}
                onClick={() => unpublishMutation.mutate()}
              >
                Unpublish
              </Button>
            )}

            {/* More Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handlePreview}>
                  <ExternalLink className="h-4 w-4" />
                  Open in New Tab
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowSettings(true)}>
                  <Share2 className="h-4 w-4" />
                  Share & Embed
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowBranding(true)}>
                  <Palette className="h-4 w-4" />
                  Branding
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowFloorPlans(true)}>
                  <Map className="h-4 w-4" />
                  Floor Plans
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowSceneAnalysis(true)}>
                  <Sparkles className="h-4 w-4" />
                  AI Scene Analysis
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowDescriptions(true)}>
                  <Wand2 className="h-4 w-4" />
                  AI Descriptions
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowHotspotSuggestions(true)}
                  disabled={!currentScene}
                >
                  <Lightbulb className="h-4 w-4" />
                  AI Hotspots
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => duplicateMutation.mutate()}
                  disabled={duplicateMutation.isPending}
                >
                  <Copy className="h-4 w-4" />
                  Duplicate Tour
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate(`${ROUTES.TOURS}/${id}/analytics`)}
                >
                  <Archive className="h-4 w-4" />
                  View Analytics
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-[var(--color-error-500)]"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Tour
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Editor Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Scene Panel */}
          {showScenePanel && (
            <ScenePanel
              tourId={id!}
              scenes={currentTour?.scenes || []}
              currentSceneId={currentSceneId}
              onSceneSelect={setCurrentScene}
            />
          )}

          {/* Viewer */}
          <div className="flex-1 relative">
            {currentScene ? (
              <>
                <PanoramaViewer
                  scene={currentScene}
                  hotspots={currentScene.hotspots || []}
                  isEditor
                  onPositionClick={handlePositionClick}
                  onHotspotDrag={handleHotspotDrag}
                  onHotspotSelect={selectHotspot}
                  onSceneChange={setCurrentScene}
                />
                {/* Hotspot Placement Mode Indicator & Toggle */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isPlacingHotspot ? 'default' : 'secondary'}
                        size="sm"
                        onClick={() => setIsPlacingHotspot(!isPlacingHotspot)}
                        className={cn(
                          'shadow-lg',
                          isPlacingHotspot && 'bg-[var(--color-primary-500)] animate-pulse'
                        )}
                      >
                        <Crosshair className="h-4 w-4" />
                        {isPlacingHotspot ? 'Click to place' : 'Add Hotspot'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isPlacingHotspot
                        ? 'Right-click on panorama to place hotspot (Esc to cancel)'
                        : 'Enable hotspot placement mode (H)'}
                    </TooltipContent>
                  </Tooltip>
                </div>
                {/* Hotspot placement crosshair overlay */}
                {isPlacingHotspot && (
                  <div className="absolute inset-0 z-5 pointer-events-none">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-8 h-8 border-2 border-dashed border-[var(--color-primary-500)] rounded-full animate-pulse" />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full items-center justify-center bg-[var(--color-surface)]">
                <div className="text-center">
                  <p className="text-[var(--color-text-muted)]">
                    {currentTour?.scenes?.length
                      ? 'Select a scene to view'
                      : 'No scenes yet. Upload 360° images to get started.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Hotspot Panel */}
          {showHotspotPanel && currentScene && (
            <HotspotPanel
              sceneId={currentScene.id}
              hotspots={currentScene.hotspots || []}
              scenes={currentTour?.scenes || []}
            />
          )}
        </div>

        {/* Tour Settings Panel */}
        {currentTour && (
          <TourSettingsPanel
            open={showSettings}
            onOpenChange={setShowSettings}
            tour={currentTour}
            scenes={currentTour.scenes || []}
            onSave={handleSettingsSave}
          />
        )}

        {/* Bulk Uploader */}
        <BulkUploader
          tourId={id!}
          open={showBulkUploader}
          onOpenChange={setShowBulkUploader}
        />

        <BrandingPanel
          open={showBranding}
          onOpenChange={setShowBranding}
          settings={currentTour?.settings?.branding ?? DEFAULT_TOUR_SETTINGS.branding ?? {}}
          onSave={handleBrandingSave}
        />

        <FloorPlanEditor
          open={showFloorPlans}
          onOpenChange={setShowFloorPlans}
          floorPlans={currentTour?.settings?.floor_plans ?? []}
          scenes={currentTour?.scenes ?? []}
          onSave={handleFloorPlansSave}
        />

        {currentTour && (
          <>
            <SceneAnalysis
              open={showSceneAnalysis}
              onOpenChange={setShowSceneAnalysis}
              tourId={currentTour.id}
              scenes={currentTour.scenes ?? []}
              onApply={handleApplySceneAnalysis}
            />

            <DescriptionGenerator
              open={showDescriptions}
              onOpenChange={setShowDescriptions}
              tourId={currentTour.id}
              scenes={currentTour.scenes ?? []}
              onApply={handleApplyDescriptions}
            />
          </>
        )}

        {currentScene && currentTour && (
          <HotspotSuggestions
            open={showHotspotSuggestions}
            onOpenChange={setShowHotspotSuggestions}
            sceneId={currentScene.id}
            scene={currentScene}
            allScenes={currentTour.scenes ?? []}
            onApply={handleApplyHotspotSuggestions}
          />
        )}

        {/* Hotspot Editor Modal for click-to-place */}
        {currentScene && (
          <HotspotEditorModal
            open={showHotspotEditor}
            onOpenChange={handleHotspotEditorClose}
            hotspot={null}
            sceneId={currentScene.id}
            scenes={currentTour?.scenes || []}
            mode="create"
            initialPosition={placementPosition || { yaw: 0, pitch: 0 }}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Tour</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{currentTour?.title || tour.title}"?
                This action cannot be undone. All scenes, hotspots, and analytics
                data will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate()}
                className="bg-[var(--color-error-600)] hover:bg-[var(--color-error-500)]"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Unsaved Changes Blocker Dialog */}
        {blocker.state === 'blocked' && (
          <AlertDialog open={true} onOpenChange={() => blocker.reset()}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
                <AlertDialogDescription>
                  You have unsaved changes. Do you want to leave without saving?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => blocker.reset()}>
                  Stay
                </AlertDialogCancel>
                <AlertDialogAction onClick={() => blocker.proceed()}>
                  Leave
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </TooltipProvider>
  );
}
