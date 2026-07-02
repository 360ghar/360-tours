import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ArrowRight, Info, Volume2, Play, Link, Code, X, Pencil } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { toursApi } from '@/api';
import { QUERY_KEYS } from '@/constants';
import { useTourEditorStore, confirm } from '@/stores';
import { cn } from '@/utils';
import { useToast } from '@/hooks/useToast';
import { HotspotEditorModal } from './HotspotEditorModal';
import { getHotspotIconForeground } from './hotspotIcons';
import type { Hotspot, Scene } from '@/types';

interface HotspotPanelProps {
  sceneId: string;
  hotspots: Hotspot[];
  scenes: Scene[];
  className?: string;
  onClose?: () => void;
}

const HOTSPOT_ICONS = {
  navigation: ArrowRight,
  info: Info,
  audio: Volume2,
  video: Play,
  link: Link,
  custom: Code,
};

export function HotspotPanel({ sceneId, hotspots, scenes, className, onClose }: HotspotPanelProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { selectedHotspotId, selectHotspot, toggleHotspotPanel } = useTourEditorStore();

  // Modal state
  const [showEditor, setShowEditor] = useState(false);
  const [editingHotspot, setEditingHotspot] = useState<Hotspot | null>(null);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');

  const selectedHotspot = hotspots.find(h => h.id === selectedHotspotId);

  // Delete hotspot mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => toursApi.deleteHotspot(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SCENES] });
      selectHotspot(null);
      toast('success', 'The hotspot has been removed.', { title: 'Hotspot deleted' });
    },
    onError: () => {
      toast('error', 'Something went wrong. Please try again.', {
        title: 'Failed to delete hotspot',
      });
    },
  });

  const handleCreate = () => {
    setEditingHotspot(null);
    setEditorMode('create');
    setShowEditor(true);
  };

  const handleEdit = (hotspot: Hotspot) => {
    setEditingHotspot(hotspot);
    setEditorMode('edit');
    setShowEditor(true);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      await confirm({
        title: 'Delete hotspot',
        message: 'Delete this hotspot? This cannot be undone.',
        confirmLabel: 'Delete',
        destructive: true,
      })
    ) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <>
      <div
        className={cn(
          'flex w-80 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface-elevated)]',
          className
        )}
        data-testid="hotspot-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-3">
          <h3 className="font-semibold text-[var(--color-text-primary)]">Hotspots</h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleCreate}
              aria-label="Add hotspot"
              data-testid="add-hotspot"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose ?? toggleHotspotPanel}
              aria-label="Close hotspots panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Hotspot List */}
        <div className="flex-1 overflow-y-auto p-2">
          {hotspots.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Info className="h-10 w-10 text-[var(--color-text-muted)]" />
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">No hotspots yet</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Use Add Hotspot or click the panorama placement control.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={handleCreate}>
                <Plus className="h-4 w-4" />
                Add Hotspot
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {hotspots.map(hotspot => {
                const Icon = HOTSPOT_ICONS[hotspot.type as keyof typeof HOTSPOT_ICONS] || Info;
                const iconForeground = getHotspotIconForeground(hotspot.icon_color || '#FF5733');
                const isSelected = selectedHotspotId === hotspot.id;
                return (
                  <div
                    key={hotspot.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`Select ${hotspot.title || `${hotspot.type} hotspot`}`}
                    data-testid="hotspot-panel-item"
                    onClick={() => selectHotspot(hotspot.id)}
                    onKeyDown={e => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectHotspot(hotspot.id);
                      }
                    }}
                    className={cn(
                      'cursor-pointer rounded-lg border p-3 transition-all group',
                      isSelected
                        ? 'border-[var(--color-primary-500)] ring-2 ring-[var(--color-primary-500)]/20'
                        : 'border-[var(--color-border)] hover:border-[var(--color-primary-300)]'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: hotspot.icon_color || '#FF5733' }}
                      >
                        <Icon className="h-4 w-4" style={{ color: iconForeground }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">
                            {hotspot.title || `${hotspot.type} hotspot`}
                          </p>
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {hotspot.type}
                          </Badge>
                        </div>
                        {hotspot.description && (
                          <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
                            {hotspot.description}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${hotspot.title || `${hotspot.type} hotspot`}`}
                          onClick={e => {
                            e.stopPropagation();
                            handleEdit(hotspot);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${hotspot.title || `${hotspot.type} hotspot`}`}
                          disabled={deleteMutation.isPending}
                          onClick={e => handleDelete(hotspot.id, e)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-[var(--color-error-600)]" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Edit Panel for Selected Hotspot */}
        {selectedHotspot && (
          <div className="border-t border-[var(--color-border)] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Quick Info</p>
              <Button variant="ghost" size="sm" onClick={() => handleEdit(selectedHotspot)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </div>
            <div className="text-xs text-[var(--color-text-muted)] space-y-1">
              <p>
                <span className="font-medium">Type:</span> {selectedHotspot.type}
              </p>
              <p>
                <span className="font-medium">Position:</span> Yaw:{' '}
                {selectedHotspot.position.yaw.toFixed(1)}°, Pitch:{' '}
                {selectedHotspot.position.pitch.toFixed(1)}°
              </p>
              {selectedHotspot.target_scene_id && (
                <p>
                  <span className="font-medium">Target:</span>{' '}
                  {scenes.find(s => s.id === selectedHotspot.target_scene_id)?.title || 'Scene'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hotspot Editor Modal */}
      <HotspotEditorModal
        open={showEditor}
        onOpenChange={setShowEditor}
        hotspot={editingHotspot}
        sceneId={sceneId}
        scenes={scenes}
        mode={editorMode}
      />
    </>
  );
}
