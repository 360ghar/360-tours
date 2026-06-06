/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react';
import { Copy, Check, Code2, Globe, Navigation, Settings2, Smartphone, Glasses } from 'lucide-react';
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
  Switch,
  Slider,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  Label,
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui';
import type { Tour, TourSettings, Scene, TourVisibility } from '@/types';
import {
  generateIframeCode,
  generateResponsiveCode,
  generateShareUrl,
  copyToClipboard,
  type EmbedOptions,
} from '@/utils/embedCode';

interface TourSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tour: Tour;
  scenes: Scene[];
  onSave: (settings: Partial<Tour>) => void;
  isLoading?: boolean;
}

const DEFAULT_TOUR_SETTINGS: TourSettings = {
  auto_rotate: false,
  auto_rotate_speed: 1,
  show_navbar: true,
  enable_fullscreen: true,
  enable_vr: true,
  enable_gyroscope: true,
  gyroscope_auto_start: false,
};

const FIRST_SCENE_VALUE = '__first_scene__';

export function TourSettingsPanel({
  open,
  onOpenChange,
  tour,
  scenes,
  onSave,
  isLoading = false,
}: TourSettingsPanelProps) {
  const [title, setTitle] = useState(tour.title);
  const [description, setDescription] = useState(tour.description || '');
  const [visibility, setVisibility] = useState<TourVisibility>(tour.visibility || 'private');
  const [settings, setSettings] = useState<TourSettings>(tour.settings || DEFAULT_TOUR_SETTINGS);

  const [embedOptions, setEmbedOptions] = useState<EmbedOptions>({
    width: '100%',
    height: 500,
    autoplay: true,
    showNavbar: true,
    enableFullscreen: true,
    enableVR: true,
    startSceneId: '',
    autoRotate: false,
    branding: true,
  });

  const copiedEmbedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copiedLinkTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    setTitle(tour.title);
    setDescription(tour.description || '');
    setVisibility(tour.visibility || 'private');
    setSettings(tour.settings || DEFAULT_TOUR_SETTINGS);
  }, [tour]);

  useEffect(() => {
    setEmbedOptions((prev) => ({
      ...prev,
      startSceneId: settings.initial_scene_id || '',
      autoRotate: settings.auto_rotate,
      showNavbar: settings.show_navbar,
      enableFullscreen: settings.enable_fullscreen,
      enableVR: settings.enable_vr,
    }));
  }, [settings]);

  const handleSave = () => {
    onSave({
      title,
      description: description || undefined,
      visibility,
      settings,
    });
  };

  const handleCopyEmbed = async () => {
    const code = generateIframeCode(tour.id, embedOptions);
    const success = await copyToClipboard(code);
    if (success) {
      setCopiedEmbed(true);
      clearTimeout(copiedEmbedTimerRef.current);
      copiedEmbedTimerRef.current = setTimeout(() => setCopiedEmbed(false), 2000);
    }
  };

  const handleCopyLink = async () => {
    const link = generateShareUrl(tour.id);
    const success = await copyToClipboard(link);
    if (success) {
      setCopiedLink(true);
      clearTimeout(copiedLinkTimerRef.current);
      copiedLinkTimerRef.current = setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const updateSettings = (updates: Partial<TourSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Tour Settings
          </DialogTitle>
          <DialogDescription>
            Configure tour basics, viewer behavior, and share/embed settings.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="general" className="gap-1.5">
              <Globe className="h-4 w-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="viewer" className="gap-1.5">
              <Navigation className="h-4 w-4" />
              Viewer
            </TabsTrigger>
            <TabsTrigger value="embed" className="gap-1.5">
              <Code2 className="h-4 w-4" />
              Embed
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4 pr-2">
            <TabsContent value="general" className="m-0 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter tour title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter tour description"
                  rows={3}
                />
              </div>

              <div className="space-y-3">
                <Label>Visibility</Label>
                <RadioGroup
                  value={visibility}
                  onValueChange={(value) => setVisibility(value as TourVisibility)}
                  className="space-y-3"
                >
                  <div className="flex items-start space-x-3">
                    <RadioGroupItem value="private" id="visibility-private" className="mt-1" />
                    <div>
                      <Label htmlFor="visibility-private" className="font-medium cursor-pointer">
                        Private
                      </Label>
                      <p className="text-sm text-[var(--color-text-muted)]">
                        Only you can view this tour.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <RadioGroupItem value="unlisted" id="visibility-unlisted" className="mt-1" />
                    <div>
                      <Label htmlFor="visibility-unlisted" className="font-medium cursor-pointer">
                        Unlisted
                      </Label>
                      <p className="text-sm text-[var(--color-text-muted)]">
                        Anyone with the link can view it.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <RadioGroupItem value="public" id="visibility-public" className="mt-1" />
                    <div>
                      <Label htmlFor="visibility-public" className="font-medium cursor-pointer">
                        Public
                      </Label>
                      <p className="text-sm text-[var(--color-text-muted)]">
                        Visible in public listings.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {scenes.length > 0 && (
                <div className="space-y-2">
                  <Label>Starting Scene</Label>
                  <Select
                    value={settings.initial_scene_id || FIRST_SCENE_VALUE}
                    onValueChange={(value) =>
                      updateSettings({
                        initial_scene_id: value === FIRST_SCENE_VALUE ? undefined : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="First scene (default)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FIRST_SCENE_VALUE}>First scene (default)</SelectItem>
                      {scenes.map((scene) => (
                        <SelectItem key={scene.id} value={scene.id}>
                          {scene.title || `Scene ${scene.order_index + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </TabsContent>

            <TabsContent value="viewer" className="m-0 space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label htmlFor="auto-rotate">Auto-Rotate</Label>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Automatically rotate the view when idle.
                  </p>
                </div>
                <Switch
                  id="auto-rotate"
                  checked={settings.auto_rotate}
                  onCheckedChange={(checked) => updateSettings({ auto_rotate: checked })}
                />
              </div>

              {settings.auto_rotate && (
                <div className="pl-4 border-l-2 border-[var(--color-border)]">
                  <Slider
                    label="Rotation Speed"
                    value={settings.auto_rotate_speed || 1}
                    min={0.1}
                    max={5}
                    step={0.1}
                    showValue
                    onValueChange={(value) => updateSettings({ auto_rotate_speed: value })}
                  />
                </div>
              )}

              <div className="flex items-center justify-between py-2">
                <div>
                  <Label htmlFor="navbar">Show Navigation Bar</Label>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Display the bottom navigation strip.
                  </p>
                </div>
                <Switch
                  id="navbar"
                  checked={settings.show_navbar}
                  onCheckedChange={(checked) => updateSettings({ show_navbar: checked })}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <Label htmlFor="fullscreen">Enable Fullscreen</Label>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Allow viewers to enter fullscreen mode.
                  </p>
                </div>
                <Switch
                  id="fullscreen"
                  checked={settings.enable_fullscreen}
                  onCheckedChange={(checked) => updateSettings({ enable_fullscreen: checked })}
                />
              </div>

              <div className="pt-4 border-t border-[var(--color-border)]">
                <h4 className="text-sm font-medium flex items-center gap-2 mb-4">
                  <Glasses className="h-4 w-4" />
                  Immersive Controls
                </h4>

                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <Label htmlFor="vr">Enable VR Mode</Label>
                      <p className="text-sm text-[var(--color-text-muted)]">
                        Allow Cardboard/WebXR viewing where supported.
                      </p>
                    </div>
                    <Switch
                      id="vr"
                      checked={settings.enable_vr}
                      onCheckedChange={(checked) => updateSettings({ enable_vr: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <Label htmlFor="gyroscope" className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4" />
                        Enable Gyroscope
                      </Label>
                      <p className="text-sm text-[var(--color-text-muted)]">
                        Allow device motion control on mobile.
                      </p>
                    </div>
                    <Switch
                      id="gyroscope"
                      checked={settings.enable_gyroscope !== false}
                      onCheckedChange={(checked) => updateSettings({ enable_gyroscope: checked })}
                    />
                  </div>

                  {settings.enable_gyroscope !== false && (
                    <div className="pl-4 border-l-2 border-[var(--color-border)]">
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <Label htmlFor="gyro-auto">Auto-Start Gyroscope</Label>
                          <p className="text-sm text-[var(--color-text-muted)]">
                            Enable gyroscope automatically on mobile.
                          </p>
                        </div>
                        <Switch
                          id="gyro-auto"
                          checked={settings.gyroscope_auto_start === true}
                          onCheckedChange={(checked) =>
                            updateSettings({ gyroscope_auto_start: checked })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="embed" className="m-0 space-y-4">
              <div className="space-y-2">
                <Label>Share Link</Label>
                <div className="flex gap-2">
                  <Input readOnly value={generateShareUrl(tour.id)} className="font-mono text-sm" />
                  <Button variant="outline" size="icon" onClick={handleCopyLink}>
                    {copiedLink ? (
                      <Check className="h-4 w-4 text-[var(--color-success-500)]" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="embed-width">Width</Label>
                  <Input
                    id="embed-width"
                    value={embedOptions.width}
                    onChange={(e) =>
                      setEmbedOptions((prev) => ({
                        ...prev,
                        width: e.target.value,
                      }))
                    }
                    placeholder="100% or 800"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="embed-height">Height</Label>
                  <Input
                    id="embed-height"
                    type="number"
                    value={typeof embedOptions.height === 'number' ? embedOptions.height : 500}
                    onChange={(e) =>
                      setEmbedOptions((prev) => ({
                        ...prev,
                        height: parseInt(e.target.value, 10) || 500,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Embed Code</Label>
                <div className="relative">
                  <Textarea
                    readOnly
                    value={generateIframeCode(tour.id, embedOptions)}
                    className="font-mono text-xs min-h-[120px] resize-none"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute right-2 top-2"
                    onClick={handleCopyEmbed}
                  >
                    {copiedEmbed ? (
                      <>
                        <Check className="h-3 w-3" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Paste this code into your site HTML to embed the tour.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Responsive Embed</Label>
                <Textarea
                  readOnly
                  value={generateResponsiveCode(tour.id, embedOptions)}
                  className="font-mono text-xs min-h-[100px] resize-none"
                />
                <p className="text-xs text-[var(--color-text-muted)]">
                  Use this code for responsive 16:9 embeds.
                </p>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="mt-4 pt-4 border-t border-[var(--color-border)]">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} isLoading={isLoading}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
