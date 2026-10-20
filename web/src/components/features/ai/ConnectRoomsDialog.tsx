import { useState } from 'react';
import { Route, Check, AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@/components/ui';
import { useToast } from '@/hooks';
import { aiApi, readSpatialLinkSummary, type SpatialLinkSummary } from '@/api';
import { AIJobStatus } from './AIJobStatus';
import { AiRetryError } from './AiRetryError';

interface ConnectRoomsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tourId: string;
  sceneCount: number;
  /** Called when the job finishes, so the caller refetches scenes and hotspots. */
  onApplied: () => void;
}

/**
 * Re-runs AI doorway linking on an existing tour. The server replaces its own
 * previous links and keeps manual hotspots; the finished job reports how many
 * links were made and what still needs attention.
 */
export function ConnectRoomsDialog({
  open,
  onOpenChange,
  tourId,
  sceneCount,
  onApplied,
}: ConnectRoomsDialogProps) {
  const { error: toastError } = useToast();
  const [jobId, setJobId] = useState<string | null>(null);
  const [summary, setSummary] = useState<SpatialLinkSummary | null>(null);
  // A finished job that sent no report must not fall back to the pre-run screen,
  // which would read as "nothing happened".
  const [ranWithoutReport, setRanWithoutReport] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    setSummary(null);
    setRanWithoutReport(false);
    try {
      const response = await aiApi.connectSpatial(tourId);
      setJobId(response.job.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to start room linking';
      setError(message);
      toastError(message, { title: 'Room linking failed' });
    } finally {
      setIsStarting(false);
    }
  };

  const handleComplete = (_job: unknown, result: unknown) => {
    setJobId(null);
    const next = readSpatialLinkSummary(result);
    setSummary(next);
    setRanWithoutReport(next === null);
    onApplied();
  };

  const handleError = (_job: unknown, errorMessage: string) => {
    setJobId(null);
    const message = errorMessage || 'Room linking failed';
    setError(message);
    toastError(message, { title: 'Room linking failed' });
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // Keep jobId: the job keeps running on the server, and reopening the
      // dialog must monitor the same job (and refresh the editor when it ends).
      setSummary(null);
      setRanWithoutReport(false);
      setError(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-5 w-5 text-[var(--color-primary-500)]" />
            Connect Rooms with AI
          </DialogTitle>
          <DialogDescription>
            AI looks at each panorama, finds the doorways, and links every room to the one behind
            each door, with a way back. It replaces its own previous links and keeps the hotspots
            you placed by hand.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {!jobId && !summary && ranWithoutReport && (
            <div className="space-y-3" role="status">
              <div className="p-4 rounded-lg bg-[var(--color-warning-50)] text-[var(--color-warning-600)] flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">The job finished without a linking report</p>
                  <p className="text-sm mt-1">
                    The rooms could not be analysed, so nothing was linked. Re-run the job, or link
                    the rooms by hand from each panorama.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!jobId && !summary && !ranWithoutReport && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--color-primary-50)] flex items-center justify-center mb-4">
                <Route className="h-8 w-8 text-[var(--color-primary-500)]" />
              </div>
              <p className="text-sm text-[var(--color-text-muted)] max-w-md mb-3">
                {sceneCount} scene{sceneCount !== 1 ? 's' : ''} will be analysed. This usually takes
                a few minutes; you can close this dialog and the job keeps running.
              </p>
              <p className="text-xs text-[var(--color-text-muted)] max-w-md mb-6">
                The old AI links are cleared before the new ones are found, so a cancelled job
                leaves the rooms unlinked until you re-run it. Hotspots you placed by hand are never
                touched.
              </p>
              {error && <AiRetryError error={error} onRetry={handleStart} isLoading={isStarting} />}
              <Button onClick={handleStart} isLoading={isStarting}>
                <Sparkles className="h-4 w-4" />
                Connect Rooms
              </Button>
            </div>
          )}

          {jobId && (
            <div className="py-4 space-y-3">
              <AIJobStatus
                jobId={jobId}
                onComplete={handleComplete}
                onError={handleError}
                showCancelButton={true}
                onCancel={() => {
                  setJobId(null);
                  // The server already removed the old AI links: refresh the editor.
                  onApplied();
                }}
              />
              <p className="text-xs text-[var(--color-text-muted)]">
                Closing this dialog keeps the job running. Cancelling stops it: the old AI links are
                already cleared, so re-run to link the rooms again.
              </p>
            </div>
          )}

          {!jobId && summary && (
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-[var(--color-success-50)] text-[var(--color-success-600)] flex items-start gap-3">
                <Check className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Rooms linked</p>
                  <p className="text-sm mt-1">
                    {summary.linkCount} doorway connection
                    {summary.linkCount !== 1 ? 's' : ''} across {summary.sceneCount} room
                    {summary.sceneCount !== 1 ? 's' : ''}.
                  </p>
                </div>
              </div>
              {summary.warnings.length > 0 ? (
                <ul className="space-y-2" role="status">
                  {summary.warnings.map(warning => (
                    <li
                      key={warning}
                      className="flex items-start gap-2 text-sm text-[var(--color-warning-500)]"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--color-text-muted)]">
                  Every room is reachable from the start, and every link can be walked back.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!jobId && (summary || ranWithoutReport) && (
            <Button variant="outline" onClick={handleStart} isLoading={isStarting}>
              <RefreshCw className="h-4 w-4" />
              Re-run
            </Button>
          )}
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={!!jobId}>
            {summary || ranWithoutReport ? 'Done' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
