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
  Film,
  Users,
  Activity,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Avatar,
  AvatarImage,
  AvatarFallback,
  Separator,
} from '@/components/ui';
import { toursApi } from '@/api';
import { QUERY_KEYS, ROUTES } from '@/constants';
import { useTourEditorStore, useCollaborationStore, confirm } from '@/stores';
import { PanoramaViewer } from '@/components/features/PanoramaViewer';
import { ScenePanel } from '@/components/features/ScenePanel';
import { HotspotPanel } from '@/components/features/HotspotPanel';
import { HotspotEditorModal } from '@/components/features/HotspotEditorModal';
import { TourSettingsPanel } from '@/components/features/TourSettingsPanel';
import { BulkUploader } from '@/components/features/BulkUploader';
import { BrandingPanel } from '@/components/features/BrandingPanel';
import { FloorPlanEditor } from '@/components/features/FloorPlanEditor';
import {
  SceneAnalysis,
  DescriptionGenerator,
  HotspotSuggestions,
  ReelGeneratorModal,
} from '@/components/features/ai';
import { ActivityFeed } from '@/components/features';
import { cn } from '@/utils';
import { useEffect, useState, useCallback } from 'react';
import { useToast } from '@/hooks/useToast';
import { useIsMobile } from '@/hooks';
import { DEFAULT_TOUR_SETTINGS } from '@/constants';
import type { BrandingSettings, FloorPlan, HotspotCreateInput, Tour } from '@/types';
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
  const [showReelGenerator, setShowReelGenerator] = useState(false);
  const [isPlacingHotspot, setIsPlacingHotspot] = useState(false);
  const [placementPosition, setPlacementPosition] = useState<{ yaw: number; pitch: number } | null>(
    null
  );
  const [showHotspotEditor, setShowHotspotEditor] = useState(false);
  const [showActivityFeed, setShowActivityFeed] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'scenes' | 'hotspots' | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');
  const [isInviting, setIsInviting] = useState(false);

  const {
    collaborators,
    isLoadingCollaborators,
    collaboratorsError,
    fetchActivities,
    fetchCollaborators,
    inviteCollaborator,
    removeCollaborator,
  } = useCollaborationStore();

  const {
    currentTour,
    currentSceneId,
    showScenePanel,
    showHotspotPanel,
    hasUnsavedChanges,
    setCurrentTour,
    setCurrentScene,
    selectHotspot,
    updateTourDraft,
    markAsSaved,
    undo,
    redo,
    reset,
  } = useTourEditorStore();
  const currentScene = currentTour?.scenes?.find(s => s.id === currentSceneId);
  const sceneCount = currentTour?.scenes?.length ?? 0;
  const inviteEmailTrimmed = inviteEmail.trim();
  const isInviteEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmailTrimmed);

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
      markAsSaved();
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
      // Save and undo/redo should work even inside input fields.
      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges) {
          updateMutation.mutate();
        }
        return;
      }
      // Undo / redo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
          return;
        } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
          e.preventDefault();
          redo();
          return;
        }
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
  }, [
    currentSceneId,
    hasUnsavedChanges,
    isPlacingHotspot,
    setCurrentScene,
    updateMutation,
    undo,
    redo,
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
    onSuccess: duplicatedTour => {
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
    onError: () => {
      toast('error', 'Could not delete the tour. Please try again.', { title: 'Delete failed' });
    },
  });

  // Handle settings save
  const handleSettingsSave = useCallback(
    (updates: Partial<Tour>) => {
      if (!currentTour) return;

      // Track the draft as an unsaved change so the editor's unsaved-changes
      // guard (navigation blocker + beforeunload) stays accurate.
      updateTourDraft(updates);

      // Save to server - handle null values for description
      const updatePayload = {
        ...updates,
        description: updates.description ?? undefined,
      };

      toursApi
        .updateTour(currentTour.id, updatePayload as Parameters<typeof toursApi.updateTour>[1])
        .then(() => {
          markAsSaved();
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, id] });
          toast('success', 'Tour settings have been updated.', { title: 'Settings saved' });
          setShowSettings(false);
        })
        .catch(() => {
          // Leave hasUnsavedChanges true so the user can retry.
          toast('error', 'Something went wrong. Please try again.', {
            title: 'Failed to save settings',
          });
        });
    },
    [currentTour, id, queryClient, updateTourDraft, markAsSaved, toast]
  );

  // Handle preview
  const handlePreview = useCallback(() => {
    window.open(`/view/${id}`, '_blank');
  }, [id]);

  // Handle position click for hotspot placement
  const handlePositionClick = useCallback(
    (position: { yaw: number; pitch: number }) => {
      if (isPlacingHotspot && currentSceneId) {
        setPlacementPosition(position);
        setShowHotspotEditor(true);
        setIsPlacingHotspot(false);
      }
    },
    [isPlacingHotspot, currentSceneId]
  );

  // Handle hotspot editor close
  const handleHotspotEditorClose = useCallback((open: boolean) => {
    setShowHotspotEditor(open);
    if (!open) {
      setPlacementPosition(null);
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
      } catch {
        toast('error', 'Could not update hotspot position.', { title: 'Failed to move hotspot' });
      }
    },
    [id, queryClient, toast]
  );

  const saveTourSettings = useCallback(
    async (settings: Tour['settings'], successTitle: string, successMessage: string) => {
      if (!currentTour || !settings) return;

      updateTourDraft({ settings });

      await toursApi.updateTour(currentTour.id, { settings });
      markAsSaved();
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TOUR, id] });
      toast('success', successMessage, { title: successTitle });
    },
    [currentTour, id, queryClient, updateTourDraft, markAsSaved, toast]
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

      saveTourSettings(settings, 'Branding saved', 'Branding has been applied to this tour.').catch(
        () => {
          toast('error', 'Could not save branding. Please try again.', {
            title: 'Failed to save branding',
          });
        }
      );
    },
    [currentTour?.settings, saveTourSettings, toast]
  );

  const handleFloorPlansSave = useCallback(
    async (floorPlans: FloorPlan[]) => {
      const settings = {
        ...DEFAULT_TOUR_SETTINGS,
        ...(currentTour?.settings ?? {}),
        floor_plans: floorPlans,
      };

      try {
        await saveTourSettings(
          settings,
          'Floor plans saved',
          'Floor plan navigation has been updated.'
        );
      } catch (error) {
        toast('error', 'Could not save floor plans. Please try again.', {
          title: 'Failed to save floor plans',
        });
        throw error;
      }
    },
    [currentTour?.settings, saveTourSettings, toast]
  );

  const handleApplySceneAnalysis = useCallback(
    (updates: Array<{ scene_id: string; title?: string; description?: string }>) => {
      Promise.all(
        updates.map(update =>
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
          toast('error', 'Could not apply AI scene suggestions.', {
            title: 'Failed to update scenes',
          });
        });
    },
    [id, queryClient, toast]
  );

  const handleApplyDescriptions = useCallback(
    (descriptions: Record<string, string>) => {
      const entries = Object.entries(descriptions);
      Promise.all(
        entries.map(([sceneId, description]) => toursApi.updateScene(sceneId, { description }))
      )
        .then(() => {
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SCENES, id] });
          toast(
            'success',
            `${entries.length} description${entries.length === 1 ? '' : 's'} applied.`,
            {
              title: 'Descriptions updated',
            }
          );
        })
        .catch(() => {
          toast('error', 'Could not apply AI descriptions.', {
            title: 'Failed to update descriptions',
          });
        });
    },
    [id, queryClient, toast]
  );

  const handleApplyHotspotSuggestions = useCallback(
    (suggestions: HotspotSuggestion[]) => {
      if (!currentScene) return;

      Promise.all(
        suggestions.map(suggestion => {
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
          toast(
            'success',
            `${suggestions.length} hotspot${suggestions.length === 1 ? '' : 's'} added.`,
            {
              title: 'AI hotspots applied',
            }
          );
        })
        .catch(() => {
          toast('error', 'Could not add AI hotspot suggestions.', {
            title: 'Failed to add hotspots',
          });
        });
    },
    [currentScene, id, queryClient, toast]
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowActivityFeed(true);
                    fetchActivities(id!);
                  }}
                >
                  <Activity className="h-4 w-4" />
                  Activity
                </Button>
              </TooltipTrigger>
              <TooltipContent>View activity feed</TooltipContent>
            </Tooltip>

            <Popover
              open={showCollaborators}
              onOpenChange={open => {
                setShowCollaborators(open);
                if (open) fetchCollaborators(id!);
              }}
            >
              <PopoverTrigger asChild>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Users className="h-4 w-4" />
                      Collaborators
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Manage collaborators</TooltipContent>
                </Tooltip>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="p-4 space-y-3">
                  <h4 className="font-semibold text-sm">Collaborators</h4>
                  <div className="space-y-2">
                    {isLoadingCollaborators ? (
                      <p className="text-sm text-[var(--color-text-muted)]">
                        Loading collaborators...
                      </p>
                    ) : collaboratorsError ? (
                      <div className="space-y-2">
                        <p role="alert" className="text-sm text-[var(--color-error-600)]">
                          {collaboratorsError}
                        </p>
                        <Button variant="outline" size="sm" onClick={() => fetchCollaborators(id!)}>
                          Retry
                        </Button>
                      </div>
                    ) : collaborators.length === 0 ? (
                      <p className="text-sm text-[var(--color-text-muted)]">No collaborators yet</p>
                    ) : (
                      collaborators.map(c => (
                        <div key={c.id} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={c.user?.profile_image_url || undefined} />
                              <AvatarFallback className="text-xs">
                                {c.user?.full_name
                                  ?.split(' ')
                                  .map(n => n[0])
                                  .join('')
                                  .toUpperCase()
                                  .slice(0, 2) || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {c.user?.full_name || c.user?.email || 'Unknown'}
                              </p>
                              <p className="text-xs text-[var(--color-text-muted)] capitalize">
                                {c.role}
                              </p>
                            </div>
                          </div>
                          {c.role !== 'owner' && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove ${c.user?.email || c.user?.full_name || 'collaborator'}`}
                              onClick={async () => {
                                if (
                                  !(await confirm({
                                    title: 'Remove collaborator',
                                    message: `Remove ${c.user?.email || 'this collaborator'} from the tour?`,
                                    confirmLabel: 'Remove',
                                    destructive: true,
                                  }))
                                )
                                  return;
                                try {
                                  await removeCollaborator(id!, c.user_id);
                                  toast('success', 'Collaborator removed.', { title: 'Removed' });
                                } catch {
                                  toast('error', 'Could not remove collaborator.', {
                                    title: 'Remove failed',
                                  });
                                }
                              }}
                            >
                              <Trash2 className="h-3 w-3 text-[var(--color-text-muted)]" />
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Invite collaborator</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Email address"
                        type="email"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        className="h-8 text-sm"
                        aria-invalid={inviteEmailTrimmed.length > 0 && !isInviteEmailValid}
                      />
                      <Select
                        value={inviteRole}
                        onValueChange={v => setInviteRole(v as 'editor' | 'viewer')}
                      >
                        <SelectTrigger className="w-24 h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!isInviteEmailValid || isInviting}
                      isLoading={isInviting}
                      onClick={async () => {
                        if (!isInviteEmailValid) return;
                        setIsInviting(true);
                        try {
                          await inviteCollaborator(id!, inviteEmailTrimmed, inviteRole);
                          toast('success', `Invited ${inviteEmailTrimmed}.`, {
                            title: 'Invitation sent',
                          });
                          setInviteEmail('');
                          setInviteRole('viewer');
                        } catch {
                          toast('error', 'Could not send invitation.', {
                            title: 'Failed to invite',
                          });
                        } finally {
                          setIsInviting(false);
                        }
                      }}
                    >
                      Send Invitation
                    </Button>
                    {inviteEmailTrimmed.length > 0 && !isInviteEmailValid && (
                      <p className="text-xs text-[var(--color-error-600)]">
                        Enter a valid email address.
                      </p>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

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
                <DropdownMenuItem onClick={() => setShowReelGenerator(true)}>
                  <Film className="h-4 w-4" />
                  Create 360 Reel
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
          />
        )}

        {/* Bulk Uploader */}
        <BulkUploader tourId={id!} open={showBulkUploader} onOpenChange={setShowBulkUploader} />

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

            <ReelGeneratorModal
              open={showReelGenerator}
              onOpenChange={setShowReelGenerator}
              tourId={currentTour.id}
              scenes={currentTour.scenes ?? []}
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

        {/* Activity Feed Sheet */}
        <Sheet open={showActivityFeed} onOpenChange={setShowActivityFeed}>
          <SheetContent side="right" className="w-96 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Activity Feed</SheetTitle>
              <SheetDescription>Recent activity for this tour</SheetDescription>
            </SheetHeader>
            <ActivityFeed
              tourId={id!}
              onRefresh={async () => {
                await fetchActivities(id!);
              }}
            />
          </SheetContent>
        </Sheet>

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
