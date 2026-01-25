import { useBatchStore, useGlobalProgress } from "@/store/batch";
import { cn } from "@/lib/utils";

/**
 * Fixed bottom progress bar showing global batch processing progress.
 * Shows yellow when paused, green when processing.
 * Hidden when not processing and no progress.
 */
export function GlobalProgressBar() {
  const progress = useGlobalProgress();
  const isProcessing = useBatchStore((s) => s.isProcessing);
  const isPaused = useBatchStore((s) => s.isPaused);

  // Hide when not processing and no progress
  if (!isProcessing && progress === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-1.5 bg-muted z-50">
      <div
        className={cn(
          "h-full transition-all duration-300",
          isPaused ? "bg-yellow-500" : "bg-green-500"
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
