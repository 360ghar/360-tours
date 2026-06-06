import { useState } from 'react';
import {
  Sparkles,
  Check,
  Navigation,
  Info,
  MapPin,
  RefreshCw,
  ArrowRight,
  Lightbulb,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Badge,
  ScrollArea,
} from '@/components/ui';
import { cn } from '@/utils';
import { useToast } from '@/hooks';
import type { Scene } from '@/types';
import type { HotspotSuggestion } from '@/api';
import { AIJobStatus } from './AIJobStatus';
import { aiApi } from '@/api';

interface HotspotSuggestionsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sceneId: string;
  scene: Scene;
  allScenes: Scene[];
  onApply: (suggestions: HotspotSuggestion[]) => void;
  isLoading?: boolean;
}

export function HotspotSuggestions({
  open,
  onOpenChange,
  sceneId,
  scene,
  allScenes,
  onApply,
  isLoading = false,
}: HotspotSuggestionsProps) {
  const { error: toastError } = useToast();
  const [jobId, setJobId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<HotspotSuggestion[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleStartSuggestion = async () => {
    setIsAnalyzing(true);
    try {
      const response = await aiApi.suggestHotspots(sceneId);
      setJobId(response.job.id);
    } catch (error) {
      console.error('Failed to start hotspot suggestion:', error);
      setIsAnalyzing(false);
    }
  };

  const handleJobComplete = (job: unknown, result: unknown) => {
    setIsAnalyzing(false);
    setJobId(null);
    if (result && typeof result === 'object' && 'hotspots' in result) {
      const hotspots = (result as { hotspots: HotspotSuggestion[] }).hotspots;
      setSuggestions(hotspots);
      // Select all suggestions by default
      setSelectedSuggestions(new Set(hotspots.map((h) => h.id)));
    }
  };

  const handleJobError = (job: unknown, errorMessage: string) => {
    setIsAnalyzing(false);
    setJobId(null);
    toastError(errorMessage || 'Failed to get hotspot suggestions', { title: 'Suggestion failed' });
  };

  const handleToggleSuggestion = (suggestionId: string) => {
    const newSelected = new Set(selectedSuggestions);
    if (newSelected.has(suggestionId)) {
      newSelected.delete(suggestionId);
    } else {
      newSelected.add(suggestionId);
    }
    setSelectedSuggestions(newSelected);
  };

  const handleSelectAll = () => {
    setSelectedSuggestions(new Set(suggestions.map((s) => s.id)));
  };

  const handleDeselectAll = () => {
    setSelectedSuggestions(new Set());
  };

  const handleApply = () => {
    const selected = suggestions.filter((s) => selectedSuggestions.has(s.id));
    onApply(selected);
    onOpenChange(false);
  };

  const getTargetScene = (targetId?: string) => {
    if (!targetId) return null;
    return allScenes.find((s) => s.id === targetId);
  };

  const getTypeIcon = (type: 'navigation' | 'info') => {
    switch (type) {
      case 'navigation':
        return <Navigation className="h-4 w-4 text-[var(--color-primary-500)]" />;
      case 'info':
        return <Info className="h-4 w-4 text-[var(--color-secondary-500)]" />;
      default:
        return <MapPin className="h-4 w-4" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-[var(--color-success-500)]';
    if (confidence >= 0.6) return 'text-[var(--color-warning-500)]';
    return 'text-[var(--color-text-muted)]';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--color-primary-500)]" />
            AI Hotspot Suggestions
          </DialogTitle>
          <DialogDescription>
            Let AI analyze your scene and suggest optimal hotspot placements for navigation and information.
          </DialogDescription>
        </DialogHeader>

        {/* Scene preview */}
        <div className="relative rounded-lg overflow-hidden bg-[var(--color-surface)] h-40">
          <img
            src={scene.image_url}
            alt={scene.title || 'Scene'}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-3 left-3 text-white">
            <p className="font-medium">{scene.title || `Scene ${scene.order_index + 1}`}</p>
            <p className="text-sm text-white/70">
              {suggestions.length > 0
                ? `${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''} found`
                : 'Analyzing scene...'}
            </p>
          </div>

          {/* Suggestion markers overlay */}
          {suggestions.length > 0 &&
            suggestions.map((suggestion) => {
              const isSelected = selectedSuggestions.has(suggestion.id);
              // Convert yaw/pitch to approximate x/y for preview
              // This is a simplified visualization
              const x = ((suggestion.position.yaw + 180) / 360) * 100;
              const y = 50 - suggestion.position.pitch;

              return (
                <div
                  key={suggestion.id}
                  className={cn(
                    'absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center cursor-pointer transition-all',
                    isSelected
                      ? 'bg-[var(--color-primary-500)] ring-2 ring-white scale-110'
                      : 'bg-white/80 hover:bg-white'
                  )}
                  style={{
                    left: `${Math.min(95, Math.max(5, x))}%`,
                    top: `${Math.min(90, Math.max(10, y))}%`,
                  }}
                  onClick={() => handleToggleSuggestion(suggestion.id)}
                  title={suggestion.suggested_title || suggestion.reasoning}
                >
                  {getTypeIcon(suggestion.type)}
                </div>
              );
            })}
        </div>

        <div className="flex-1 overflow-hidden">
          {/* No suggestions yet - show start button */}
          {!jobId && suggestions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-12 h-12 rounded-full bg-[var(--color-primary-50)] flex items-center justify-center mb-3">
                <Lightbulb className="h-6 w-6 text-[var(--color-primary-500)]" />
              </div>
              <h3 className="font-semibold mb-1">Get Hotspot Suggestions</h3>
              <p className="text-sm text-[var(--color-text-muted)] text-center max-w-sm mb-4">
                AI will analyze the scene to identify key features and suggest optimal hotspot placements.
              </p>
              <Button onClick={handleStartSuggestion} isLoading={isAnalyzing}>
                <Sparkles className="h-4 w-4" />
                Analyze Scene
              </Button>
            </div>
          )}

          {/* Job in progress */}
          {jobId && (
            <div className="py-4">
              <AIJobStatus
                jobId={jobId}
                onComplete={handleJobComplete}
                onError={handleJobError}
                onCancel={() => {
                  setJobId(null);
                  setIsAnalyzing(false);
                }}
              />
            </div>
          )}

          {/* Suggestions list */}
          {!jobId && suggestions.length > 0 && (
            <>
              {/* Selection controls */}
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-sm text-[var(--color-text-muted)]">
                  {selectedSuggestions.size} of {suggestions.length} selected
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
                    Deselect All
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[200px] pr-4">
                <div className="space-y-2">
                  {suggestions.map((suggestion) => {
                    const isSelected = selectedSuggestions.has(suggestion.id);
                    const targetScene = getTargetScene(suggestion.target_scene_id);

                    return (
                      <div
                        key={suggestion.id}
                        className={cn(
                          'rounded-lg border p-3 cursor-pointer transition-colors',
                          isSelected
                            ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]'
                            : 'border-[var(--color-border)] hover:bg-[var(--color-surface-elevated)]'
                        )}
                        onClick={() => handleToggleSuggestion(suggestion.id)}
                      >
                        <div className="flex items-start gap-3">
                          {/* Type icon */}
                          <div
                            className={cn(
                              'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                              suggestion.type === 'navigation'
                                ? 'bg-[var(--color-primary-100)]'
                                : 'bg-[var(--color-secondary-100)]'
                            )}
                          >
                            {getTypeIcon(suggestion.type)}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {suggestion.suggested_title || `${suggestion.type} hotspot`}
                              </span>
                              <Badge variant="outline" className="text-xs capitalize">
                                {suggestion.type}
                              </Badge>
                            </div>

                            {/* Target scene for navigation */}
                            {suggestion.type === 'navigation' && targetScene && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-[var(--color-text-muted)]">
                                <ArrowRight className="h-3 w-3" />
                                Navigate to: {targetScene.title || `Scene ${targetScene.order_index + 1}`}
                              </div>
                            )}

                            {/* Reasoning */}
                            <p className="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-1">
                              {suggestion.reasoning}
                            </p>

                            {/* Confidence */}
                            <span className={cn('text-xs', getConfidenceColor(suggestion.confidence))}>
                              {Math.round(suggestion.confidence * 100)}% confidence
                            </span>
                          </div>

                          {/* Selection indicator */}
                          <div
                            className={cn(
                              'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0',
                              isSelected
                                ? 'bg-[var(--color-primary-500)] border-[var(--color-primary-500)]'
                                : 'border-[var(--color-border)]'
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Re-analyze button */}
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStartSuggestion}
                  isLoading={isAnalyzing}
                >
                  <RefreshCw className="h-4 w-4" />
                  Re-analyze
                </Button>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="mt-4 pt-4 border-t border-[var(--color-border)]">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={selectedSuggestions.size === 0}
            isLoading={isLoading}
          >
            <Check className="h-4 w-4" />
            Add {selectedSuggestions.size} Hotspot{selectedSuggestions.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
