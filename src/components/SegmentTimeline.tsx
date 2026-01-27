import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Waveform, WaveformPlaceholder } from "@/components/Timeline/Waveform";
import { TimelineRuler } from "@/components/Timeline/TimelineRuler";
import { TimelinePlayhead } from "@/components/Timeline/TimelinePlayhead";
import { SegmentTrack } from "@/components/Timeline/SegmentTrack";
import { useWaveform } from "@/hooks/useWaveform";
import {
  useVideoSegments,
  useVideoSilences,
  useTimelineActions,
  useTimelineZoomLevel,
  useViewportStart,
  useTimelineSelection,
} from "@/store/timeline";

interface SegmentTimelineProps {
  videoId: string;
  videoPath: string;
  durationMs: number;
  currentTimeMs: number;
  onSeek: (ms: number) => void;
  className?: string;
}

export function SegmentTimeline({
  videoId,
  videoPath,
  durationMs,
  currentTimeMs,
  onSeek,
  className,
}: SegmentTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [compressedView, setCompressedView] = useState(false);

  // Waveform data
  const { rawData: waveformRawData, loading: waveformLoading } = useWaveform(
    videoPath,
    { samplesPerSecond: 200 }
  );

  // Store state
  const zoomLevel = useTimelineZoomLevel();
  const viewportStartMs = useViewportStart();
  const selection = useTimelineSelection();
  const segments = useVideoSegments(videoId);
  const silences = useVideoSilences(videoId);

  // Calculate compressed duration (only enabled segments)
  const enabledSegments = useMemo(
    () => segments.filter((s) => s.enabled).sort((a, b) => a.startMs - b.startMs),
    [segments]
  );
  const compressedDurationMs = useMemo(
    () => enabledSegments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0),
    [enabledSegments]
  );

  // Map compressed time to original time
  const mapCompressedToOriginal = useCallback(
    (compressedMs: number): number => {
      let accumulated = 0;
      for (const segment of enabledSegments) {
        const segmentDuration = segment.endMs - segment.startMs;
        if (compressedMs < accumulated + segmentDuration) {
          return segment.startMs + (compressedMs - accumulated);
        }
        accumulated += segmentDuration;
      }
      return enabledSegments[enabledSegments.length - 1]?.endMs ?? 0;
    },
    [enabledSegments]
  );

  // Map original time to compressed time
  const mapOriginalToCompressed = useCallback(
    (originalMs: number): number | null => {
      let compressedMs = 0;
      for (const segment of enabledSegments) {
        if (originalMs >= segment.startMs && originalMs <= segment.endMs) {
          return compressedMs + (originalMs - segment.startMs);
        }
        if (originalMs > segment.endMs) {
          compressedMs += segment.endMs - segment.startMs;
        }
      }
      return null;
    },
    [enabledSegments]
  );

  // Effective duration and playhead based on view mode
  const effectiveDurationMs = compressedView ? compressedDurationMs : durationMs;
  const effectivePlayheadMs = compressedView
    ? (mapOriginalToCompressed(currentTimeMs) ?? 0)
    : currentTimeMs;

  // Store actions
  const {
    setZoomLevel,
    scrollTo,
    zoomIn,
    zoomOut,
    fitToView,
    select,
    resizeSegment,
    toggleSegment,
    addSegment,
  } = useTimelineActions();

  // Measure container width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Calculate waveform display data based on viewport
  const waveformDisplayData = useMemo(() => {
    if (!waveformRawData) return null;

    const pxPerMs = (100 * zoomLevel) / 1000;
    const visibleDurationMs = containerWidth / pxPerMs;
    const startMs = Math.max(0, viewportStartMs);
    const endMs = Math.min(durationMs, viewportStartMs + visibleDurationMs);

    // Calculate sample indices
    const samplesPerMs = waveformRawData.sampleRate / 1000;
    const startSample = Math.floor(startMs * samplesPerMs);
    const endSample = Math.min(
      waveformRawData.samples.length,
      Math.ceil(endMs * samplesPerMs)
    );

    // Extract visible samples
    const visibleSamples = waveformRawData.samples.slice(startSample, endSample);

    // Downsample to fit container width
    const targetPoints = Math.max(100, Math.min(containerWidth, visibleSamples.length));
    if (visibleSamples.length <= targetPoints) {
      return visibleSamples;
    }

    // Simple downsample
    const step = visibleSamples.length / targetPoints;
    const result: number[] = [];
    for (let i = 0; i < targetPoints; i++) {
      const idx = Math.floor(i * step);
      result.push(visibleSamples[idx]);
    }
    return result;
  }, [waveformRawData, zoomLevel, viewportStartMs, durationMs, containerWidth]);

  // Handle horizontal scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom with ctrl/cmd + scroll
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.8 : 1.25;
        const newZoom = Math.max(0.1, Math.min(10, zoomLevel * delta));
        setZoomLevel(newZoom);
      } else {
        // Pan horizontally
        const pxPerMs = (100 * zoomLevel) / 1000;
        const deltaMs = e.deltaX / pxPerMs;
        const newStart = Math.max(0, viewportStartMs + deltaMs);
        scrollTo(newStart);
      }
    },
    [zoomLevel, viewportStartMs, setZoomLevel, scrollTo]
  );

  // Handle seek from ruler click
  const handleRulerSeek = useCallback(
    (ms: number) => {
      onSeek(Math.max(0, Math.min(durationMs, ms)));
    },
    [onSeek, durationMs]
  );

  // Auto-scroll to keep playhead visible
  useEffect(() => {
    const pxPerMs = (100 * zoomLevel) / 1000;
    const visibleDurationMs = containerWidth / pxPerMs;
    const playheadRelative = currentTimeMs - viewportStartMs;

    // If playhead is outside visible range, scroll to it
    if (playheadRelative < 0 || playheadRelative > visibleDurationMs) {
      scrollTo(Math.max(0, currentTimeMs - visibleDurationMs * 0.2));
    }
  }, [currentTimeMs, zoomLevel, viewportStartMs, containerWidth, scrollTo]);

  const handleFitToView = useCallback(() => {
    fitToView(durationMs);
  }, [fitToView, durationMs]);

  const handleResizeSegment = useCallback(
    (id: string, field: "startMs" | "endMs", value: number) => {
      resizeSegment(videoId, id, field, value);
    },
    [videoId, resizeSegment]
  );

  const handleToggleSegment = useCallback(
    (id: string) => {
      toggleSegment(videoId, id);
    },
    [videoId, toggleSegment]
  );

  const handleAddSegment = useCallback(
    (startMs: number, endMs: number) => {
      addSegment(videoId, startMs, endMs);
    },
    [videoId, addSegment]
  );

  // Viewport width for components
  const viewportWidthPx = containerWidth - 80; // Account for label column

  return (
    <div className={cn("flex flex-col border rounded-lg bg-background", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Timeline</span>
            <span className="text-xs text-muted-foreground">
              {segments.length} segmentos
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="compressed-view"
              checked={compressedView}
              onCheckedChange={(checked) => setCompressedView(checked === true)}
            />
            <Label htmlFor="compressed-view" className="text-xs cursor-pointer">
              Solo segmentos
            </Label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Slider
            value={[zoomLevel]}
            min={0.1}
            max={5}
            step={0.1}
            className="w-24"
            onValueChange={([value]) => setZoomLevel(value)}
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleFitToView}>
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Timeline content */}
      <div
        ref={containerRef}
        className="relative overflow-hidden select-none"
        onWheel={handleWheel}
      >
        {/* Ruler */}
        <TimelineRuler
          durationMs={effectiveDurationMs}
          zoomLevel={zoomLevel}
          viewportStartMs={viewportStartMs}
          viewportWidthPx={viewportWidthPx}
          onSeek={(ms) => {
            if (compressedView) {
              handleRulerSeek(mapCompressedToOriginal(ms));
            } else {
              handleRulerSeek(ms);
            }
          }}
        />

        {/* Waveform track */}
        <div className="flex border-b border-border">
          <div className="w-20 shrink-0 bg-muted/30 border-r border-border flex items-center justify-center">
            <span className="text-xs text-muted-foreground">Audio</span>
          </div>
          <div className="flex-1 h-16 relative bg-muted/10">
            {waveformLoading ? (
              <WaveformPlaceholder width={viewportWidthPx} height={64} />
            ) : waveformDisplayData ? (
              <Waveform
                data={waveformDisplayData}
                width={viewportWidthPx}
                height={64}
                color="rgb(74, 222, 128)"
                style="mirror"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Sin waveform
              </div>
            )}
          </div>
        </div>

        {/* Segment track - hidden in compressed view since we show concatenated */}
        {!compressedView && (
          <SegmentTrack
            segments={segments}
            silences={silences}
            zoomLevel={zoomLevel}
            viewportStartMs={viewportStartMs}
            durationMs={durationMs}
            selection={selection}
            onSelect={select}
            onResizeSegment={handleResizeSegment}
            onToggleSegment={handleToggleSegment}
            onAddSegment={handleAddSegment}
          />
        )}

        {/* Compressed segment view */}
        {compressedView && (
          <div className="flex border-b border-border">
            <div className="w-20 shrink-0 bg-muted/30 border-r border-border flex items-center justify-center">
              <span className="text-xs text-muted-foreground">Segmentos</span>
            </div>
            <div className="flex-1 h-12 relative bg-green-50 dark:bg-green-950/20">
              {/* Compressed segments as continuous blocks */}
              {enabledSegments.map((segment, i) => {
                const segmentDuration = segment.endMs - segment.startMs;
                let offset = 0;
                for (let j = 0; j < i; j++) {
                  offset += enabledSegments[j].endMs - enabledSegments[j].startMs;
                }
                const pxPerMs = (100 * zoomLevel) / 1000;
                const x = (offset - viewportStartMs) * pxPerMs;
                const width = segmentDuration * pxPerMs;

                return (
                  <div
                    key={segment.id}
                    className="absolute top-1 bottom-1 bg-green-500/60 border border-green-600/40 rounded"
                    style={{
                      left: Math.max(0, x),
                      width: Math.max(width, 2),
                    }}
                  >
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] text-green-900 dark:text-green-100 font-medium overflow-hidden">
                      {width > 30 && `#${i + 1}`}
                    </span>
                  </div>
                );
              })}
              <div className="absolute bottom-0 right-2 text-[10px] text-muted-foreground bg-background/80 px-1 rounded">
                {formatDurationMs(compressedDurationMs)} final
              </div>
            </div>
          </div>
        )}

        {/* Playhead */}
        <TimelinePlayhead
          playheadMs={effectivePlayheadMs}
          zoomLevel={zoomLevel}
          viewportStartMs={viewportStartMs}
        />
      </div>
    </div>
  );
}

function formatDurationMs(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
