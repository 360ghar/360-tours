import { useEffect, useState, useRef } from 'react';
import {
  Palette,
  Upload,
  Image as ImageIcon,
  Type,
  Eye,
  X,
  Check,
  RotateCcw,
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui';
import { uploadApi } from '@/api';
import { cn } from '@/utils';
import { DEFAULT_TOUR_SETTINGS } from '@/constants';
import type { BrandingSettings } from '@/types';

interface BrandingPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Partial<BrandingSettings>;
  onSave: (settings: BrandingSettings) => void;
  isLoading?: boolean;
}

const DEFAULT_SETTINGS: BrandingSettings = {
  ...DEFAULT_TOUR_SETTINGS.branding,
} as BrandingSettings;

const FONT_OPTIONS = [
  { value: 'Satoshi', label: 'Satoshi' },
  { value: 'Clash Display', label: 'Clash Display' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Lato', label: 'Lato' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'Source Sans Pro', label: 'Source Sans Pro' },
];

const PRESET_THEMES = [
  {
    name: 'Default',
    primary: '#FF5733',
    secondary: '#FFC857',
    accent: '#FF8A5C',
  },
  {
    name: 'Ocean',
    primary: '#0ea5e9',
    secondary: '#06b6d4',
    accent: '#14b8a6',
  },
  {
    name: 'Forest',
    primary: '#22c55e',
    secondary: '#10b981',
    accent: '#84cc16',
  },
  {
    name: 'Sunset',
    primary: '#f97316',
    secondary: '#ef4444',
    accent: '#f59e0b',
  },
  {
    name: 'Slate',
    primary: '#3D3D3D',
    secondary: '#525252',
    accent: '#6B6B6B',
  },
  {
    name: 'Charcoal',
    primary: '#1A1A1F',
    secondary: '#2A2A2F',
    accent: '#3D3D3D',
  },
];

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const SUPPORTED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

export function BrandingPanel({
  open,
  onOpenChange,
  settings: initialSettings,
  onSave,
  isLoading = false,
}: BrandingPanelProps) {
  const [settings, setSettings] = useState<BrandingSettings>({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
  });
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Tracks the last fallback object URL (always a 'blob:' URL we created) so it
  // can be revoked on replace/unmount. Server 'https:' URLs are never stored here.
  const fallbackUrlRef = useRef<string | null>(null);
  // Preview-only blob URL shown when an upload failed. This is NEVER persisted
  // to settings.logo_url — the user must re-upload successfully before saving.
  const [previewLogoUrl, setPreviewLogoUrl] = useState<string | null>(null);
  const [logoUploadFailed, setLogoUploadFailed] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  // Revoke the outstanding fallback object URL on unmount
  useEffect(
    () => () => {
      if (fallbackUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(fallbackUrlRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    setSettings({
      ...DEFAULT_SETTINGS,
      ...initialSettings,
    });
  }, [initialSettings, open]);

  const updateSetting = <K extends keyof BrandingSettings>(key: K, value: BrandingSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!SUPPORTED_LOGO_TYPES.includes(file.type)) {
      setLogoError('Upload a PNG, SVG, JPG, or WebP logo.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setLogoError('Logo files must be 2MB or smaller.');
      e.target.value = '';
      return;
    }

    setIsUploadingLogo(true);
    setLogoError(null);

    try {
      const uploadResult = await uploadApi.uploadFile(file, {
        folder: 'branding',
        visibility: 'public',
      });
      // Upload succeeded — clear any pending preview-only blob URL and commit
      // the remote URL as the persisted logo_url.
      if (fallbackUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(fallbackUrlRef.current);
        fallbackUrlRef.current = null;
      }
      setPreviewLogoUrl(null);
      setLogoUploadFailed(false);
      setLogoError(null);
      updateSetting('logo_url', uploadResult.public_url);
    } catch (error) {
      console.error('Failed to upload logo:', error);
      // Upload failed: do NOT set the blob URL as the persistent logo_url,
      // because blob URLs are local-only and would not render for anyone else
      // (and would break persistence). Instead, show the image as a preview
      // and require a successful re-upload before saving.
      const previousUrl = fallbackUrlRef.current;
      const url = URL.createObjectURL(file);
      fallbackUrlRef.current = url;
      setPreviewLogoUrl(url);
      setLogoUploadFailed(true);
      setLogoError('Logo upload failed. Re-upload the file or remove the preview before saving.');
      if (previousUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previousUrl);
      }
    } finally {
      setIsUploadingLogo(false);
      // Reset the input so the same file can be selected again
      e.target.value = '';
    }
  };

  const handleRemoveLogo = () => {
    // Revoke a fallback blob URL before clearing the logo.
    if (fallbackUrlRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(fallbackUrlRef.current);
      fallbackUrlRef.current = null;
    }
    setPreviewLogoUrl(null);
    setLogoUploadFailed(false);
    setLogoError(null);
    updateSetting('logo_url', undefined);
  };

  const handleApplyPreset = (preset: (typeof PRESET_THEMES)[0]) => {
    setSettings(prev => ({
      ...prev,
      primary_color: preset.primary,
      secondary_color: preset.secondary,
      accent_color: preset.accent,
    }));
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  const handleSave = () => {
    if (logoUploadFailed) {
      setLogoError('Re-upload the logo or remove the preview before saving branding.');
      return;
    }

    // Hard guarantee: never persist a local blob URL — it would not render
    // outside this browser session. Drop it (or revert to no logo) if a stale
    // blob: URL ever reaches settings.logo_url.
    const settingsToSave: BrandingSettings = {
      ...settings,
      logo_url: settings.logo_url?.startsWith('blob:') ? undefined : settings.logo_url,
    };
    onSave(settingsToSave);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Branding & Customization
          </DialogTitle>
          <DialogDescription>
            Customize the look and feel of your tours with your brand colors, logo, and more.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex gap-6 overflow-hidden">
          {/* Settings Panel */}
          <div className="w-1/2 overflow-hidden flex flex-col">
            <Tabs defaultValue="colors" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="colors" className="gap-1.5">
                  <Palette className="h-4 w-4" />
                  Colors
                </TabsTrigger>
                <TabsTrigger value="logo" className="gap-1.5">
                  <ImageIcon className="h-4 w-4" />
                  Logo
                </TabsTrigger>
                <TabsTrigger value="typography" className="gap-1.5">
                  <Type className="h-4 w-4" />
                  Typography
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto mt-4 pr-2">
                {/* Colors Tab */}
                <TabsContent value="colors" className="m-0 space-y-6">
                  {/* Preset themes */}
                  <div>
                    <Label className="mb-3 block">Quick Presets</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {PRESET_THEMES.map(preset => (
                        <button
                          key={preset.name}
                          onClick={() => handleApplyPreset(preset)}
                          type="button"
                          aria-pressed={settings.primary_color === preset.primary}
                          className={cn(
                            'p-3 rounded-lg border text-left transition-colors',
                            settings.primary_color === preset.primary
                              ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]'
                              : 'border-[var(--color-border)] hover:bg-[var(--color-surface-elevated)]'
                          )}
                        >
                          <div className="flex gap-1 mb-2">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: preset.primary }}
                            />
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: preset.secondary }}
                            />
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: preset.accent }}
                            />
                          </div>
                          <span className="text-xs font-medium">{preset.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom colors */}
                  <div className="space-y-4">
                    <Label>Custom Colors</Label>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="primary-color" className="text-sm">
                          Primary
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="primary-color"
                            type="color"
                            value={settings.primary_color}
                            onChange={e => updateSetting('primary_color', e.target.value)}
                            className="w-12 h-10 p-1 cursor-pointer"
                          />
                          <Input
                            value={settings.primary_color}
                            onChange={e => updateSetting('primary_color', e.target.value)}
                            className="flex-1 font-mono text-sm"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="secondary-color" className="text-sm">
                          Secondary
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="secondary-color"
                            type="color"
                            value={settings.secondary_color}
                            onChange={e => updateSetting('secondary_color', e.target.value)}
                            className="w-12 h-10 p-1 cursor-pointer"
                          />
                          <Input
                            value={settings.secondary_color}
                            onChange={e => updateSetting('secondary_color', e.target.value)}
                            className="flex-1 font-mono text-sm"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="accent-color" className="text-sm">
                          Accent
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="accent-color"
                            type="color"
                            value={settings.accent_color}
                            onChange={e => updateSetting('accent_color', e.target.value)}
                            className="w-12 h-10 p-1 cursor-pointer"
                          />
                          <Input
                            value={settings.accent_color}
                            onChange={e => updateSetting('accent_color', e.target.value)}
                            className="flex-1 font-mono text-sm"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="text-color" className="text-sm">
                          Text
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="text-color"
                            type="color"
                            value={settings.text_color}
                            onChange={e => updateSetting('text_color', e.target.value)}
                            className="w-12 h-10 p-1 cursor-pointer"
                          />
                          <Input
                            value={settings.text_color}
                            onChange={e => updateSetting('text_color', e.target.value)}
                            className="flex-1 font-mono text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Button style */}
                  <div className="space-y-2">
                    <Label>Button Style</Label>
                    <div className="flex gap-2">
                      {(['rounded', 'square', 'pill'] as const).map(style => (
                        <button
                          key={style}
                          onClick={() => updateSetting('button_style', style)}
                          className={cn(
                            'flex-1 py-2 px-4 border transition-colors capitalize',
                            style === 'rounded' && 'rounded-lg',
                            style === 'square' && 'rounded-none',
                            style === 'pill' && 'rounded-full',
                            settings.button_style === style
                              ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)]'
                              : 'border-[var(--color-border)]'
                          )}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                {/* Logo Tab */}
                <TabsContent value="logo" className="m-0 space-y-6">
                  <div className="space-y-4">
                    <Label>Logo</Label>

                    {logoUploadFailed && (
                      <p className="text-xs text-[var(--color-error-500)]">
                        Logo upload failed - preview only. Re-upload to save it.
                      </p>
                    )}

                    {logoError && (
                      <p className="text-xs text-[var(--color-error-500)]" role="alert">
                        {logoError}
                      </p>
                    )}

                    {previewLogoUrl || settings.logo_url ? (
                      <div className="relative inline-block">
                        <div className="p-4 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)]">
                          <img
                            src={previewLogoUrl ?? settings.logo_url}
                            alt="Logo"
                            className="max-h-16 max-w-[200px] object-contain"
                          />
                        </div>
                        <button
                          onClick={handleRemoveLogo}
                          type="button"
                          aria-label="Remove logo"
                          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[var(--color-error-500)] text-white flex items-center justify-center"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => !isUploadingLogo && fileInputRef.current?.click()}
                        disabled={isUploadingLogo}
                        className={cn(
                          'w-full border-2 border-dashed border-[var(--color-border)] rounded-lg p-8 text-center transition-colors disabled:opacity-70',
                          isUploadingLogo
                            ? 'cursor-wait'
                            : 'cursor-pointer hover:border-[var(--color-primary-300)]'
                        )}
                      >
                        {isUploadingLogo ? (
                          <>
                            <Loader2 className="h-8 w-8 mx-auto text-[var(--color-primary-500)] mb-2 animate-spin" />
                            <p className="text-sm font-medium">Uploading...</p>
                          </>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 mx-auto text-[var(--color-text-muted)] mb-2" />
                            <p className="text-sm font-medium">Upload your logo</p>
                            <p className="text-xs text-[var(--color-text-muted)] mt-1">
                              PNG, SVG, or JPG (max 200x50)
                            </p>
                          </>
                        )}
                      </button>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      onChange={handleLogoUpload}
                      aria-label="Upload branding logo"
                      className="hidden"
                    />

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingLogo}
                    >
                      {isUploadingLogo ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {isUploadingLogo
                        ? 'Uploading...'
                        : previewLogoUrl || settings.logo_url
                          ? 'Change Logo'
                          : 'Upload Logo'}
                    </Button>
                  </div>

                  {/* Watermark settings */}
                  <div className="pt-4 border-t border-[var(--color-border)] space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Show Watermark</Label>
                        <p className="text-sm text-[var(--color-text-muted)]">
                          Display "Powered by 360 Viewer" on tours
                        </p>
                      </div>
                      <Switch
                        checked={settings.show_watermark}
                        onCheckedChange={checked => updateSetting('show_watermark', checked)}
                      />
                    </div>

                    {settings.show_watermark && (
                      <div className="space-y-2">
                        <Label>Watermark Position</Label>
                        <Select
                          value={settings.watermark_position}
                          onValueChange={value =>
                            updateSetting(
                              'watermark_position',
                              value as BrandingSettings['watermark_position']
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bottom-right">Bottom Right</SelectItem>
                            <SelectItem value="bottom-left">Bottom Left</SelectItem>
                            <SelectItem value="top-right">Top Right</SelectItem>
                            <SelectItem value="top-left">Top Left</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Typography Tab */}
                <TabsContent value="typography" className="m-0 space-y-6">
                  <div className="space-y-2">
                    <Label>Font Family</Label>
                    <Select
                      value={settings.font_family}
                      onValueChange={value => updateSetting('font_family', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_OPTIONS.map(font => (
                          <SelectItem
                            key={font.value}
                            value={font.value}
                            style={{ fontFamily: font.value }}
                          >
                            {font.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Font preview */}
                  <div className="p-4 rounded-lg bg-[var(--color-surface-elevated)]">
                    <p
                      className="text-lg font-semibold mb-2"
                      style={{ fontFamily: settings.font_family }}
                    >
                      The quick brown fox jumps over the lazy dog
                    </p>
                    <p className="text-sm" style={{ fontFamily: settings.font_family }}>
                      ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789
                    </p>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>

          {/* Preview Panel */}
          <div className="w-1/2 border-l border-[var(--color-border)] pl-6">
            <div className="flex items-center justify-between mb-4">
              <Label className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Preview
              </Label>
              <div className="flex gap-1">
                <Button
                  variant={previewMode === 'desktop' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setPreviewMode('desktop')}
                  aria-pressed={previewMode === 'desktop'}
                >
                  Desktop
                </Button>
                <Button
                  variant={previewMode === 'mobile' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setPreviewMode('mobile')}
                  aria-pressed={previewMode === 'mobile'}
                >
                  Mobile
                </Button>
              </div>
            </div>

            {/* Preview container */}
            <div
              className={cn(
                'rounded-lg overflow-hidden border border-[var(--color-border)] mx-auto',
                previewMode === 'mobile' ? 'w-[280px] h-[500px]' : 'w-full h-[400px]'
              )}
              style={{ backgroundColor: settings.background_color }}
            >
              {/* Mock tour viewer */}
              <div className="relative w-full h-full bg-gradient-to-br from-gray-700 to-gray-900">
                {/* Top bar */}
                <div
                  className="absolute top-0 left-0 right-0 p-3"
                  style={{ backgroundColor: `${settings.primary_color}dd` }}
                >
                  {previewLogoUrl || settings.logo_url ? (
                    <img
                      src={previewLogoUrl ?? settings.logo_url}
                      alt="Logo"
                      className="h-6 object-contain"
                    />
                  ) : (
                    <span
                      className="text-sm font-semibold"
                      style={{
                        color: '#ffffff',
                        fontFamily: settings.font_family,
                      }}
                    >
                      Virtual Tour
                    </span>
                  )}
                </div>

                {/* Mock hotspot */}
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center animate-pulse"
                  style={{ backgroundColor: settings.accent_color }}
                >
                  <div className="w-3 h-3 rounded-full bg-white" />
                </div>

                {/* Navigation bar */}
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/50">
                  <div className="flex gap-1 justify-center">
                    {[1, 2, 3, 4].map(i => (
                      <div
                        key={i}
                        className={cn('w-12 h-8 rounded', i === 1 ? 'ring-2' : 'opacity-60')}
                        style={{
                          backgroundColor: settings.secondary_color,
                          ['--tw-ring-color' as string]: settings.primary_color,
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Watermark */}
                {settings.show_watermark && (
                  <div
                    className={cn(
                      'absolute text-xs text-white/50',
                      settings.watermark_position === 'bottom-right' && 'bottom-12 right-2',
                      settings.watermark_position === 'bottom-left' && 'bottom-12 left-2',
                      settings.watermark_position === 'top-right' && 'top-12 right-2',
                      settings.watermark_position === 'top-left' && 'top-12 left-2'
                    )}
                  >
                    Powered by 360 Viewer
                  </div>
                )}

                {/* Sample button */}
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2">
                  <button
                    className={cn(
                      'px-4 py-2 text-white text-sm font-medium',
                      settings.button_style === 'rounded' && 'rounded-lg',
                      settings.button_style === 'square' && 'rounded-none',
                      settings.button_style === 'pill' && 'rounded-full'
                    )}
                    style={{
                      backgroundColor: settings.primary_color,
                      fontFamily: settings.font_family,
                    }}
                  >
                    Sample Button
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 pt-4 border-t border-[var(--color-border)]">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" />
            Reset to Default
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} isLoading={isLoading} disabled={isUploadingLogo}>
            <Check className="h-4 w-4" />
            Save Branding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
