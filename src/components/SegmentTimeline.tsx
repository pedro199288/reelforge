import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ZoomIn, ZoomOut, Maximize2, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import { Waveform, WaveformPlaceholder } from "@/components/Timeline/Waveform";
import { TimelineRuler } from "@/components/Timeline/TimelineRuler";
import { TimelinePlayhead } from "@/components/Timeline/TimelinePlayhead";
import { SegmentTrack } from "@/components/Timeline/SegmentTrack";
import { LABEL_COLUMN_WIDTH, getPxPerMs } from "@/components/Timeline/constants";
import { useWaveform } from "@/hooks/useWaveform";
import {
  useVideoSegments,
  useVideoSilences,
  useTimelineActions,
  useTimelineZoomLevel,
  useViewportStart,
  useTimelineSelection,
  useTimelineStore,
  MIN_ZOOM_LEVEL,
  MAX_ZOOM_LEVEL,
} from "@/store/timeline";

interface SegmentTimelineProps {
  videoId: string;
  videoPath: string;
  durationMs: number;
  currentTimeMs: number;
  onSeek: (ms: number) => void;
  className?: string;
  /** Enable smooth CSS transitions on playhead (during playback) */
  enablePlayheadTransition?: boolean;
}

export function SegmentTimeline({
  videoId,
  videoPath,
  durationMs,
  currentTimeMs,
  onSeek,
  className,
  enablePlayheadTransition = false,
}: SegmentTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [compressedView, setCompressedView] = useState(false);
  const prevCompressedViewRef = useRef(compressedView);
  const hasInitializedFitRef = useRef(false);
  // Track user scroll interaction to disable auto-scroll until center button is clicked
  const userScrolledRef = useRef(false);
  // Ref for RAF-based auto-scroll (updated every frame, read outside React cycle)
  const playheadMsRef = useRef(currentTimeMs);
  const autoScrollRafRef = useRef<number | null>(null);

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
  // Returns the compressed position, or the edge of the nearest segment if in a gap
  const mapOriginalToCompressed = useCallback(
    (originalMs: number): number => {
      if (enabledSegments.length === 0) return 0;

      let compressedMs = 0;
      for (let i = 0; i < enabledSegments.length; i++) {
        const segment = enabledSegments[i];

        // Before first segment: show at start
        if (i === 0 && originalMs < segment.startMs) {
          return 0;
        }

        // Inside this segment: interpolate position
        if (originalMs >= segment.startMs && originalMs <= segment.endMs) {
          return compressedMs + (originalMs - segment.startMs);
        }

        // After this segment
        const segmentDuration = segment.endMs - segment.startMs;

        // Check if we're in the gap between this segment and the next
        const nextSegment = enabledSegments[i + 1];
        if (nextSegment && originalMs > segment.endMs && originalMs < nextSegment.startMs) {
          // In a gap: stick to end of previous segment
          return compressedMs + segmentDuration;
        }

        compressedMs += segmentDuration;
      }

      // After all segments: show at end
      return compressedDurationMs;
    },
    [enabledSegments, compressedDurationMs]
  );

  // Effective duration and playhead based on view mode
  const effectiveDurationMs = compressedView ? compressedDurationMs : durationMs;
  const effectivePlayheadMs = compressedView
    ? mapOriginalToCompressed(currentTimeMs)
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

  // Auto-fit to view on initial mount when we have container width and duration
  useEffect(() => {
    if (!hasInitializedFitRef.current && containerWidth > 0 && durationMs > 0) {
      hasInitializedFitRef.current = true;
      // Calculate viewport width (container minus label column)
      const viewportWidth = containerWidth - LABEL_COLUMN_WIDTH;
      if (viewportWidth > 0) {
        fitToView(durationMs, viewportWidth);
      }
    }
  }, [containerWidth, durationMs, fitToView]);

  // Sync viewport when switching between full and compressed view
  useEffect(() => {
    const wasCompressed = prevCompressedViewRef.current;
    prevCompressedViewRef.current = compressedView;

    // Only adjust on actual change
    if (wasCompressed === compressedView) return;

    if (compressedView) {
      // Switching to compressed: map viewport position from original to compressed
      const newViewportStart = mapOriginalToCompressed(viewportStartMs);
      scrollTo(Math.max(0, newViewportStart));
    } else {
      // Switching to full: map viewport position from compressed to original
      const newViewportStart = mapCompressedToOriginal(viewportStartMs);
      scrollTo(Math.max(0, newViewportStart));
    }
  }, [compressedView, viewportStartMs, mapOriginalToCompressed, mapCompressedToOriginal, scrollTo]);

  // Calculate waveform display data based on viewport
  const waveformDisplayData = useMemo(() => {
    if (!waveformRawData) return null;

    const pxPerMs = getPxPerMs(zoomLevel);
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

  // Calculate waveform offset for sub-sample alignment
  const waveformOffsetPx = useMemo(() => {
    if (!waveformRawData) return 0;

    const pxPerMs = getPxPerMs(zoomLevel);
    const samplesPerMs = waveformRawData.sampleRate / 1000;
    const startMs = Math.max(0, viewportStartMs);
    const startSample = Math.floor(startMs * samplesPerMs);
    const actualStartMs = startSample / samplesPerMs;
    const offsetMs = startMs - actualStartMs;

    return offsetMs * pxPerMs;
  }, [waveformRawData, zoomLevel, viewportStartMs]);

  // Handle horizontal scroll - mark user interaction to disable auto-scroll
  // Mark that user has scrolled manually - disables auto-scroll until they click center button
  const markUserScrolled = useCallback(() => {
    userScrolledRef.current = true;
  }, []);

  // Native wheel handler for proper preventDefault with passive: false
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Prevent browser zoom/scroll when using ctrl+wheel for timeline zoom
        e.preventDefault();
      }
    };

    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleNativeWheel);
  }, []);

  // React wheel handler for state updates
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom with ctrl/cmd + scroll
        const delta = e.deltaY > 0 ? 0.8 : 1.25;
        const newZoom = Math.max(MIN_ZOOM_LEVEL, Math.min(MAX_ZOOM_LEVEL, zoomLevel * delta));
        setZoomLevel(newZoom);
        markUserScrolled();
      } else if (e.deltaX !== 0) {
        // Pan horizontally (trackpad or shift+wheel)
        const pxPerMs = getPxPerMs(zoomLevel);
        const deltaMs = e.deltaX / pxPerMs;
        const newStart = Math.max(0, viewportStartMs + deltaMs);
        scrollTo(newStart);
        markUserScrolled();
      }
    },
    [zoomLevel, viewportStartMs, setZoomLevel, scrollTo, markUserScrolled]
  );

  // Handle seek from ruler click
  const handleRulerSeek = useCallback(
    (ms: number) => {
      onSeek(Math.max(0, Math.min(durationMs, ms)));
    },
    [onSeek, durationMs]
  );

  // Keep playhead ref in sync (for RAF-based auto-scroll)
  useEffect(() => {
    playheadMsRef.current = effectivePlayheadMs;
  }, [effectivePlayheadMs]);

  // RAF-based auto-scroll - runs outside React render cycle for smooth tracking
  useEffect(() => {
    const tick = () => {
      // Skip if user has manually scrolled
      if (!userScrolledRef.current) {
        // Read current values directly from store and refs (no React state dependency)
        const { zoomLevel: currentZoom, viewportStartMs: currentViewport } =
          useTimelineStore.getState();
        const playheadMs = playheadMsRef.current;

        const pxPerMs = getPxPerMs(currentZoom);
        const visibleDurationMs = containerWidth / pxPerMs;
        const playheadRelative = playheadMs - currentViewport;

        // If playhead is outside visible range (with some margin), scroll to keep it visible
        const margin = visibleDurationMs * 0.1; // 10% margin
        if (playheadRelative < margin || playheadRelative > visibleDurationMs - margin) {
          // Scroll to put playhead at 20% from the left edge
          const targetViewport = Math.max(0, playheadMs - visibleDurationMs * 0.2);
          useTimelineStore.getState().scrollTo(targetViewport);
        }
      }

      autoScrollRafRef.current = requestAnimationFrame(tick);
    };

    autoScrollRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (autoScrollRafRef.current !== null) {
        cancelAnimationFrame(autoScrollRafRef.current);
      }
    };
  }, [containerWidth]); // Only depends on containerWidth which rarely changes

  const handleFitToView = useCallback(() => {
    const viewportWidth = containerWidth - LABEL_COLUMN_WIDTH;
    // Use effective duration (compressed or full) for proper fit
    fitToView(effectiveDurationMs, viewportWidth > 0 ? viewportWidth : undefined);
  }, [fitToView, effectiveDurationMs, containerWidth]);

  // Center the viewport on the current playhead position and re-enable auto-scroll
  const handleCenterOnPlayhead = useCallback(() => {
    const pxPerMs = getPxPerMs(zoomLevel);
    const visibleDurationMs = containerWidth / pxPerMs;
    // Center the playhead in the middle of the viewport
    const newViewportStart = effectivePlayheadMs - visibleDurationMs / 2;
    scrollTo(Math.max(0, newViewportStart));
    // Re-enable auto-scroll
    userScrolledRef.current = false;
  }, [zoomLevel, containerWidth, effectivePlayheadMs, scrollTo]);

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

  // Viewport width for components (ensure non-negative while measuring)
  const viewportWidthPx = Math.max(0, containerWidth - LABEL_COLUMN_WIDTH);

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
            min={0.01}
            max={5}
            step={0.01}
            className="w-24"
            onValueChange={([value]) => setZoomLevel(value)}
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleFitToView} title="Ajustar a la vista">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCenterOnPlayhead} title="Centrar en playhead">
            <Crosshair className="h-4 w-4" />
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
                offsetPx={waveformOffsetPx}
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
                const pxPerMs = getPxPerMs(zoomLevel);
                const x = (offset - viewportStartMs) * pxPerMs;
                const width = segmentDuration * pxPerMs;

                // Skip rendering if completely outside viewport
                if (x + width < 0 || x > viewportWidthPx) return null;

                return (
                  <div
                    key={segment.id}
                    className="absolute top-1 bottom-1 bg-green-500/60 border border-green-600/40 rounded"
                    style={{
                      left: x,
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
          enableTransition={enablePlayheadTransition}
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
