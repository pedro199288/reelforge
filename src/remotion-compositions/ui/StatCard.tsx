import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS } from "./colors";
import { clamp01, secondsToFrames } from "./utils";

export type StatCardProps = {
  /** Valor principal a mostrar */
  readonly value: string | number;
  /** Etiqueta/título de la estadística */
  readonly label: string;
  /** Subtítulo o unidad (opcional) */
  readonly unit?: string;
  /** Color del acento */
  readonly color?: string;
  /** Icono o emoji (opcional) */
  readonly icon?: string;
  /** Delay de entrada en frames */
  readonly delay?: number;
  /** Animar el valor como contador */
  readonly animateValue?: boolean;
  /** Valor inicial para animación de contador */
  readonly fromValue?: number;
};

export const StatCard: React.FC<StatCardProps> = ({
  value,
  label,
  unit,
  color = COLORS.accent,
  icon,
  delay = 0,
  animateValue = false,
  fromValue = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = Math.max(0, frame - delay);

  // Animación de entrada
  const enterAnim = spring({
    frame: localFrame,
    fps,
    config: { damping: 18, mass: 0.7, stiffness: 140 },
    durationInFrames: secondsToFrames(0.7, fps),
  });

  const y = interpolate(enterAnim, [0, 1], [20, 0]);
  const opacity = interpolate(enterAnim, [0, 1], [0, 1]);
  const scale = interpolate(enterAnim, [0, 1], [0.95, 1]);

  // Animación de contador
  const counterProgress = clamp01(localFrame / secondsToFrames(1.2, fps));
  const eased = interpolate(counterProgress, [0, 1], [0, 1], {
    easing: Easing.out(Easing.cubic),
  });

  const displayValue =
    animateValue && typeof value === "number"
      ? Math.round(fromValue + (value - fromValue) * eased)
      : value;

  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.panelBorder}`,
        borderRadius: 22,
        padding: "24px 28px",
        backdropFilter: "blur(10px)",
        opacity,
        transform: `translateY(${y}px) scale(${scale})`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 180,
      }}
    >
      {/* Header con icono y label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {icon && (
          <span style={{ fontSize: 24 }}>{icon}</span>
        )}
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: COLORS.faint,
            letterSpacing: 0.8,
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      </div>

      {/* Valor principal */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 48,
            fontWeight: 950,
            color,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {displayValue}
        </span>
        {unit && (
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: COLORS.muted,
            }}
          >
            {unit}
          </span>
        )}
      </div>

      {/* Línea decorativa */}
      <div
        style={{
          width: `${enterAnim * 100}%`,
          height: 3,
          borderRadius: 999,
          background: color,
          opacity: 0.6,
          marginTop: 4,
        }}
      />
    </div>
  );
};

/**
 * Grid de StatCards para mostrar múltiples estadísticas
 */
export type StatCardGridProps = {
  readonly stats: Array<Omit<StatCardProps, "delay">>;
  /** Delay entre cards en frames */
  readonly staggerDelay?: number;
};

export const StatCardGrid: React.FC<StatCardGridProps> = ({
  stats,
  staggerDelay = 6,
}) => {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(stats.length, 2)}, 1fr)`,
        gap: 16,
      }}
    >
      {stats.map((stat, i) => (
        <StatCard key={stat.label} {...stat} delay={i * staggerDelay} />
      ))}
    </div>
  );
};

/**
 * Composición standalone para preview/demo
 */
export const StatCardDemo: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        padding: 56,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        justifyContent: "center",
      }}
    >
      <StatCardGrid
        stats={[
          {
            value: 2450,
            label: "Calorías",
            unit: "kcal",
            color: COLORS.warning,
            icon: "🔥",
            animateValue: true,
          },
          {
            value: 185,
            label: "Proteína",
            unit: "g",
            color: COLORS.accent2,
            icon: "💪",
            animateValue: true,
          },
          {
            value: 72,
            label: "Frecuencia Cardíaca",
            unit: "bpm",
            color: COLORS.danger,
            icon: "❤️",
            animateValue: true,
            fromValue: 60,
          },
          {
            value: "7.5",
            label: "Horas de Sueño",
            unit: "h",
            color: COLORS.cyan,
            icon: "😴",
          },
        ]}
        staggerDelay={8}
      />
    </AbsoluteFill>
  );
};
