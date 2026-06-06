import { useState } from 'react';
import {
  Sparkles,
  Check,
  AlertTriangle,
  RefreshCw,
  Home,
  UtensilsCrossed,
  Bed,
  Bath,
  Sofa,
  GraduationCap,
  Dumbbell,
  Trees,
  Car,
  Building2,
  HelpCircle,
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
  Checkbox,
} from '@/components/ui';
import { cn } from '@/utils';
import { useToast } from '@/hooks';
import type { Scene } from '@/types';
import type { SceneAnalysisResult } from '@/api';
import { AIJobStatus } from './AIJobStatus';
import { aiApi } from '@/api';

interface SceneAnalysisProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tourId: string;
  scenes: Scene[];
  onApply: (updates: Array<{ scene_id: string; title?: string; description?: string }>) => void;
  isLoading?: boolean;
}

// Room type icon mapping
const roomIcons: Record<string, React.ReactNode> = {
  living_room: <Sofa className="h-4 w-4" />,
  bedroom: <Bed className="h-4 w-4" />,
  kitchen: <UtensilsCrossed className="h-4 w-4" />,
  bathroom: <Bath className="h-4 w-4" />,
  dining_room: <UtensilsCrossed className="h-4 w-4" />,
  office: <GraduationCap className="h-4 w-4" />,
  gym: <Dumbbell className="h-4 w-4" />,
  outdoor: <Trees className="h-4 w-4" />,
  garage: <Car className="h-4 w-4" />,
  lobby: <Building2 className="h-4 w-4" />,
  entrance: <Home className="h-4 w-4" />,
  unknown: <HelpCircle className="h-4 w-4" />,
};

// Room type display names
const roomTypeNames: Record<string, string> = {
  living_room: 'Living Room',
  bedroom: 'Bedroom',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  dining_room: 'Dining Room',
  office: 'Office/Study',
  gym: 'Gym/Fitness',
  outdoor: 'Outdoor/Garden',
  garage: 'Garage',
  lobby: 'Lobby/Hallway',
  entrance: 'Entrance/Foyer',
  unknown: 'Unknown',
};

export function SceneAnalysis({
  open,
  onOpenChange,
  tourId,
  scenes,
  onApply,
  isLoading = false,
}: SceneAnalysisProps) {
  const { error: toastError } = useToast();
  const [jobId, setJobId] = useState<string | null>(null);
  const [analysisResults, setAnalysisResults] = useState<SceneAnalysisResult[]>([]);
  const [selectedScenes, setSelectedScenes] = useState<Set<string>>(new Set());
  const [applyTitles, setApplyTitles] = useState(true);
  const [applyDescriptions, setApplyDescriptions] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleStartAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const response = await aiApi.analyzeScenes(tourId);
      setJobId(response.job.id);
    } catch (error) {
      console.error('Failed to start analysis:', error);
      setIsAnalyzing(false);
    }
  };

  const handleJobComplete = (job: unknown, result: unknown) => {
    setIsAnalyzing(false);
    setJobId(null);
    if (result && typeof result === 'object' && 'analysis' in result) {
      const analysis = (result as { analysis: SceneAnalysisResult[] }).analysis;
      setAnalysisResults(analysis);
      // Select all scenes by default
      setSelectedScenes(new Set(analysis.map((a) => a.scene_id)));
    }
  };

  const handleJobError = (job: unknown, errorMessage: string) => {
    setIsAnalyzing(false);
    setJobId(null);
    toastError(errorMessage || 'Scene analysis failed', { title: 'Analysis failed' });
  };

  const handleToggleScene = (sceneId: string) => {
    const newSelected = new Set(selectedScenes);
    if (newSelected.has(sceneId)) {
      newSelected.delete(sceneId);
    } else {
      newSelected.add(sceneId);
    }
    setSelectedScenes(newSelected);
  };

  const handleSelectAll = () => {
    setSelectedScenes(new Set(analysisResults.map((a) => a.scene_id)));
  };

  const handleDeselectAll = () => {
    setSelectedScenes(new Set());
  };

  const handleApply = () => {
    const updates = analysisResults
      .filter((a) => selectedScenes.has(a.scene_id))
      .map((a) => ({
        scene_id: a.scene_id,
        title: applyTitles ? a.suggested_title : undefined,
        description: applyDescriptions ? a.suggested_description : undefined,
      }));

    onApply(updates);
    onOpenChange(false);
  };

  const getScene = (sceneId: string) => scenes.find((s) => s.id === sceneId);

  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-[var(--color-success-500)]';
    if (score >= 60) return 'text-[var(--color-warning-500)]';
    return 'text-[var(--color-error-500)]';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.9) return 'High';
    if (confidence >= 0.7) return 'Medium';
    return 'Low';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--color-primary-500)]" />
            AI Scene Analysis
          </DialogTitle>
          <DialogDescription>
            Use AI to automatically detect room types, suggest titles, and analyze image quality.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* No analysis yet - show start button */}
          {!jobId && analysisResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full bg-[var(--color-primary-50)] flex items-center justify-center mb-4">
                <Sparkles className="h-8 w-8 text-[var(--color-primary-500)]" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Analyze Your Scenes</h3>
              <p className="text-sm text-[var(--color-text-muted)] text-center max-w-md mb-6">
                Our AI will analyze {scenes.length} scene{scenes.length !== 1 ? 's' : ''} to detect
                room types, suggest titles and descriptions, and assess image quality.
              </p>
              <Button onClick={handleStartAnalysis} isLoading={isAnalyzing}>
                <Sparkles className="h-4 w-4" />
                Start Analysis
              </Button>
            </div>
          )}

          {/* Job in progress */}
          {jobId && (
            <div className="py-8 px-4">
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

          {/* Analysis results */}
          {!jobId && analysisResults.length > 0 && (
            <>
              {/* Options */}
              <div className="flex items-center justify-between px-1 mb-3">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={applyTitles}
                      onCheckedChange={(checked) => setApplyTitles(checked === true)}
                    />
                    <span className="text-sm">Apply Titles</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={applyDescriptions}
                      onCheckedChange={(checked) => setApplyDescriptions(checked === true)}
                    />
                    <span className="text-sm">Apply Descriptions</span>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
                    Deselect All
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {analysisResults.map((result) => {
                    const scene = getScene(result.scene_id);
                    const isSelected = selectedScenes.has(result.scene_id);

                    return (
                      <div
                        key={result.scene_id}
                        className={cn(
                          'rounded-lg border p-4 cursor-pointer transition-colors',
                          isSelected
                            ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]'
                            : 'border-[var(--color-border)] hover:bg-[var(--color-surface-elevated)]'
                        )}
                        onClick={() => handleToggleScene(result.scene_id)}
                      >
                        <div className="flex gap-4">
                          {/* Scene thumbnail */}
                          <div className="w-24 h-16 rounded overflow-hidden shrink-0 bg-[var(--color-surface)]">
                            <img
                              src={scene?.thumbnail_url || scene?.image_url}
                              alt={scene?.title || 'Scene'}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          {/* Analysis info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <div>
                                {/* Room type */}
                                <div className="flex items-center gap-2 mb-1">
                                  {roomIcons[result.room_type] || roomIcons.unknown}
                                  <span className="font-medium">
                                    {roomTypeNames[result.room_type] || result.room_type}
                                  </span>
                                  <Badge variant="secondary" className="text-xs">
                                    {getConfidenceLabel(result.room_confidence)} confidence
                                  </Badge>
                                </div>

                                {/* Suggested title */}
                                <p className="text-sm text-[var(--color-text-muted)]">
                                  <span className="font-medium">Suggested:</span>{' '}
                                  {result.suggested_title}
                                </p>
                              </div>

                              {/* Selection checkbox */}
                              <div
                                className={cn(
                                  'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0',
                                  isSelected
                                    ? 'bg-[var(--color-primary-500)] border-[var(--color-primary-500)]'
                                    : 'border-[var(--color-border)]'
                                )}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {isSelected && <Check className="h-3 w-3 text-white" />}
                              </div>
                            </div>

                            {/* Quality score and features */}
                            <div className="flex items-center gap-4 mt-2">
                              <span className={cn('text-sm font-medium', getQualityColor(result.quality_score))}>
                                Quality: {result.quality_score}%
                              </span>

                              {result.quality_issues && result.quality_issues.length > 0 && (
                                <div className="flex items-center gap-1 text-xs text-[var(--color-warning-500)]">
                                  <AlertTriangle className="h-3 w-3" />
                                  {result.quality_issues.length} issue{result.quality_issues.length !== 1 ? 's' : ''}
                                </div>
                              )}

                              {result.features_detected.length > 0 && (
                                <div className="flex gap-1 flex-wrap">
                                  {result.features_detected.slice(0, 3).map((feature) => (
                                    <Badge key={feature} variant="outline" className="text-xs">
                                      {feature}
                                    </Badge>
                                  ))}
                                  {result.features_detected.length > 3 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{result.features_detected.length - 3} more
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Re-analyze button */}
              <div className="mt-4 pt-3 border-t border-[var(--color-border)]">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStartAnalysis}
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
            disabled={selectedScenes.size === 0 || (!applyTitles && !applyDescriptions)}
            isLoading={isLoading}
          >
            <Check className="h-4 w-4" />
            Apply to {selectedScenes.size} Scene{selectedScenes.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
