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
  Route,
  Sparkles,
  Wand2,
  Lightbulb,
  X,
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui';
import { toursApi } from '@/api';
import { errorText } from '@/api/errors';
import { QUERY_KEYS, ROUTES } from '@/constants';
import { useTourEditorStore } from '@/stores';
import { PanoramaViewer } from '@/components/features/PanoramaViewer';
import { ScenePanel } from '@/components/features/ScenePanel';
import { HotspotPanel } from '@/components/features/HotspotPanel';
import { HotspotEditorModal } from '@/components/features/HotspotEditorModal';
import { TourSettingsPanel, type TourSettingsSave } from '@/components/features/TourSettingsPanel';
import { BulkUploader } from '@/components/features/BulkUploader';
import { BrandingPanel } from '@/components/features/BrandingPanel';
import { FloorPlanEditor } from '@/components/features/FloorPlanEditor';
import { ShareModal } from '@/components/features/ShareModal';
import {
  SceneAnalysis,
  DescriptionGenerator,
  HotspotSuggestions,
  ConnectRoomsDialog,
} from '@/components/features/ai';
import { cn } from '@/utils';
import { useEffect, useState, useCallback } from 'react';
import { useToast } from '@/hooks/useToast';
import { useIsMobile } from '@/hooks';
import { syncFloorPlans, type FloorPlanDraft } from '@/lib/floorPlanSync';
import { API_LIMITS } from '@/lib/api/limits.gen';
import type { BrandingSettings, Hotspot, HotspotCreateInput, TourUpdateInput } from '@/types';
import type { HotspotSuggestion } from '@/api';

export function TourEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isMac = navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac');

  // Local state
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkUploader, setShowBulkUploader] = useState(false);
  const [showBranding, setShowBranding] = useState(false);
  const [showFloorPlans, setShowFloorPlans] = useState(false);
  const [showSceneAnalysis, setShowSceneAnalysis] = useState(false);
  const [showDescriptions, setShowDescriptions] = useState(false);
  const [showHotspotSuggestions, setShowHotspotSuggestions] = useState(false);
  const [showConnectRooms, setShowConnectRooms] = useState(false);
  const [isPlacingHotspot, setIsPlacingHotspot] = useState(false);
  const [placementPosition, setPlacementPosition] = useState<{ yaw: number; pitch: number } | null>(
    null
  );
  const [showHotspotEditor, setShowHotspotEditor] = useState(false);
  const [editingHotspot, setEditingHotspot] = useState<Hotspot | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'scenes' | 'hotspots' | null>(null);
  // True while any settings-style save (settings dialog, branding, floor
  // plans) is in flight; surfaces a saving state on the panel's Save button.
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const {
    currentTour,
    currentSceneId,
    showScenePanel,
    showHotspotPanel,
    hasUnsavedChanges,
    setCurrentTour,
    setCurrentScene,
    selectHotspot,
    toggleHotspotPanel,
    updateTourDraft,
    markAsSaved,
    reset,
  } = useTourEditorStore();
  const currentScene = currentTour?.scenes?.find(s => s.id === currentSceneId);
  const sceneCount = currentTour?.scenes?.length ?? 0;

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

  // Fetch scenes (every page of the cursor list)
  const { data: scenes } = useQuery({
    queryKey: [QUERY_KEYS.SCENES, id],
    queryFn: () => toursApi.getScenes(id!),
    enabled: !!id,
  });

  // Floor plans come from the floor_plans table only (every page of the cursor list)
  const { data: floorPlans } = useQuery({
    queryKey: [QUERY_KEYS.FLOOR_PLANS, id],
    queryFn: () => toursApi.getFloorPlans(id!),
    enabled: !!id,
  });

  // Update tour mutation
  const updateMutation = useMutation({
    mutationFn: () => {
      if (!currentTour) throw new Error('No tour to update');
      // `status` is not a writable field: publish and unpublish change it.
      // A cleared description goes as an explicit null (an omitted key keeps the old text).
      return toursApi.updateTour(currentTour.id, {
        title: currentTour.title,
        description: currentTour.description ?? null,
        visibility: currentTour.visibility,
        settings: currentTour.settings ?? undefined,
      });
    },
    onSuccess: () => {
      markAsSaved();
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, id] });
      toast('success', 'Your changes have been saved successfully.', { title: 'Tour saved' });
    },
    onError: error => {
      toast('error', errorText(error, 'Something went wrong. Please try again.'), {
        title: 'Failed to save',
      });
    },
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Save should work even inside input fields.
      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges) {
          updateMutation.mutate();
        }
        return;
      }

      // Ignore remaining shortcuts if user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
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
          setIsPlacingHotspot(prev => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSceneId, hasUnsavedChanges, isPlacingHotspot, setCurrentScene, updateMutation]);

  // Publish tour mutation
  const publishMutation = useMutation({
    mutationFn: () => toursApi.publishTour(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, id] });
      // Sync the toolbar immediately instead of waiting for the refetch:
      // publish only succeeds from a clean state (blocked while unsaved
      // changes exist), so patch the store's status without dirtying the
      // draft, then mark as saved so the badge stays accurate.
      const editorState = useTourEditorStore.getState();
      if (editorState.currentTour?.id === id && !editorState.hasUnsavedChanges) {
        editorState.updateTourDraft({ status: 'published' });
        editorState.markAsSaved();
      }
      toast('success', 'Your tour is now live and can be shared.', { title: 'Tour published' });
      setShowShare(true);
    },
    onError: error => {
      toast('error', errorText(error, 'Something went wrong. Please try again.'), {
        title: 'Failed to publish',
      });
    },
  });

  // Unpublish tour mutation
  const unpublishMutation = useMutation({
    mutationFn: () => toursApi.unpublishTour(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, id] });
      // Same immediate toolbar sync as publish; skipped when the user has
      // local draft edits so the save flow stays authoritative.
      const editorState = useTourEditorStore.getState();
      if (editorState.currentTour?.id === id && !editorState.hasUnsavedChanges) {
        editorState.updateTourDraft({ status: 'draft' });
        editorState.markAsSaved();
      }
      toast('success', 'Your tour has been set to draft.', { title: 'Tour unpublished' });
    },
    onError: error => {
      toast('error', errorText(error, 'Something went wrong. Please try again.'), {
        title: 'Failed to unpublish',
      });
    },
  });

  // Duplicate tour mutation
  const duplicateMutation = useMutation({
    mutationFn: () => toursApi.duplicateTour(id!),
    onSuccess: duplicatedTour => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOURS] });
      toast('success', 'A copy of your tour has been created.', { title: 'Tour duplicated' });
      navigate(`${ROUTES.TOURS}/${duplicatedTour.id}/edit`);
    },
    onError: error => {
      toast('error', errorText(error, 'Could not duplicate the tour. Please try again.'), {
        title: 'Duplicate failed',
      });
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
    onError: error => {
      toast('error', errorText(error, 'Could not delete the tour. Please try again.'), {
        title: 'Delete failed',
      });
    },
  });

  // Persist tour fields (PATCH) and mirror the server's answer into the editor
  // store. The server deep-merges `settings` (an omitted key keeps its stored
  // value, a null key is removed), so its response is the truth for the store.
  // Throws on failure and leaves the store untouched: the caller keeps its
  // dialog open so the user can retry.
  const persistTourFields = useCallback(
    async (patch: TourUpdateInput) => {
      if (!currentTour) return;
      setIsSavingSettings(true);
      try {
        const saved = await toursApi.updateTour(currentTour.id, patch);
        updateTourDraft({
          title: saved.title,
          description: saved.description,
          visibility: saved.visibility,
          settings: saved.settings,
        });
        markAsSaved();
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, id] });
      } finally {
        setIsSavingSettings(false);
      }
    },
    [currentTour, id, queryClient, updateTourDraft, markAsSaved]
  );

  // Handle settings save
  const handleSettingsSave = useCallback(
    async (save: TourSettingsSave) => {
      try {
        await persistTourFields(save);
        toast('success', 'Tour settings have been updated.', { title: 'Settings saved' });
        setShowSettings(false);
      } catch (error) {
        toast(
          'error',
          error instanceof Error ? error.message : 'Something went wrong. Please try again.',
          {
            title: 'Failed to save settings',
          }
        );
      }
    },
    [persistTourFields, toast]
  );

  // Owner preview uses the authenticated tour view so drafts still play.
  // `/view/:id` is public-only and rejects unpublished tours.
  const handlePreview = useCallback(() => {
    if (!id) return;
    window.open(`/tours/${id}`, '_blank');
  }, [id]);

  // Handle position click for hotspot placement
  const handlePositionClick = useCallback(
    (position: { yaw: number; pitch: number }) => {
      if (isPlacingHotspot && currentSceneId) {
        setEditingHotspot(null);
        setPlacementPosition(position);
        setShowHotspotEditor(true);
        setIsPlacingHotspot(false);
      }
    },
    [isPlacingHotspot, currentSceneId]
  );

  const handleEditorHotspotClick = useCallback(
    (hotspot: Hotspot) => {
      selectHotspot(hotspot.id);
      if (!useTourEditorStore.getState().showHotspotPanel) {
        useTourEditorStore.getState().toggleHotspotPanel();
      }
      setPlacementPosition(null);
      setEditingHotspot(hotspot);
      setShowHotspotEditor(true);
    },
    [selectHotspot]
  );

  // Handle hotspot editor close
  const handleHotspotEditorClose = useCallback((open: boolean) => {
    setShowHotspotEditor(open);
    if (!open) {
      setPlacementPosition(null);
      setEditingHotspot(null);
    }
  }, []);

  // Handle hotspot drag-to-reposition
  const handleHotspotDrag = useCallback(
    async (hotspotId: string, position: { yaw: number; pitch: number }) => {
      try {
        await toursApi.updateHotspotPosition(hotspotId, position);
        // Refresh scenes to update hotspot position in UI
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SCENES, id] });
        toast('success', 'Position updated successfully.', { title: 'Hotspot moved' });
      } catch (error) {
        toast('error', errorText(error, 'Could not update hotspot position.'), {
          title: 'Failed to move hotspot',
        });
      }
    },
    [id, queryClient, toast]
  );

  const handleBrandingSave = useCallback(
    (branding: BrandingSettings) => {
      persistTourFields({ settings: { branding } })
        .then(() => {
          toast('success', 'Branding has been applied to this tour.', { title: 'Branding saved' });
        })
        .catch(error => {
          toast(
            'error',
            error instanceof Error ? error.message : 'Could not save branding. Please try again.',
            { title: 'Failed to save branding' }
          );
        });
    },
    [persistTourFields, toast]
  );

  // Floor plans are rows of the floor_plans table: write them through the
  // floor-plan routes, never through `settings`.
  const handleFloorPlansSave = useCallback(
    async (drafts: FloorPlanDraft[]) => {
      if (!id) return;
      setIsSavingSettings(true);
      try {
        await syncFloorPlans(id, floorPlans ?? [], drafts);
        toast('success', 'Floor plan navigation has been updated.', { title: 'Floor plans saved' });
      } catch (error) {
        toast(
          'error',
          error instanceof Error ? error.message : 'Could not save floor plans. Please try again.',
          { title: 'Failed to save floor plans' }
        );
        throw error;
      } finally {
        setIsSavingSettings(false);
        // Show what the server stored, including any partial result.
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.FLOOR_PLANS, id] });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, id] });
      }
    },
    [id, floorPlans, queryClient, toast]
  );

  const handleApplySceneAnalysis = useCallback(
    async (updates: Array<{ scene_id: string; title?: string; description?: string }>) => {
      if (updates.length === 0) return;

      const results = await Promise.allSettled(
        updates.map(update =>
          toursApi.updateScene(update.scene_id, {
            title: update.title?.slice(0, API_LIMITS.scene.titleMax),
            description: update.description?.slice(0, API_LIMITS.scene.descriptionMax),
          })
        )
      );

      // Always refresh the scenes query so the successful updates are
      // reflected in the UI even when some updates failed.
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SCENES, id] });

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;

      if (failed === 0) {
        toast('success', `${updates.length} scene${updates.length === 1 ? '' : 's'} updated.`, {
          title: 'AI suggestions applied',
        });
      } else if (succeeded === 0) {
        toast('error', 'Could not apply AI scene suggestions.', {
          title: 'Failed to update scenes',
        });
      } else {
        toast('warning', `${succeeded} of ${updates.length} scenes updated, ${failed} failed.`, {
          title: 'Partially applied',
        });
      }
    },
    [id, queryClient, toast]
  );

  // Draws a plan from the tour's analyzed rooms and doorway links. The server
  // owns the layout, so refetch rather than guessing at the new row.
  const handleGenerateFloorPlan = useCallback(async () => {
    if (!id) return;
    try {
      await toursApi.generateFloorPlan(id);
      await queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.FLOOR_PLANS, id] });
      toast('success', 'An estimated floor plan was added. Move the markers to fine-tune it.', {
        title: 'Floor plan generated',
      });
    } catch (error) {
      toast('error', errorText(error, 'Could not generate a floor plan. Please try again.'), {
        title: 'Generation failed',
      });
    }
  }, [id, queryClient, toast]);
  // AI doorway linking rewrites the tour's navigation hotspots, which the
  // editor reads through the scenes query, so refresh that and the tour itself.
  const handleRoomsConnected = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SCENES, id] });
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, id] });
  }, [id, queryClient]);

  const handleApplyDescriptions = useCallback(
    async (descriptions: Record<string, string>) => {
      const entries = Object.entries(descriptions);
      if (entries.length === 0) return;

      const results = await Promise.allSettled(
        entries.map(([sceneId, description]) =>
          toursApi.updateScene(sceneId, {
            description: description.slice(0, API_LIMITS.scene.descriptionMax),
          })
        )
      );

      // Always refresh the scenes query so successful descriptions persist in
      // the UI even when some updates failed.
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SCENES, id] });

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;

      if (failed === 0) {
        toast(
          'success',
          `${entries.length} description${entries.length === 1 ? '' : 's'} applied.`,
          {
            title: 'Descriptions updated',
          }
        );
      } else if (succeeded === 0) {
        toast('error', 'Could not apply AI descriptions.', {
          title: 'Failed to update descriptions',
        });
      } else {
        toast(
          'warning',
          `${succeeded} of ${entries.length} descriptions applied, ${failed} failed.`,
          {
            title: 'Partially applied',
          }
        );
      }
    },
    [id, queryClient, toast]
  );

  const handleApplyHotspotSuggestions = useCallback(
    async (sceneId: string, suggestions: HotspotSuggestion[]) => {
      if (!sceneId) return;
      if (suggestions.length === 0) return;

      // The server only returns valid suggestions; this guard keeps one stale or
      // malformed row (a target scene deleted since, a position out of range) from
      // failing the whole apply.
      const sceneIds = new Set((currentTour?.scenes ?? []).map(scene => scene.id));
      const applicable = suggestions.filter(
        suggestion =>
          suggestion.type !== 'navigation' ||
          (!!suggestion.target_scene_id &&
            suggestion.target_scene_id !== sceneId &&
            sceneIds.has(suggestion.target_scene_id))
      );

      const results = await Promise.allSettled(
        applicable.map(suggestion => {
          const title = suggestion.suggested_title?.slice(0, API_LIMITS.hotspot.titleMax);
          const text = suggestion.reasoning.slice(0, API_LIMITS.hotspot.descriptionMax);
          const payload: HotspotCreateInput = {
            type: suggestion.type,
            position: {
              yaw: Math.max(-180, Math.min(180, suggestion.position.yaw)),
              pitch: Math.max(-90, Math.min(90, suggestion.position.pitch)),
            },
            ...(suggestion.type === 'navigation' && suggestion.target_scene_id
              ? { target_scene_id: suggestion.target_scene_id }
              : {}),
            ...(title ? { title } : {}),
            icon_name: suggestion.type === 'navigation' ? 'arrow-right' : 'info',
            icon_color: suggestion.type === 'navigation' ? '#FF5733' : '#10b981',
            icon_size: 32,
            // Navigation content is empty (its label is the title). Info content holds the text.
            ...(suggestion.type === 'info' && text ? { content: { text } } : {}),
          };

          return toursApi.createHotspot(sceneId, payload);
        })
      );

      // Always refresh the scenes query so successfully added hotspots appear
      // in the viewer and panels even when some suggestions failed.
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SCENES, id] });

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;

      if (failed === 0) {
        toast(
          'success',
          `${applicable.length} hotspot${applicable.length === 1 ? '' : 's'} added.`,
          {
            title: 'AI hotspots applied',
          }
        );
      } else if (succeeded === 0) {
        toast('error', 'Could not add AI hotspot suggestions.', {
          title: 'Failed to add hotspots',
        });
      } else {
        toast('warning', `${succeeded} of ${applicable.length} hotspots added, ${failed} failed.`, {
          title: 'Partially applied',
        });
      }
    },
    [id, currentTour?.scenes, queryClient, toast]
  );

  // Reset the editor only when leaving this editor instance or switching tour IDs.
  useEffect(() => {
    return () => reset();
  }, [id, reset]);

  // Initialize tour in store — but only when the store doesn't already hold
  // this tour, so that query refetches don't clobber local optimistic edits.
  useEffect(() => {
    if (tour && scenes && tour.id === id) {
      const currentTour = useTourEditorStore.getState().currentTour;
      if (!currentTour || currentTour.id !== tour.id) {
        setCurrentTour({ ...tour, scenes });
      }
    }
  }, [id, tour, scenes, setCurrentTour]);

  // Keep the store's scenes array in sync with the [SCENES, tourId] query.
  // Scene/hotspot mutations (create/update/delete/reorder, drag, AI applies)
  // persist through toursApi and only invalidate this query, so without this
  // merge the editor UI (viewer markers, ScenePanel, HotspotPanel, scene-delete
  // recovery) would stay stale until a full reload. Scenes are a separate
  // array from tour-level draft edits, so a plain replacement is safe even
  // while unsaved tour changes exist.
  useEffect(() => {
    if (!scenes) return;
    const editorState = useTourEditorStore.getState();
    if (!editorState.currentTour || editorState.currentTour.id !== id) return;
    editorState.mergeScenes(scenes);
  }, [id, scenes]);

  // Sync server-confirmed tour fields (publish/unpublish/settings saves) into
  // the store once no draft edits are in flight, so the toolbar status badge
  // and Publish/Unpublish button never go stale — including the edge case of
  // unpublishing while dirty and saving afterwards. Draft edits and the scene
  // selection are never clobbered (the guard above plus scene-scoped merges).
  useEffect(() => {
    if (!tour || hasUnsavedChanges) return;
    const editorState = useTourEditorStore.getState();
    const storeTour = editorState.currentTour;
    if (!storeTour || storeTour.id !== tour.id) return;
    const changed =
      storeTour.status !== tour.status ||
      storeTour.visibility !== tour.visibility ||
      storeTour.title !== tour.title ||
      storeTour.description !== tour.description ||
      storeTour.settings !== tour.settings;
    if (!changed) return;
    editorState.updateTourDraft({
      status: tour.status,
      visibility: tour.visibility,
      title: tour.title,
      description: tour.description,
      settings: tour.settings,
    });
    editorState.markAsSaved();
  }, [tour, hasUnsavedChanges]);

  // Recover from a stale scene selection (e.g. the selected scene was deleted).
  // Initial auto-selection is handled by setCurrentTour in the store, and a null
  // currentSceneId is an intentional user deselection (Escape), so only recover
  // when a non-null selection no longer exists in the scenes list.
  useEffect(() => {
    const sceneList = currentTour?.scenes;
    if (!sceneList || !currentSceneId) return;
    if (!sceneList.some(s => s.id === currentSceneId)) {
      setCurrentScene(sceneList[0]?.id ?? null);
    }
  }, [currentTour?.scenes, currentSceneId, setCurrentScene]);

  const publishDisabledReason = hasUnsavedChanges
    ? 'Save changes before publishing.'
    : sceneCount === 0
      ? 'Add at least one scene before publishing.'
      : null;

  if (isLoading) {
    return <PageLoader message="Loading tour..." />;
  }

  if (!tour) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-xl font-semibold">Tour not found</h2>
        <Button variant="outline" className="mt-4" onClick={() => navigate(ROUTES.TOURS)}>
          Back to Tours
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-4rem)] flex-col">
        {/* Editor Header */}
        <div
          className="flex flex-col gap-3 border-b border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          data-testid="toolbar"
        >
          <div className="flex min-w-0 items-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => navigate(ROUTES.TOURS)}
                  aria-label="Back to tours"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to Tours</TooltipContent>
            </Tooltip>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-semibold text-[var(--color-text-primary)]">
                  {currentTour?.title || tour.title}
                </h1>
                <Badge variant={currentTour?.status === 'published' ? 'success' : 'secondary'}>
                  {currentTour?.status || tour.status}
                </Badge>
                {hasUnsavedChanges && <Badge variant="warning">Unsaved changes</Badge>}
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">
                {currentTour?.scenes?.length || 0} scenes
                <span className="mx-2">•</span>
                <span className="text-xs">{isMac ? '⌘S' : 'Ctrl+S'} to save</span>
              </p>
            </div>
          </div>

          <div className="flex max-w-full shrink-0 items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => setShowBulkUploader(true)}>
                  <Upload className="h-4 w-4" />
                  Upload
                </Button>
              </TooltipTrigger>
              <TooltipContent>Bulk upload 360° images</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showHotspotPanel ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={toggleHotspotPanel}
                  disabled={!currentScene}
                  aria-pressed={showHotspotPanel}
                  data-testid="hotspots-panel-toggle"
                >
                  <Crosshair className="h-4 w-4" />
                  Hotspots
                </Button>
              </TooltipTrigger>
              <TooltipContent>Show or hide the hotspot list</TooltipContent>
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
                <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
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
              disabled={!hasUnsavedChanges || updateMutation.isPending}
              data-testid="save-button"
            >
              <Save className="h-4 w-4" />
              Save
            </Button>

            {currentTour?.status === 'published' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowShare(true)}
                data-testid="share-button"
              >
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            )}

            {currentTour?.status !== 'published' ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex" tabIndex={publishDisabledReason ? 0 : undefined}>
                    <Button
                      variant="success"
                      size="sm"
                      isLoading={publishMutation.isPending}
                      onClick={() => publishMutation.mutate()}
                      disabled={
                        !!publishDisabledReason ||
                        publishMutation.isPending ||
                        updateMutation.isPending
                      }
                      data-testid="publish-button"
                    >
                      Publish
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{publishDisabledReason || 'Publish tour'}</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="outline"
                size="sm"
                isLoading={unpublishMutation.isPending}
                onClick={() => unpublishMutation.mutate()}
                disabled={unpublishMutation.isPending || updateMutation.isPending}
              >
                Unpublish
              </Button>
            )}

            {/* More Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More tour actions">
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
                <DropdownMenuItem
                  onClick={() => setShowConnectRooms(true)}
                  disabled={!currentTour || (currentTour.scenes?.length ?? 0) < 2}
                >
                  <Route className="h-4 w-4" />
                  Connect Rooms with AI
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => duplicateMutation.mutate()}
                  disabled={duplicateMutation.isPending}
                >
                  <Copy className="h-4 w-4" />
                  Duplicate Tour
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`${ROUTES.TOURS}/${id}/analytics`)}>
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
          {!isMobile && showScenePanel && (
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
                  onHotspotClick={handleEditorHotspotClick}
                  onSceneChange={setCurrentScene}
                />
                {/* Hotspot Placement Mode Indicator & Toggle */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
                  {isPlacingHotspot && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsPlacingHotspot(false)}
                      className="shadow-lg"
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isPlacingHotspot ? 'default' : 'secondary'}
                        size="sm"
                        onClick={() => setIsPlacingHotspot(!isPlacingHotspot)}
                        data-testid="place-hotspot-button"
                        className={cn(
                          'shadow-lg',
                          isPlacingHotspot && 'bg-[var(--color-primary-500)] animate-pulse'
                        )}
                      >
                        <Crosshair className="h-4 w-4" />
                        {isPlacingHotspot
                          ? isMobile
                            ? 'Tap to place'
                            : 'Click to place'
                          : 'Add Hotspot'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isPlacingHotspot
                        ? isMobile
                          ? 'Tap on the panorama to place a hotspot (Cancel to exit)'
                          : 'Click on the panorama to place a hotspot (Esc to cancel)'
                        : 'Enable hotspot placement mode (H)'}
                    </TooltipContent>
                  </Tooltip>
                </div>
                {/* Mobile hint banner while placing a hotspot */}
                {isPlacingHotspot && isMobile && (
                  <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 rounded-full bg-[var(--color-primary-500)] px-3 py-1 text-xs font-medium text-white shadow-lg">
                    Tap anywhere on the panorama to drop a hotspot
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
                  {!currentTour?.scenes?.length && (
                    <Button className="mt-4" onClick={() => setShowBulkUploader(true)}>
                      <Upload className="h-4 w-4" />
                      Upload panoramas
                    </Button>
                  )}
                </div>
              </div>
            )}

            {isMobile && (
              <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-1 shadow-lg">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setMobilePanel('scenes')}
                  aria-label="Open scenes panel"
                >
                  Scenes
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setMobilePanel('hotspots')}
                  disabled={!currentScene}
                  aria-label="Open hotspots panel"
                >
                  Hotspots
                </Button>
              </div>
            )}
          </div>

          {/* Hotspot Panel */}
          {!isMobile && showHotspotPanel && currentScene && (
            <HotspotPanel
              sceneId={currentScene.id}
              hotspots={currentScene.hotspots || []}
              scenes={currentTour?.scenes || []}
            />
          )}
        </div>

        {/* Mobile editor panels */}
        {isMobile && (
          <>
            <Sheet
              open={mobilePanel === 'scenes'}
              onOpenChange={open => setMobilePanel(open ? 'scenes' : null)}
            >
              <SheetContent
                side="left"
                className="w-[min(20rem,100vw)] p-0"
                showCloseButton={false}
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Scenes</SheetTitle>
                  <SheetDescription>
                    Select, upload, delete, and reorder tour scenes.
                  </SheetDescription>
                </SheetHeader>
                <ScenePanel
                  tourId={id!}
                  scenes={currentTour?.scenes || []}
                  currentSceneId={currentSceneId}
                  onSceneSelect={sceneId => {
                    setCurrentScene(sceneId);
                    setMobilePanel(null);
                  }}
                  className="h-full w-full border-r-0"
                  allowCollapse={false}
                  onClose={() => setMobilePanel(null)}
                />
              </SheetContent>
            </Sheet>

            {currentScene && (
              <Sheet
                open={mobilePanel === 'hotspots'}
                onOpenChange={open => setMobilePanel(open ? 'hotspots' : null)}
              >
                <SheetContent
                  side="right"
                  className="w-[min(22rem,100vw)] p-0"
                  showCloseButton={false}
                >
                  <SheetHeader className="sr-only">
                    <SheetTitle>Hotspots</SheetTitle>
                    <SheetDescription>Create, select, edit, and delete hotspots.</SheetDescription>
                  </SheetHeader>
                  <HotspotPanel
                    sceneId={currentScene.id}
                    hotspots={currentScene.hotspots || []}
                    scenes={currentTour?.scenes || []}
                    className="h-full w-full border-l-0"
                    onClose={() => setMobilePanel(null)}
                  />
                </SheetContent>
              </Sheet>
            )}
          </>
        )}

        {/* Tour Settings Panel */}
        {currentTour && (
          <TourSettingsPanel
            open={showSettings}
            onOpenChange={setShowSettings}
            tour={currentTour}
            scenes={currentTour.scenes || []}
            onSave={handleSettingsSave}
            isLoading={isSavingSettings}
          />
        )}

        {/* Bulk Uploader */}
        <BulkUploader tourId={id!} open={showBulkUploader} onOpenChange={setShowBulkUploader} />

        <BrandingPanel
          open={showBranding}
          onOpenChange={setShowBranding}
          settings={currentTour?.settings?.branding}
          onSave={handleBrandingSave}
          isLoading={isSavingSettings}
        />

        <FloorPlanEditor
          open={showFloorPlans}
          onOpenChange={setShowFloorPlans}
          floorPlans={floorPlans ?? []}
          scenes={currentTour?.scenes ?? []}
          onSave={handleFloorPlansSave}
          onGenerate={handleGenerateFloorPlan}
          isLoading={isSavingSettings}
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

            <ConnectRoomsDialog
              open={showConnectRooms}
              onOpenChange={setShowConnectRooms}
              tourId={currentTour.id}
              sceneCount={currentTour.scenes?.length ?? 0}
              onApplied={handleRoomsConnected}
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
            hotspot={editingHotspot}
            sceneId={currentScene.id}
            scenes={currentTour?.scenes || []}
            mode={editingHotspot ? 'edit' : 'create'}
            initialPosition={placementPosition || editingHotspot?.position || { yaw: 0, pitch: 0 }}
          />
        )}

        {id && (
          <ShareModal
            open={showShare}
            onOpenChange={setShowShare}
            tourId={id}
            tourTitle={currentTour?.title || tour.title}
            tourDescription={currentTour?.description || undefined}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={showDeleteDialog}
          onOpenChange={open => {
            if (deleteMutation.isPending && !open) return;
            setShowDeleteDialog(open);
          }}
        >
          <AlertDialogContent
            onEscapeKeyDown={e => {
              if (deleteMutation.isPending) e.preventDefault();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Tour</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{currentTour?.title || tour.title}"? This action
                cannot be undone. All scenes, hotspots, and analytics data will be permanently
                deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={e => {
                  e.preventDefault();
                  deleteMutation.mutate();
                }}
                disabled={deleteMutation.isPending}
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
                <AlertDialogCancel onClick={() => blocker.reset()}>Stay</AlertDialogCancel>
                <AlertDialogAction onClick={() => blocker.proceed()}>Leave</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </TooltipProvider>
  );
}
