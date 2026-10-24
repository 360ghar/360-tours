import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Info, Volume2, Play, Link, Code, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Textarea,
  Label,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui';
import { HotspotIconPicker, type HotspotIconConfig } from './HotspotIconPicker';
import { HOTSPOT_ICON_BY_NAME, getHotspotIconForeground } from './hotspotIcons';
import { VideoUploader } from './VideoUploader';
import { toursApi } from '@/api';
import { errorText } from '@/api/errors';
import { QUERY_KEYS } from '@/constants';
import { useToast } from '@/hooks/useToast';
import { useTourEditorStore } from '@/stores';
import { cn } from '@/utils';
import { getHotspotValidationError } from '@/utils/hotspotValidation';
import {
  buildHotspotContent,
  buildHotspotCreate,
  buildHotspotUpdate,
  type HotspotFormValues,
} from '@/utils/hotspotPayload';
import { API_LIMITS } from '@/lib/api/limits.gen';
import {
  parseAudioHotspotContent,
  parseCustomHotspotContent,
  parseInfoHotspotContent,
  parseLinkHotspotContent,
  parseVideoHotspotContent,
} from '@/types/hotspotContent';
import type { Hotspot, HotspotType, HotspotUpdateInput, Scene } from '@/types';

interface HotspotEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hotspot: Hotspot | null;
  sceneId: string;
  scenes: Scene[];
  mode: 'create' | 'edit';
  initialPosition?: { yaw: number; pitch: number };
}

type HotspotEditorModalFormProps = Omit<HotspotEditorModalProps, 'open'> & {
  initialPosition: { yaw: number; pitch: number };
};

const HOTSPOT_TYPE_INFO = {
  navigation: {
    icon: ArrowRight,
    label: 'Navigation',
    description: 'Link to another scene in the tour',
  },
  info: {
    icon: Info,
    label: 'Info',
    description: 'Display information text',
  },
  audio: {
    icon: Volume2,
    label: 'Audio',
    description: 'Play an audio clip',
  },
  video: {
    icon: Play,
    label: 'Video',
    description: 'Play a video',
  },
  link: {
    icon: Link,
    label: 'Link',
    description: 'Open an external URL',
  },
  custom: {
    icon: Code,
    label: 'Custom',
    description: 'Custom HTML content',
  },
};

const TYPE_ICON_NAME: Record<HotspotType, string> = {
  navigation: 'arrow-right',
  info: 'info',
  audio: 'volume-2',
  video: 'play',
  link: 'link',
  custom: 'code',
};

function getDefaultIconConfig(type: HotspotType): HotspotIconConfig {
  return {
    iconName: TYPE_ICON_NAME[type] ?? 'info',
    iconColor: '#FF5733',
    iconSize: 32,
  };
}

// parseVideoUrl imported from shared utility — see @/utils/videoUrl

export function HotspotEditorModal({
  open,
  onOpenChange,
  hotspot,
  sceneId,
  scenes,
  mode,
  initialPosition = { yaw: 0, pitch: 0 },
}: HotspotEditorModalProps) {
  if (!open) return null;

  const positionKey = `${initialPosition.yaw}:${initialPosition.pitch}`;
  const dialogKey =
    mode === 'edit' ? `edit:${hotspot?.id ?? 'unknown'}` : `create:${sceneId}:${positionKey}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <HotspotEditorModalForm
        key={dialogKey}
        onOpenChange={onOpenChange}
        hotspot={hotspot}
        sceneId={sceneId}
        scenes={scenes}
        mode={mode}
        initialPosition={initialPosition}
      />
    </Dialog>
  );
}

function HotspotEditorModalForm({
  onOpenChange,
  hotspot,
  sceneId,
  scenes,
  mode,
  initialPosition,
}: HotspotEditorModalFormProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isEdit = mode === 'edit' && Boolean(hotspot);
  const initialType: HotspotType = isEdit && hotspot ? hotspot.type : 'navigation';

  // Form state
  const [type, setType] = useState<HotspotType>(initialType);
  const [title, setTitle] = useState(isEdit && hotspot ? hotspot.title || '' : '');
  const [description, setDescription] = useState(() => {
    if (!isEdit || !hotspot) return '';
    if (hotspot.type === 'info') {
      const contentText = parseInfoHotspotContent(hotspot.content)?.text || '';
      return contentText || hotspot.description || '';
    }
    return hotspot.description || '';
  });
  const [targetSceneId, setTargetSceneId] = useState(
    isEdit && hotspot ? hotspot.target_scene_id || '' : ''
  );
  // `position` is null when the stored position failed validation: start from the click.
  const [position, setPosition] = useState(
    isEdit && hotspot?.position ? hotspot.position : initialPosition
  );
  const [iconConfig, setIconConfig] = useState<HotspotIconConfig>(() => {
    if (isEdit && hotspot) {
      return {
        iconName: hotspot.icon_name || TYPE_ICON_NAME[hotspot.type] || 'info',
        iconColor: hotspot.icon_color || '#FF5733',
        iconSize: hotspot.icon_size,
      };
    }
    return getDefaultIconConfig(initialType);
  });

  // Content-specific state
  const [audioUrl, setAudioUrl] = useState(
    isEdit && hotspot ? parseAudioHotspotContent(hotspot.content)?.audio_url || '' : ''
  );
  const [videoUrl, setVideoUrl] = useState(() => {
    if (!isEdit || !hotspot) return '';

    const content = parseVideoHotspotContent(hotspot.content);

    if (content?.video_url) return content.video_url;
    if (content?.youtube_id) return `https://www.youtube.com/watch?v=${content.youtube_id}`;
    if (content?.vimeo_id) return `https://vimeo.com/${content.vimeo_id}`;
    return '';
  });
  const [linkUrl, setLinkUrl] = useState(() => {
    if (!isEdit || !hotspot) return '';
    const content = parseLinkHotspotContent(hotspot.content);
    return content?.url || '';
  });
  const [linkNewTab, setLinkNewTab] = useState(() => {
    if (!isEdit || !hotspot) return true;
    const content = parseLinkHotspotContent(hotspot.content);
    return content?.target ? content.target === '_blank' : true;
  });
  const [videoUploaderOpen, setVideoUploaderOpen] = useState(false);
  const [customHtml, setCustomHtml] = useState(() => {
    if (!isEdit || !hotspot) return '';
    const content = parseCustomHotspotContent(hotspot.content);
    return content?.html || '';
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof toursApi.createHotspot>[1]) =>
      toursApi.createHotspot(sceneId, data),
    onSuccess: createdHotspot => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SCENES] });
      // Select the new hotspot so the user sees it highlighted in the viewer
      // and in the HotspotPanel immediately after saving.
      useTourEditorStore.getState().selectHotspot(createdHotspot.id);
      toast('success', 'The hotspot has been added to the scene.', { title: 'Hotspot created' });
      onOpenChange(false);
    },
    onError: error => {
      toast('error', errorText(error, 'Something went wrong. Please try again.'), {
        title: 'Failed to create hotspot',
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: HotspotUpdateInput }) =>
      toursApi.updateHotspot(id, data),
    onSuccess: (updatedHotspot, variables) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SCENES] });
      // Keep the edited hotspot selected after saving.
      useTourEditorStore.getState().selectHotspot(variables.id || updatedHotspot.id);
      toast('success', 'Your changes have been saved.', { title: 'Hotspot updated' });
      onOpenChange(false);
    },
    onError: error => {
      toast('error', errorText(error, 'Something went wrong. Please try again.'), {
        title: 'Failed to update hotspot',
      });
    },
  });

  const handleTypeChange = (nextType: HotspotType) => {
    setType(nextType);
    if (mode === 'create') {
      setIconConfig(prev => ({
        ...prev,
        iconName: TYPE_ICON_NAME[nextType] ?? prev.iconName,
      }));
    }
  };

  const availableTargetScenes = scenes.filter(s => s.id !== sceneId);
  const validationError = getHotspotValidationError({
    type,
    targetSceneId,
    hasAvailableTargetScene: availableTargetScenes.length > 0,
    title,
    description,
    audioUrl,
    videoUrl,
    linkUrl,
    customHtml,
  });
  const canSave = !validationError;

  const handleSubmit = () => {
    if (!canSave || createMutation.isPending || updateMutation.isPending) return;

    const values: HotspotFormValues = {
      type,
      title,
      description,
      targetSceneId,
      position,
      iconName: iconConfig.iconName,
      iconColor: iconConfig.iconColor,
      iconSize: iconConfig.iconSize,
      audioUrl,
      videoUrl,
      linkUrl,
      linkNewTab,
      customHtml,
    };

    if (mode === 'create') {
      const content = buildHotspotContent(values, null);
      createMutation.mutate(buildHotspotCreate(values, content));
    } else if (hotspot) {
      // Keys the form does not edit (autoplay, poster_url, label, ...) are carried
      // over only while the type is unchanged.
      const stored = hotspot.type === type ? hotspot.content : null;
      const content = buildHotspotContent(values, stored);
      updateMutation.mutate({ id: hotspot.id, data: buildHotspotUpdate(values, content) });
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const CurrentIcon = HOTSPOT_ICON_BY_NAME[iconConfig.iconName] ?? Info;
  const iconForeground = getHotspotIconForeground(iconConfig.iconColor);

  return (
    <DialogContent
      className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
      data-testid="hotspot-editor-modal"
    >
      <DialogHeader>
        <DialogTitle>{mode === 'create' ? 'Add Hotspot' : 'Edit Hotspot'}</DialogTitle>
        <DialogDescription>
          {mode === 'create'
            ? 'Create a new interactive hotspot for this scene.'
            : 'Modify the hotspot settings and content.'}
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto space-y-4 py-4">
        {/* Type Selection */}
        <div className="space-y-2">
          <Label>Hotspot Type</Label>
          <div className="grid grid-cols-3 gap-2">
            {(
              Object.entries(HOTSPOT_TYPE_INFO) as [
                HotspotType,
                typeof HOTSPOT_TYPE_INFO.navigation,
              ][]
            ).map(([key, info]) => (
              <button
                key={key}
                type="button"
                aria-pressed={type === key}
                onClick={() => handleTypeChange(key)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors',
                  type === key
                    ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-surface)]'
                )}
              >
                <info.icon className="h-5 w-5" />
                <span className="text-xs font-medium">{info.label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            {HOTSPOT_TYPE_INFO[type].description}
          </p>
        </div>

        {/* Basic Info */}
        <Tabs defaultValue="content" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="content" className="flex-1">
              Content
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex-1">
              Appearance
            </TabsTrigger>
            <TabsTrigger value="position" className="flex-1">
              Position
            </TabsTrigger>
          </TabsList>

          {/* Content Tab */}
          <TabsContent value="content" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Enter hotspot title"
                maxLength={API_LIMITS.hotspot.titleMax}
              />
            </div>

            {/* Type-specific content */}
            {type === 'navigation' && (
              <div className="space-y-2">
                <Label htmlFor="target-scene">Target Scene</Label>
                <Select value={targetSceneId} onValueChange={setTargetSceneId}>
                  <SelectTrigger
                    id="target-scene"
                    aria-invalid={type === 'navigation' && !!validationError}
                  >
                    <SelectValue placeholder="Select a scene" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTargetScenes.map(scene => (
                      <SelectItem key={scene.id} value={scene.id}>
                        {scene.title || `Scene ${scene.order_index + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {type === 'info' && (
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Enter information to display"
                  rows={4}
                  maxLength={API_LIMITS.hotspot.descriptionMax}
                />
                <p className="text-right text-xs text-[var(--color-text-muted)]">
                  {description.length}/{API_LIMITS.hotspot.descriptionMax}
                </p>
              </div>
            )}

            {type === 'audio' && (
              <div className="space-y-2">
                <Label htmlFor="audio-url">Audio URL</Label>
                <Input
                  id="audio-url"
                  type="url"
                  aria-invalid={type === 'audio' && !!validationError}
                  value={audioUrl}
                  onChange={e => setAudioUrl(e.target.value)}
                  placeholder="https://example.com/audio.mp3"
                  maxLength={API_LIMITS.hotspot.mediaUrlMax}
                />
                <p className="text-xs text-[var(--color-text-muted)]">
                  Enter a direct link to an MP3 or other audio file.
                </p>
              </div>
            )}

            {type === 'video' && (
              <div className="space-y-2">
                <Label htmlFor="video-url">Video URL</Label>
                <Input
                  id="video-url"
                  type="url"
                  aria-invalid={type === 'video' && !!validationError}
                  value={videoUrl}
                  onChange={e => setVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... or video file URL"
                  maxLength={API_LIMITS.hotspot.mediaUrlMax}
                />
                <p className="text-xs text-[var(--color-text-muted)]">
                  Supports YouTube, Vimeo, or direct video file links.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setVideoUploaderOpen(true)}
                >
                  <Upload className="h-4 w-4" />
                  Upload video
                </Button>
                <VideoUploader
                  open={videoUploaderOpen}
                  onOpenChange={setVideoUploaderOpen}
                  multiple={false}
                  onUploadComplete={({ url }) => setVideoUrl(url)}
                />
              </div>
            )}

            {type === 'link' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="link-url">Link URL</Label>
                  <Input
                    id="link-url"
                    type="url"
                    aria-invalid={type === 'link' && !!validationError}
                    value={linkUrl}
                    onChange={e => setLinkUrl(e.target.value)}
                    placeholder="https://example.com"
                    maxLength={API_LIMITS.hotspot.linkUrlMax}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="link-new-tab">Open in new tab</Label>
                  <Switch id="link-new-tab" checked={linkNewTab} onCheckedChange={setLinkNewTab} />
                </div>
              </>
            )}

            {type === 'custom' && (
              <div className="space-y-2">
                <Label htmlFor="custom-html">Custom HTML</Label>
                <Textarea
                  id="custom-html"
                  aria-invalid={type === 'custom' && !!validationError}
                  value={customHtml}
                  onChange={e => setCustomHtml(e.target.value)}
                  placeholder="<div>Your custom content...</div>"
                  rows={6}
                  maxLength={API_LIMITS.hotspot.customHtmlMax}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-[var(--color-text-muted)]">
                  Enter custom HTML that will be rendered when the hotspot is clicked.
                </p>
              </div>
            )}
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Icon Settings</Label>
              <HotspotIconPicker
                value={iconConfig}
                onChange={setIconConfig}
                trigger={
                  <Button variant="outline" className="w-full justify-start gap-3">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full"
                      style={{ backgroundColor: iconConfig.iconColor }}
                    >
                      <CurrentIcon className="h-4 w-4" style={{ color: iconForeground }} />
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-sm">Customize Icon</span>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {iconConfig.iconName} • {iconConfig.iconSize}px
                      </span>
                    </div>
                  </Button>
                }
              />
            </div>

            {/* Preview */}
            <div className="rounded-lg border border-[var(--color-border)] p-4">
              <p className="text-xs font-medium text-[var(--color-text-muted)] mb-3">Preview</p>
              <div className="flex items-center justify-center bg-[var(--color-surface)] rounded-lg p-8">
                <div
                  className="flex items-center justify-center rounded-full shadow-lg"
                  style={{
                    backgroundColor: iconConfig.iconColor,
                    width: iconConfig.iconSize,
                    height: iconConfig.iconSize,
                  }}
                >
                  <CurrentIcon
                    style={{
                      width: iconConfig.iconSize * 0.5,
                      height: iconConfig.iconSize * 0.5,
                      color: iconForeground,
                    }}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Position Tab */}
          <TabsContent value="position" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="yaw">Yaw (Horizontal)</Label>
                <Input
                  id="yaw"
                  type="number"
                  step="0.1"
                  min={-180}
                  max={180}
                  value={position.yaw}
                  onChange={e => setPosition(p => ({ ...p, yaw: parseFloat(e.target.value) || 0 }))}
                />
                <p className="text-xs text-[var(--color-text-muted)]">-180° to 180°</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pitch">Pitch (Vertical)</Label>
                <Input
                  id="pitch"
                  type="number"
                  step="0.1"
                  min={-90}
                  max={90}
                  value={position.pitch}
                  onChange={e =>
                    setPosition(p => ({ ...p, pitch: parseFloat(e.target.value) || 0 }))
                  }
                />
                <p className="text-xs text-[var(--color-text-muted)]">-90° to 90°</p>
              </div>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              Tip: You can also click on the panorama to set the hotspot position interactively.
            </p>
          </TabsContent>
        </Tabs>
      </div>

      {/* Persistent validation reason: shown regardless of the active tab so
          Save is never disabled without a visible explanation. */}
      {validationError && (
        <p
          id="hotspot-validation-error"
          role="alert"
          className="px-6 pb-2 text-sm text-[var(--color-error-600)]"
        >
          {validationError}
        </p>
      )}

      <DialogFooter className="border-t border-[var(--color-border)] pt-4">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          isLoading={isLoading}
          disabled={!canSave}
          aria-describedby={validationError ? 'hotspot-validation-error' : undefined}
        >
          {mode === 'create' ? 'Add Hotspot' : 'Save Changes'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
