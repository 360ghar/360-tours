import { useState } from 'react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Button,
  Input,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui';
import { cn } from '@/utils';
import {
  DEFAULT_HOTSPOT_ICON,
  HOTSPOT_ICON_BY_NAME,
  HOTSPOT_ICON_CATEGORIES,
  getHotspotIconForeground,
} from './hotspotIcons';

// Predefined colors
const PRESET_COLORS = [
  '#FF5733', // Primary orange
  '#22c55e', // Green
  '#ef4444', // Red
  '#f59e0b', // Amber
  '#3D3D3D', // Dark grey
  '#FFC857', // Gold
  '#ec4899', // Pink
  '#6B6B6B', // Grey
  '#000000', // Black
  '#ffffff', // White
];

// Icon sizes
const ICON_SIZES = [
  { value: 24, label: 'S' },
  { value: 32, label: 'M' },
  { value: 40, label: 'L' },
  { value: 48, label: 'XL' },
];

export interface HotspotIconConfig {
  iconName: string;
  iconColor: string;
  iconSize: number;
}

interface HotspotIconPickerProps {
  value: HotspotIconConfig;
  onChange: (config: HotspotIconConfig) => void;
  trigger?: React.ReactNode;
}

export function HotspotIconPicker({ value, onChange, trigger }: HotspotIconPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customColor, setCustomColor] = useState(value.iconColor);

  const CurrentIcon = HOTSPOT_ICON_BY_NAME[value.iconName] ?? DEFAULT_HOTSPOT_ICON;
  const iconForeground = getHotspotIconForeground(value.iconColor);

  const handleIconSelect = (iconName: string) => {
    onChange({ ...value, iconName });
  };

  const handleColorSelect = (color: string) => {
    onChange({ ...value, iconColor: color });
    setCustomColor(color);
  };

  const handleSizeSelect = (size: number) => {
    onChange({ ...value, iconSize: size });
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <div
              className="flex h-6 w-6 items-center justify-center rounded"
              style={{ backgroundColor: value.iconColor }}
            >
              <CurrentIcon className="h-4 w-4" style={{ color: iconForeground }} />
            </div>
            <span>Change Icon</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] p-0" align="start">
        <Tabs defaultValue="icon" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b border-[var(--color-border)] bg-transparent p-0">
            <TabsTrigger
              value="icon"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--color-primary-500)]"
            >
              Icon
            </TabsTrigger>
            <TabsTrigger
              value="color"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--color-primary-500)]"
            >
              Color
            </TabsTrigger>
            <TabsTrigger
              value="size"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--color-primary-500)]"
            >
              Size
            </TabsTrigger>
          </TabsList>

          {/* Icon Selection */}
          <TabsContent value="icon" className="m-0 max-h-64 overflow-y-auto p-3">
            <div className="space-y-4">
              {Object.entries(HOTSPOT_ICON_CATEGORIES).map(([key, category]) => (
                <div key={key}>
                  <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">
                    {category.label}
                  </p>
                  <div className="grid grid-cols-6 gap-1">
                    {category.icons.map(({ name, icon: Icon }) => (
                      <button
                        key={name}
                        type="button"
                        aria-label={`Use ${name} icon`}
                        aria-pressed={value.iconName === name}
                        onClick={() => handleIconSelect(name)}
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded transition-colors',
                          value.iconName === name
                            ? 'bg-[var(--color-primary-100)] text-[var(--color-primary-600)]'
                            : 'hover:bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Color Selection */}
          <TabsContent value="color" className="m-0 p-3">
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">
                  Preset Colors
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Use color ${color}`}
                      aria-pressed={value.iconColor === color}
                      onClick={() => handleColorSelect(color)}
                      className={cn(
                        'h-10 w-10 rounded border-2 transition-all',
                        value.iconColor === color
                          ? 'border-[var(--color-primary-500)] ring-2 ring-[var(--color-primary-500)]/20'
                          : 'border-[var(--color-border)]'
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="hotspot-custom-color" className="text-xs">
                  Custom Color
                </Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    id="hotspot-custom-color"
                    aria-label="Choose custom hotspot color"
                    type="color"
                    value={customColor}
                    onChange={e => handleColorSelect(e.target.value)}
                    className="h-10 w-12 cursor-pointer p-1"
                  />
                  <Input
                    aria-label="Custom hotspot color hex value"
                    value={customColor}
                    onChange={e => {
                      setCustomColor(e.target.value);
                      if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                        onChange({ ...value, iconColor: e.target.value });
                      }
                    }}
                    placeholder="#000000"
                    className="flex-1 font-mono"
                  />
                </div>
              </div>

              {/* Preview */}
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border)]">
                <span className="text-xs text-[var(--color-text-muted)]">Preview:</span>
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ backgroundColor: value.iconColor }}
                >
                  <CurrentIcon className="h-4 w-4" style={{ color: iconForeground }} />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Size Selection */}
          <TabsContent value="size" className="m-0 p-3">
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">Icon Size</p>
                <div className="flex gap-2">
                  {ICON_SIZES.map(({ value: size, label }) => (
                    <button
                      key={size}
                      type="button"
                      aria-label={`Use ${size}px hotspot icon size`}
                      aria-pressed={value.iconSize === size}
                      onClick={() => handleSizeSelect(size)}
                      className={cn(
                        'flex-1 rounded-lg border p-3 text-center transition-colors',
                        value.iconSize === size
                          ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]'
                          : 'border-[var(--color-border)] hover:bg-[var(--color-surface)]'
                      )}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <CurrentIcon
                          className="text-[var(--color-text-primary)]"
                          style={{ width: size / 2, height: size / 2 }}
                        />
                        <span className="text-xs font-medium">{label}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">{size}px</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview at actual size */}
              <div className="flex items-center justify-center pt-3 border-t border-[var(--color-border)]">
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    backgroundColor: value.iconColor,
                    width: value.iconSize,
                    height: value.iconSize,
                  }}
                >
                  <CurrentIcon
                    className="text-white"
                    style={{
                      width: value.iconSize * 0.5,
                      height: value.iconSize * 0.5,
                      color: iconForeground,
                    }}
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
