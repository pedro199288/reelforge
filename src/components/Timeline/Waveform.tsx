import { useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";

interface WaveformProps {
  /** Normalized amplitude values (-1 to 1 or 0 to 1) */
  data: number[];
  /** Height of the waveform in pixels */
  height: number;
  /** Width of the waveform in pixels */
  width: number;
  /** Color of the waveform bars/line */
  color?: string;
  /** Background color */
  bgColor?: string;
  /** Render style: bars or line */
  style?: "bars" | "line" | "mirror";
  /** CSS class */
  className?: string;
}

export function Waveform({
  data,
  height,
  width,
  color = "rgb(74, 222, 128)", // green-400
  bgColor = "transparent",
  style = "mirror",
  className,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Memoize the rendering to avoid unnecessary redraws
  const drawWaveform = useMemo(() => {
    return (ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      if (data.length === 0) return;

      const barWidth = width / data.length;
      const centerY = height / 2;

      ctx.fillStyle = color;

      if (style === "bars") {
        // Simple bars from bottom
        for (let i = 0; i < data.length; i++) {
          const amplitude = Math.abs(data[i]);
          const barHeight = amplitude * height;
          const x = i * barWidth;
          ctx.fillRect(x, height - barHeight, Math.max(1, barWidth - 1), barHeight);
        }
      } else if (style === "line") {
        // Line graph
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
          const x = i * barWidth;
          const y = centerY - data[i] * centerY;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      } else {
        // Mirror style (typical audio waveform)
        for (let i = 0; i < data.length; i++) {
          const amplitude = Math.abs(data[i]);
          const barHeight = amplitude * centerY;
          const x = i * barWidth;
          // Draw from center, mirrored
          ctx.fillRect(
            x,
            centerY - barHeight,
            Math.max(1, barWidth - 0.5),
            barHeight * 2
          );
        }
      }
    };
  }, [data, width, height, color, bgColor, style]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set actual size for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    drawWaveform(ctx);
  }, [drawWaveform, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("block", className)}
      style={{ width, height }}
    />
  );
}

/**
 * Placeholder waveform with animated loading effect
 */
export function WaveformPlaceholder({
  width,
  height,
  className,
}: {
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-muted/50 animate-pulse rounded-sm",
        className
      )}
      style={{ width, height }}
    />
  );
}
