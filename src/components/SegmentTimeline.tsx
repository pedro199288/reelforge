import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ZoomIn, ZoomOut, Maximize2, Crosshair, Film } from "lucide-react";
import { cn } from "@/lib/utils";
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
  /** When true, force full timeline view (continuous playback mode) */
  continuousPlay?: boolean;
}

export function SegmentTimeline({
  videoId,
  videoPath,
  durationMs,
  currentTimeMs,
  onSeek,
  className,
  enablePlayheadTransition = false,
  continuousPlay = false,
}: SegmentTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [showFullTimeline, setShowFullTimeline] = useState(true);
  const [trackExpanded, setTrackExpanded] = useState(true);
  const fullTimelineBeforeContinuousRef = useRef(true);
  const prevContinuousPlayRef = useRef(continuousPlay);
  const prevShowFullTimelineRef = useRef(showFullTimeline);
  const hasInitializedFitRef = useRef(false);
  // Follow-playhead toggle: state for UI, ref for RAF loop
  const [followPlayhead, setFollowPlayhead] = useState(true);
  const followPlayheadRef = useRef(true);
  // Ref for RAF-based auto-scroll (updated every frame, read outside React cycle)
  const playheadMsRef = useRef(currentTimeMs);
  const autoScrollRafRef = useRef<number | null>(null);

  // Waveform data
  const { rawData: waveformRawData } = useWaveform(
    videoPath,
    { samplesPerSecond: 200, videoDurationSec: durationMs / 1000 }
  );

  // Store state
  const zoomLevel = useTimelineZoomLevel();
  const viewportStartMs = useViewportStart();
  const selection = useTimelineSelection();
  const segments = useVideoSegments(videoId);
  const silences = useVideoSilences(videoId);

  // All segments sorted for contiguous layout (uses ALL segments, not just enabled)
  const allSortedSegments = useMemo(
    () => [...segments].sort((a, b) => a.startMs - b.startMs),
    [segments]
  );

  // Contiguous duration: sum of all segment durations (no gaps)
  const contiguousDurationMs = useMemo(
    () => allSortedSegments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0),
    [allSortedSegments]
  );

  // Map contiguous time to original time
  const mapContiguousToOriginal = useCallback(
    (contiguousMs: number): number => {
      let accumulated = 0;
      for (const segment of allSortedSegments) {
        const segmentDuration = segment.endMs - segment.startMs;
        if (contiguousMs < accumulated + segmentDuration) {
          return segment.startMs + (contiguousMs - accumulated);
        }
        accumulated += segmentDuration;
      }
      return allSortedSegments[allSortedSegments.length - 1]?.endMs ?? 0;
    },
    [allSortedSegments]
  );

  // Map original time to contiguous time
  const mapOriginalToContiguous = useCallback(
    (originalMs: number): number => {
      if (allSortedSegments.length === 0) return 0;

      let contiguousMs = 0;
      for (let i = 0; i < allSortedSegments.length; i++) {
        const segment = allSortedSegments[i];

        // Before first segment: show at start
        if (i === 0 && originalMs < segment.startMs) {
          return 0;
        }

        // Inside this segment: interpolate position
        if (originalMs >= segment.startMs && originalMs <= segment.endMs) {
          return contiguousMs + (originalMs - segment.startMs);
        }

        // After this segment
        const segmentDuration = segment.endMs - segment.startMs;

        // Check if we're in the gap between this segment and the next
        const nextSegment = allSortedSegments[i + 1];
        if (nextSegment && originalMs > segment.endMs && originalMs < nextSegment.startMs) {
          // In a gap: stick to end of previous segment
          return contiguousMs + segmentDuration;
        }

        contiguousMs += segmentDuration;
      }

      // After all segments: show at end
      return contiguousDurationMs;
    },
    [allSortedSegments, contiguousDurationMs]
  );

  // Determine view mode
  const isContiguous = !showFullTimeline;

  // Effective duration and playhead based on view mode
  const effectiveDurationMs = isContiguous ? contiguousDurationMs : durationMs;
  const effectivePlayheadMs = isContiguous
    ? mapOriginalToContiguous(currentTimeMs)
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

  // Sync showFullTimeline with continuousPlay toggle
  useEffect(() => {
    const wasContinuous = prevContinuousPlayRef.current;
    prevContinuousPlayRef.current = continuousPlay;

    if (continuousPlay && !wasContinuous) {
      // Turning on: save current state and force full timeline
      fullTimelineBeforeContinuousRef.current = showFullTimeline;
      if (!showFullTimeline) setShowFullTimeline(true);
    } else if (!continuousPlay && wasContinuous) {
      // Turning off: restore previous state
      if (!fullTimelineBeforeContinuousRef.current) setShowFullTimeline(false);
    }
  }, [continuousPlay, showFullTimeline]);

  // Auto-fit to view on initial mount when we have container width and duration
  // Uses effectiveDurationMs so contiguous mode (default) fills the viewport correctly
  useEffect(() => {
    if (!hasInitializedFitRef.current && containerWidth > 0 && effectiveDurationMs > 0) {
      hasInitializedFitRef.current = true;
      const viewportWidth = containerWidth - LABEL_COLUMN_WIDTH;
      if (viewportWidth > 0) {
        fitToView(effectiveDurationMs, viewportWidth);
      }
    }
  }, [containerWidth, effectiveDurationMs, fitToView]);

  // Sync viewport when switching between contiguous and full timeline view
  useEffect(() => {
    const wasFullTimeline = prevShowFullTimelineRef.current;
    prevShowFullTimelineRef.current = showFullTimeline;

    // Only adjust on actual change
    if (wasFullTimeline === showFullTimeline) return;

    if (!showFullTimeline) {
      // Switching to contiguous: map viewport position from original to contiguous
      const newViewportStart = mapOriginalToContiguous(viewportStartMs);
      scrollTo(Math.max(0, newViewportStart));
    } else {
      // Switching to full: map viewport position from contiguous to original
      const newViewportStart = mapContiguousToOriginal(viewportStartMs);
      scrollTo(Math.max(0, newViewportStart));
    }
  }, [showFullTimeline, viewportStartMs, mapOriginalToContiguous, mapContiguousToOriginal, scrollTo]);

  // Viewport width for waveform/component calculations (exclude label column)
  const viewportWidthPx = Math.max(0, containerWidth - LABEL_COLUMN_WIDTH);

  // Calculate waveform display data based on viewport
  const waveformDisplayData = useMemo(() => {
    if (!waveformRawData || viewportWidthPx <= 0) return null;

    const pxPerMs = getPxPerMs(zoomLevel);
    const visibleDurationMs = viewportWidthPx / pxPerMs;
    const startMs = Math.max(0, viewportStartMs);
    const endMs = Math.min(durationMs, viewportStartMs + visibleDurationMs);

    // Safety net: scale samplesPerMs if waveform duration doesn't match video duration
    const waveformDurationMs = (waveformRawData.samples.length / waveformRawData.sampleRate) * 1000;
    let samplesPerMs = waveformRawData.sampleRate / 1000;
    if (durationMs > 0 && Math.abs(waveformDurationMs - durationMs) > 50) {
      const ratio = waveformDurationMs / durationMs;
      samplesPerMs *= ratio;
      console.warn(
        `[Waveform] duration mismatch: waveform=${waveformDurationMs.toFixed(0)}ms video=${durationMs.toFixed(0)}ms ratio=${ratio.toFixed(4)}`
      );
    }

    // Calculate sample indices
    const startSample = Math.floor(startMs * samplesPerMs);
    const endSample = Math.min(
      waveformRawData.samples.length,
      Math.ceil(endMs * samplesPerMs)
    );

    // Extract visible samples
    const visibleSamples = waveformRawData.samples.slice(startSample, endSample);

    // Downsample to fit actual content width (may be smaller than viewport when zoomed out)
    const actualWidthPx = Math.round((endMs - startMs) * pxPerMs);
    const targetPoints = Math.max(100, Math.min(actualWidthPx, visibleSamples.length));
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
  }, [waveformRawData, zoomLevel, viewportStartMs, durationMs, viewportWidthPx]);

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
  // Single native wheel handler: preventDefault (needs passive:false) + zoom/pan logic.
  // React onWheel can't call preventDefault on passive listeners, so everything
  // lives in one native handler that reads latest state from the store directly.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const { zoomLevel: currentZoom, viewportStartMs: currentViewport } =
        useTimelineStore.getState();

      if (e.deltaX !== 0 && !e.ctrlKey && !e.metaKey) {
        // Pan horizontally (trackpad or shift+wheel)
        const pxPerMs = getPxPerMs(currentZoom);
        const deltaMs = e.deltaX / pxPerMs;
        const newStart = Math.max(0, currentViewport + deltaMs);
        useTimelineStore.getState().scrollTo(newStart);
        setFollowPlayhead(false);
      } else if (e.deltaY !== 0) {
        // Vertical scroll → zoom
        const delta = e.deltaY > 0 ? 0.8 : 1.25;
        const newZoom = Math.max(
          MIN_ZOOM_LEVEL,
          Math.min(MAX_ZOOM_LEVEL, currentZoom * delta)
        );
        useTimelineStore.getState().setZoomLevel(newZoom);
        setFollowPlayhead(false);
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

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

  // Sync followPlayhead ref with state (ref is read in RAF loop)
  useEffect(() => {
    followPlayheadRef.current = followPlayhead;
  }, [followPlayhead]);

  // RAF-based auto-scroll - runs outside React render cycle for smooth tracking
  useEffect(() => {
    const tick = () => {
      // Skip if follow-playhead is disabled
      if (followPlayheadRef.current) {
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

  // Toggle follow-playhead mode; when enabling, center viewport on playhead
  const handleToggleFollowPlayhead = useCallback(() => {
    setFollowPlayhead((prev) => {
      if (!prev) {
        // Re-enabling: center viewport on playhead
        const pxPerMs = getPxPerMs(zoomLevel);
        const visibleDurationMs = containerWidth / pxPerMs;
        const newViewportStart = effectivePlayheadMs - visibleDurationMs / 2;
        scrollTo(Math.max(0, newViewportStart));
      }
      return !prev;
    });
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

  // --- Scrollbar calculations ---
  const totalContentPx = effectiveDurationMs * getPxPerMs(zoomLevel);
  const thumbRatio = totalContentPx > 0 ? Math.min(1, viewportWidthPx / totalContentPx) : 1;
  const thumbLeft = effectiveDurationMs > 0 ? viewportStartMs / effectiveDurationMs : 0;
  const showScrollbar = thumbRatio < 1;

  const scrollbarRef = useRef<HTMLDivElement>(null);
  const isDraggingScrollbar = useRef(false);
  const dragStartX = useRef(0);
  const dragStartViewport = useRef(0);

  const handleScrollbarPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const bar = scrollbarRef.current;
      if (!bar) return;

      const rect = bar.getBoundingClientRect();
      const clickRatio = (e.clientX - rect.left) / rect.width;

      // If clicking on the thumb, start dragging
      const thumbStart = thumbLeft;
      const thumbEnd = thumbLeft + thumbRatio;
      if (clickRatio >= thumbStart && clickRatio <= thumbEnd) {
        isDraggingScrollbar.current = true;
        dragStartX.current = e.clientX;
        dragStartViewport.current = viewportStartMs;
        bar.setPointerCapture(e.pointerId);
        setFollowPlayhead(false);
      } else {
        // Click on track: jump so the thumb centers on click position
        const targetRatio = Math.max(0, Math.min(1 - thumbRatio, clickRatio - thumbRatio / 2));
        scrollTo(targetRatio * effectiveDurationMs);
        setFollowPlayhead(false);
      }
    },
    [thumbLeft, thumbRatio, viewportStartMs, effectiveDurationMs, scrollTo]
  );

  const handleScrollbarPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingScrollbar.current) return;
      const bar = scrollbarRef.current;
      if (!bar) return;

      const rect = bar.getBoundingClientRect();
      const deltaRatio = (e.clientX - dragStartX.current) / rect.width;
      const newViewport = dragStartViewport.current + deltaRatio * effectiveDurationMs;
      scrollTo(Math.max(0, Math.min(effectiveDurationMs * (1 - thumbRatio), newViewport)));
    },
    [effectiveDurationMs, thumbRatio, scrollTo]
  );

  const handleScrollbarPointerUp = useCallback(() => {
    isDraggingScrollbar.current = false;
  }, []);

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

        </div>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Alejar zoom</TooltipContent>
          </Tooltip>
          <Slider
            value={[zoomLevel]}
            min={0.01}
            max={5}
            step={0.01}
            className="w-24"
            onValueChange={([value]) => setZoomLevel(value)}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Acercar zoom</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleFitToView}>
                <Maximize2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ajustar a la vista</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={followPlayhead ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={handleToggleFollowPlayhead}
              >
                <Crosshair className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{followPlayhead ? "Dejar de seguir playhead" : "Seguir playhead"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showFullTimeline ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowFullTimeline(v => !v)}
              >
                <Film className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{showFullTimeline ? "Vista contigua (sin huecos)" : "Timeline completo"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={trackExpanded ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7 text-xs font-bold"
                onClick={() => setTrackExpanded(v => !v)}
              >
                2x
              </Button>
            </TooltipTrigger>
            <TooltipContent>{trackExpanded ? "Altura normal" : "Duplicar altura del track"}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Timeline content */}
      <div
        ref={containerRef}
        className="relative overflow-hidden select-none overscroll-contain touch-none"
      >
        {/* Ruler */}
        <TimelineRuler
          durationMs={effectiveDurationMs}
          zoomLevel={zoomLevel}
          viewportStartMs={viewportStartMs}
          viewportWidthPx={viewportWidthPx}
          onSeek={(ms) => {
            if (isContiguous) {
              handleRulerSeek(mapContiguousToOriginal(ms));
            } else {
              handleRulerSeek(ms);
            }
          }}
        />

        {/* Segment track - always visible, contiguous by default */}
        <SegmentTrack
          segments={segments}
          silences={silences}
          zoomLevel={zoomLevel}
          viewportStartMs={viewportStartMs}
          durationMs={effectiveDurationMs}
          selection={selection}
          onSelect={select}
          onResizeSegment={handleResizeSegment}
          onToggleSegment={handleToggleSegment}
          onAddSegment={isContiguous ? undefined : handleAddSegment}
          contiguous={isContiguous}
          waveformRawData={waveformRawData}
          viewportWaveformData={waveformDisplayData}
          viewportWidthPx={viewportWidthPx}
          waveformOffsetPx={waveformOffsetPx}
          expanded={trackExpanded}
        />

        {/* Playhead */}
        <TimelinePlayhead
          playheadMs={effectivePlayheadMs}
          zoomLevel={zoomLevel}
          viewportStartMs={viewportStartMs}
          enableTransition={enablePlayheadTransition}
        />
      </div>

      {/* Horizontal scrollbar */}
      {showScrollbar && (
        <div
          ref={scrollbarRef}
          className="h-3 bg-muted/40 border-t cursor-pointer flex-shrink-0"
          onPointerDown={handleScrollbarPointerDown}
          onPointerMove={handleScrollbarPointerMove}
          onPointerUp={handleScrollbarPointerUp}
          onPointerCancel={handleScrollbarPointerUp}
        >
          <div
            className="h-full bg-muted-foreground/25 hover:bg-muted-foreground/40 rounded-full transition-colors"
            style={{
              marginLeft: `${thumbLeft * 100}%`,
              width: `${thumbRatio * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
