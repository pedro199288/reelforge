import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS } from "./colors";
import { clamp01, secondsToFrames } from "./utils";

export type CountdownTimerProps = {
  /** Duración total del temporizador en segundos */
  readonly durationSeconds: number;
  /** Título a mostrar (ej: "DESCANSO", "SET 1") */
  readonly title?: string;
  /** Color del arco de progreso */
  readonly color?: string;
  /** Tamaño del componente (ancho y alto) */
  readonly size?: number;
  /** Mostrar milisegundos */
  readonly showMilliseconds?: boolean;
};

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  durationSeconds,
  title = "TIEMPO",
  color = COLORS.accent2,
  size = 400,
  showMilliseconds = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const totalFrames = secondsToFrames(durationSeconds, fps);
  const progress = clamp01(frame / totalFrames);
  const remainingSeconds = Math.max(0, durationSeconds - frame / fps);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = Math.floor(remainingSeconds % 60);
  const milliseconds = Math.floor((remainingSeconds % 1) * 100);

  const timeString = showMilliseconds
    ? `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}`
    : `${minutes}:${seconds.toString().padStart(2, "0")}`;

  // Entrada con spring
  const scaleIn = spring({
    frame,
    fps,
    config: { damping: 15, mass: 0.8, stiffness: 120 },
    durationInFrames: secondsToFrames(0.8, fps),
  });

  // Pulsación cuando queda poco tiempo (últimos 5 segundos)
  const isUrgent = remainingSeconds <= 5 && remainingSeconds > 0;
  const pulse = isUrgent
    ? interpolate(
        frame % Math.round(fps * 0.5),
        [0, Math.round(fps * 0.25), Math.round(fps * 0.5)],
        [1, 1.05, 1],
        { extrapolateRight: "clamp" },
      )
    : 1;

  // SVG círculo
  const strokeWidth = size * 0.04;
  const radius = (size - strokeWidth) / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * progress;

  const urgentColor = isUrgent ? COLORS.danger : color;

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        transform: `scale(${scaleIn * pulse})`,
      }}
    >
      {/* Fondo del círculo */}
      <svg
        width={size}
        height={size}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <defs>
          <filter id="timerGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.6 0"
            />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track de fondo */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />

        {/* Arco de progreso */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={urgentColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          filter="url(#timerGlow)"
          opacity={0.95}
        />
      </svg>

      {/* Contenido central */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: size * 0.06,
            fontWeight: 800,
            letterSpacing: 2,
            color: COLORS.faint,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: size * 0.22,
            fontWeight: 950,
            color: urgentColor,
            fontVariantNumeric: "tabular-nums",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          }}
        >
          {timeString}
        </div>
      </div>
    </div>
  );
};

/**
 * Composición standalone para preview/demo
 */
export const CountdownTimerDemo: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CountdownTimer
        durationSeconds={10}
        title="DESCANSO"
        color={COLORS.accent2}
        size={500}
      />
    </AbsoluteFill>
  );
};
