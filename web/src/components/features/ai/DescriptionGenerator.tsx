import { useState } from 'react';
import {
  Sparkles,
  Check,
  RefreshCw,
  FileText,
  Wand2,
  Copy,
  Edit3,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Textarea,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
} from '@/components/ui';
import { useToast } from '@/hooks';
import type { Scene } from '@/types';
import type { DescriptionOptions } from '@/api';
import { AIJobStatus } from './AIJobStatus';
import { AiRetryError } from './AiRetryError';
import { aiApi } from '@/api';
import { copyToClipboard } from '@/utils/copyToClipboard';

interface DescriptionGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tourId: string;
  scenes: Scene[];
  onApply: (descriptions: Record<string, string>) => void;
  isLoading?: boolean;
}

export function DescriptionGenerator({
  open,
  onOpenChange,
  tourId,
  scenes,
  onApply,
  isLoading = false,
}: DescriptionGeneratorProps) {
  const { error: toastError, success: toastSuccess } = useToast();
  const [jobId, setJobId] = useState<string | null>(null);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [editedDescriptions, setEditedDescriptions] = useState<Record<string, string>>({});
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [options, setOptions] = useState<DescriptionOptions>({
    tone: 'professional',
    length: 'medium',
    include_features: true,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartGeneration = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await aiApi.generateDescriptions(tourId, options);
      setJobId(response.job.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to start generation';
      setError(message);
      console.error('Description generation failed:', e);
      setIsGenerating(false);
    }
  };

  const handleJobComplete = (job: unknown, result: unknown) => {
    setIsGenerating(false);
    setJobId(null);
    if (
      result &&
      typeof result === 'object' &&
      'descriptions' in result &&
      typeof (result as { descriptions: unknown }).descriptions === 'object' &&
      (result as { descriptions: unknown }).descriptions !== null
    ) {
      const descs = (result as { descriptions: Record<string, string> }).descriptions;
      setDescriptions(descs);
      setEditedDescriptions(descs);
      setError(null);
      return;
    }

    const message = 'Description generation finished without returning descriptions.';
    setError(message);
    toastError(message, { title: 'Generation incomplete' });
  };

  const handleJobError = (job: unknown, errorMessage: string) => {
    setIsGenerating(false);
    setJobId(null);
    setError(errorMessage || 'Failed to generate descriptions');
    toastError(errorMessage || 'Failed to generate descriptions', { title: 'Generation failed' });
  };

  const handleEditDescription = (sceneId: string, newDescription: string) => {
    setEditedDescriptions((prev) => ({
      ...prev,
      [sceneId]: newDescription,
    }));
  };

  const handleCopyDescription = async (description: string) => {
    const copied = await copyToClipboard(description);
    if (copied) {
      toastSuccess('Description copied to clipboard');
    } else {
      toastError('Could not copy the description. Please copy it manually.', {
        title: 'Copy failed',
      });
    }
  };

  const handleResetDescription = (sceneId: string) => {
    setEditedDescriptions((prev) => ({
      ...prev,
      [sceneId]: descriptions[sceneId],
    }));
    setEditingSceneId(null);
  };

  const handleApply = () => {
    onApply(editedDescriptions);
    onOpenChange(false);
  };

  const getScene = (sceneId: string) => scenes.find((s) => s.id === sceneId);

  const hasChanges = (sceneId: string) => {
    return editedDescriptions[sceneId] !== descriptions[sceneId];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-[var(--color-primary-500)]" />
            AI Description Generator
          </DialogTitle>
          <DialogDescription>
            Generate engaging descriptions for your tour scenes using AI.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* No descriptions yet - show options and start button */}
          {!jobId && Object.keys(descriptions).length === 0 && (
            <div className="space-y-6">
              {/* Options */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tone</Label>
                  <Select
                    value={options.tone}
                    onValueChange={(value) =>
                      setOptions((prev) => ({
                        ...prev,
                        tone: value as DescriptionOptions['tone'],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="luxury">Luxury</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Length</Label>
                  <Select
                    value={options.length}
                    onValueChange={(value) =>
                      setOptions((prev) => ({
                        ...prev,
                        length: value as DescriptionOptions['length'],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short (1-2 sentences)</SelectItem>
                      <SelectItem value="medium">Medium (2-3 sentences)</SelectItem>
                      <SelectItem value="long">Long (3-5 sentences)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Target audience */}
              <div className="space-y-2">
                <Label>Target Audience (optional)</Label>
                <Textarea
                  value={options.target_audience || ''}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      target_audience: e.target.value || undefined,
                    }))
                  }
                  placeholder="e.g., Young professionals, families with children, luxury buyers..."
                  rows={2}
                />
              </div>

              {/* Preview */}
              <div className="p-4 rounded-lg bg-[var(--color-surface-elevated)]">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Scenes to describe
                </h4>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {scenes.slice(0, 8).map((scene) => (
                    <div
                      key={scene.id}
                      className="shrink-0 text-center"
                    >
                      <img
                        src={scene.thumbnail_url || scene.image_url}
                        alt={scene.title || 'Scene'}
                        className="w-16 h-12 object-cover rounded"
                      />
                      <p className="text-xs text-[var(--color-text-muted)] mt-1 truncate w-16">
                        {scene.title || `Scene ${scene.order_index + 1}`}
                      </p>
                    </div>
                  ))}
                  {scenes.length > 8 && (
                    <div className="w-16 shrink-0 flex flex-col items-center justify-center">
                      <div className="w-16 h-12 rounded bg-[var(--color-surface)] flex items-center justify-center">
                        <span className="text-sm text-[var(--color-text-muted)]">
                          +{scenes.length - 8}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Generate button */}
              <div className="flex flex-col items-center gap-3 pt-4">
                {error && (
                  <AiRetryError error={error} onRetry={handleStartGeneration} isLoading={isGenerating} />
                )}
                <Button
                  onClick={handleStartGeneration}
                  isLoading={isGenerating}
                  disabled={scenes.length === 0}
                >
                  <Sparkles className="h-4 w-4" />
                  Generate Descriptions for {scenes.length} Scene{scenes.length !== 1 ? 's' : ''}
                </Button>
              </div>
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
                  setIsGenerating(false);
                }}
              />
            </div>
          )}

          {/* Generated descriptions */}
          {!jobId && Object.keys(descriptions).length > 0 && (
            <>
              {/* Options bar */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-[var(--color-text-muted)]">
                  {Object.keys(descriptions).length} description{Object.keys(descriptions).length !== 1 ? 's' : ''} generated
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStartGeneration}
                  isLoading={isGenerating}
                >
                  <RefreshCw className="h-4 w-4" />
                  Regenerate All
                </Button>
              </div>

              <ScrollArea className="h-[350px] pr-4">
                <div className="space-y-4">
                  {Object.entries(editedDescriptions).map(([sceneId, description]) => {
                    const scene = getScene(sceneId);
                    if (!scene) return null;

                    const isEditing = editingSceneId === sceneId;
                    const isModified = hasChanges(sceneId);

                    return (
                      <div
                        key={sceneId}
                        className="rounded-lg border border-[var(--color-border)] p-4"
                      >
                        <div className="flex gap-4">
                          {/* Scene thumbnail */}
                          <div className="w-20 h-14 rounded overflow-hidden shrink-0 bg-[var(--color-surface)]">
                            <img
                              src={scene.thumbnail_url || scene.image_url}
                              alt={scene.title || 'Scene'}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-medium text-sm">
                                {scene.title || `Scene ${scene.order_index + 1}`}
                              </span>
                              {isModified && (
                                <Badge variant="warning" className="text-xs">
                                  Modified
                                </Badge>
                              )}
                            </div>

                            {isEditing ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={description}
                                  onChange={(e) => handleEditDescription(sceneId, e.target.value)}
                                  rows={3}
                                  className="text-sm"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingSceneId(null)}
                                  >
                                    Done
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleResetDescription(sceneId)}
                                  >
                                    Reset
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--color-text-muted)]">
                                {description}
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          {!isEditing && (
                            <div className="flex flex-col gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setEditingSceneId(sceneId)}
                                title="Edit"
                              >
                                <Edit3 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleCopyDescription(description)}
                                title="Copy"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter className="mt-4 pt-4 border-t border-[var(--color-border)]">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={Object.keys(editedDescriptions).length === 0}
            isLoading={isLoading}
          >
            <Check className="h-4 w-4" />
            Apply Descriptions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
