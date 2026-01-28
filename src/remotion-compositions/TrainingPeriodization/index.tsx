import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, clamp01, secondsToFrames } from "../ui";

type Mesocycle = {
  readonly id: string;
  readonly name: string;
  readonly weeks: number;
  readonly focus: string;
  readonly intensity: "low" | "moderate" | "high" | "peak" | "recovery";
  readonly volume: "low" | "moderate" | "high";
  readonly color: string;
};

export type TrainingPeriodizationProps = {
  readonly language?: "es" | "en";
};

const MESOCYCLES: Mesocycle[] = [
  {
    id: "anatomical-adaptation",
    name: "Adaptación Anatómica",
    weeks: 4,
    focus: "Preparar tejidos, técnica, base aeróbica",
    intensity: "low",
    volume: "moderate",
    color: COLORS.cyan,
  },
  {
    id: "hypertrophy",
    name: "Hipertrofia",
    weeks: 6,
    focus: "Aumentar masa muscular, volumen alto",
    intensity: "moderate",
    volume: "high",
    color: COLORS.accent,
  },
  {
    id: "strength",
    name: "Fuerza Máxima",
    weeks: 4,
    focus: "Reclutar más unidades motoras",
    intensity: "high",
    volume: "moderate",
    color: COLORS.warning,
  },
  {
    id: "power",
    name: "Potencia",
    weeks: 3,
    focus: "Velocidad + fuerza, movimientos explosivos",
    intensity: "peak",
    volume: "low",
    color: COLORS.danger,
  },
  {
    id: "peaking",
    name: "Pico / Competición",
    weeks: 2,
    focus: "Máximo rendimiento, volumen mínimo",
    intensity: "peak",
    volume: "low",
    color: COLORS.accent2,
  },
  {
    id: "recovery",
    name: "Recuperación Activa",
    weeks: 2,
    focus: "Descanso, regeneración, deload",
    intensity: "recovery",
    volume: "low",
    color: COLORS.muted,
  },
];

const intensityToHeight: Record<Mesocycle["intensity"], number> = {
  recovery: 0.15,
  low: 0.3,
  moderate: 0.5,
  high: 0.7,
  peak: 0.9,
};

const volumeToOpacity: Record<Mesocycle["volume"], number> = {
  low: 0.5,
  moderate: 0.7,
  high: 0.9,
};

const TimelineDiagram: React.FC<{
  readonly progress: number;
  readonly activeIndex: number;
}> = ({ progress, activeIndex }) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const padding = 60;
  const timelineY = height * 0.55;
  const timelineWidth = width - padding * 2;
  const barMaxHeight = height * 0.25;

  const totalWeeks = MESOCYCLES.reduce((sum, m) => sum + m.weeks, 0);

  const mesocyclePositions = useMemo(() => {
    let x = padding;
    return MESOCYCLES.map((m, i) => {
      const w = (m.weeks / totalWeeks) * timelineWidth;
      const pos = { x, width: w, mesocycle: m, index: i };
      x += w;
      return pos;
    });
  }, [totalWeeks, timelineWidth]);

  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        <linearGradient id="timelineGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="rgba(139,92,246,0.3)" />
          <stop offset="50%" stopColor="rgba(34,197,94,0.3)" />
          <stop offset="100%" stopColor="rgba(6,182,212,0.3)" />
        </linearGradient>
        <filter id="barGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
        </filter>
      </defs>

      {/* Línea base del timeline */}
      <line
        x1={padding}
        y1={timelineY}
        x2={width - padding}
        y2={timelineY}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={3}
      />

      {/* Barras de mesociclos */}
      {mesocyclePositions.map((pos, i) => {
        const delay = i * 8;
        const barAnim = spring({
          frame: frame - delay,
          fps,
          config: { damping: 20, mass: 0.8, stiffness: 100 },
          durationInFrames: secondsToFrames(0.8, fps),
        });

        const barHeight =
          barMaxHeight * intensityToHeight[pos.mesocycle.intensity] * barAnim;
        const isActive = i === activeIndex;
        const opacity = volumeToOpacity[pos.mesocycle.volume];

        return (
          <g key={pos.mesocycle.id}>
            {/* Barra */}
            <rect
              x={pos.x + 4}
              y={timelineY - barHeight}
              width={pos.width - 8}
              height={barHeight}
              rx={8}
              fill={pos.mesocycle.color}
              opacity={isActive ? opacity : opacity * 0.6}
              filter={isActive ? "url(#barGlow)" : undefined}
            />

            {/* Borde si está activo */}
            {isActive && (
              <rect
                x={pos.x + 4}
                y={timelineY - barHeight}
                width={pos.width - 8}
                height={barHeight}
                rx={8}
                fill="none"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth={2}
              />
            )}

            {/* Semanas */}
            <text
              x={pos.x + pos.width / 2}
              y={timelineY + 30}
              fill={isActive ? COLORS.text : COLORS.faint}
              fontSize={16}
              fontWeight={700}
              textAnchor="middle"
              opacity={barAnim}
            >
              {pos.mesocycle.weeks}sem
            </text>

            {/* Nombre del mesociclo (solo si activo) */}
            {isActive && (
              <text
                x={pos.x + pos.width / 2}
                y={timelineY - barHeight - 14}
                fill={pos.mesocycle.color}
                fontSize={18}
                fontWeight={900}
                textAnchor="middle"
                opacity={interpolate(
                  frame % Math.round(fps * 0.6),
                  [0, Math.round(fps * 0.3), Math.round(fps * 0.6)],
                  [0.8, 1, 0.8],
                )}
              >
                {pos.mesocycle.name}
              </text>
            )}
          </g>
        );
      })}

      {/* Línea de intensidad (curva suavizada) */}
      <path
        d={(() => {
          const points = mesocyclePositions.map((pos) => ({
            x: pos.x + pos.width / 2,
            y:
              timelineY -
              barMaxHeight * intensityToHeight[pos.mesocycle.intensity],
          }));

          let d = `M ${points[0]?.x ?? 0} ${points[0]?.y ?? 0}`;
          for (let i = 1; i < points.length; i++) {
            const p0 = points[i - 1];
            const p1 = points[i];
            if (p0 && p1) {
              const cpX = (p0.x + p1.x) / 2;
              d += ` C ${cpX} ${p0.y}, ${cpX} ${p1.y}, ${p1.x} ${p1.y}`;
            }
          }
          return d;
        })()}
        fill="none"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={3}
        strokeDasharray="8 6"
        opacity={interpolate(progress, [0, 0.3], [0, 1], {
          extrapolateRight: "clamp",
        })}
      />

      {/* Etiquetas de ejes */}
      <text
        x={padding - 10}
        y={timelineY - barMaxHeight}
        fill={COLORS.faint}
        fontSize={14}
        fontWeight={600}
        textAnchor="end"
      >
        Alta
      </text>
      <text
        x={padding - 10}
        y={timelineY - barMaxHeight * 0.5}
        fill={COLORS.faint}
        fontSize={14}
        fontWeight={600}
        textAnchor="end"
      >
        Media
      </text>
      <text
        x={padding - 10}
        y={timelineY}
        fill={COLORS.faint}
        fontSize={14}
        fontWeight={600}
        textAnchor="end"
      >
        Baja
      </text>

      <text
        x={padding - 10}
        y={timelineY - barMaxHeight - 30}
        fill={COLORS.faint}
        fontSize={16}
        fontWeight={800}
        textAnchor="end"
        transform={`rotate(-90, ${padding - 30}, ${timelineY - barMaxHeight / 2})`}
      >
        INTENSIDAD
      </text>
    </svg>
  );
};

export const TrainingPeriodizationExplainer: React.FC<
  TrainingPeriodizationProps
> = ({ language = "es" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const preIntro = Math.round(3.5 * fps);
  const intro = Math.round(2.0 * fps);
  const perMesocycle = Math.round(3.5 * fps);
  const outro = Math.round(2.5 * fps);

  const totalMesocycleFrames = MESOCYCLES.length * perMesocycle;
  const mesocyclesStart = preIntro + intro;
  const outroStart = mesocyclesStart + totalMesocycleFrames;

  const t = frame - mesocyclesStart;
  const mesocycleIndex = Math.max(
    0,
    Math.min(MESOCYCLES.length - 1, Math.floor(t / perMesocycle)),
  );
  const mesocycleLocal = t - mesocycleIndex * perMesocycle;
  const mesocycleProgress = clamp01(mesocycleLocal / perMesocycle);

  const fadeIn = interpolate(frame, [0, Math.round(0.7 * fps)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const outroProgress = clamp01((frame - outroStart) / outro);

  const isPreIntro = frame < preIntro;
  const isMesocycles = frame >= mesocyclesStart && frame < outroStart;
  const isOutro = frame >= outroStart;

  const diagramOpacity = isPreIntro
    ? 0
    : interpolate(frame, [preIntro, preIntro + Math.round(0.6 * fps)], [0, 1], {
        extrapolateRight: "clamp",
      });

  const panelOpacity = isOutro
    ? interpolate(outroProgress, [0, 0.5, 1], [1, 1, 0], {
        extrapolateRight: "clamp",
      })
    : 1;

  const outroOpacity = isOutro
    ? interpolate(outroProgress, [0, 0.15, 1], [0, 1, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  const currentMesocycle = MESOCYCLES[mesocycleIndex];

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at 50% 40%, rgba(139,92,246,0.16), transparent 55%),
                     radial-gradient(900px 700px at 30% 70%, rgba(34,197,94,0.12), transparent 60%),
                     ${COLORS.bg}`,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: COLORS.text,
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: fadeIn }}>
        <div style={{ opacity: diagramOpacity }}>
          <TimelineDiagram
            progress={isMesocycles ? mesocycleProgress : isOutro ? 1 : 0}
            activeIndex={isMesocycles ? mesocycleIndex : -1}
          />
        </div>

        {/* Pantalla inicial */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: isPreIntro
              ? 1
              : interpolate(
                  frame,
                  [preIntro - Math.round(0.4 * fps), preIntro],
                  [1, 0],
                  { extrapolateRight: "clamp" },
                ),
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: 940,
              padding: 44,
              borderRadius: 28,
              background: "rgba(0,0,0,0.40)",
              border: "1px solid rgba(255,255,255,0.14)",
              backdropFilter: "blur(12px)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 18, letterSpacing: 1.2, color: COLORS.faint }}>
              ENTRENAMIENTO • PLANIFICACIÓN
            </div>
            <div
              style={{
                marginTop: 14,
                fontSize: 54,
                fontWeight: 950,
                lineHeight: 1.05,
              }}
            >
              Periodización del Entrenamiento
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 26,
                color: COLORS.muted,
                lineHeight: 1.35,
              }}
            >
              Organizar el entrenamiento en{" "}
              <span style={{ color: COLORS.accent, fontWeight: 900 }}>
                ciclos
              </span>{" "}
              para maximizar{" "}
              <span style={{ color: COLORS.accent2, fontWeight: 900 }}>
                adaptaciones
              </span>{" "}
              y minimizar{" "}
              <span style={{ color: COLORS.danger, fontWeight: 900 }}>
                fatiga
              </span>
              .
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 20,
                color: COLORS.faint,
                lineHeight: 1.55,
              }}
            >
              - <strong>Macrociclo:</strong> plan anual o de temporada
              <br />- <strong>Mesociclo:</strong> bloques de 3-6 semanas con
              objetivo específico
              <br />- <strong>Microciclo:</strong> semana individual de
              entrenamiento
            </div>
          </div>
        </div>

        {/* Header */}
        <div
          style={{
            position: "absolute",
            left: 56,
            top: 48,
            right: 56,
            opacity: isPreIntro ? 0 : 1,
          }}
        >
          <div style={{ fontSize: 18, letterSpacing: 1.2, color: COLORS.faint }}>
            PLANIFICACIÓN • MESOCICLOS
          </div>
          <div
            style={{
              fontSize: 44,
              fontWeight: 900,
              lineHeight: 1.05,
              marginTop: 10,
            }}
          >
            Timeline de periodización
          </div>
        </div>

        {/* Panel del mesociclo actual */}
        <div
          style={{
            position: "absolute",
            left: 56,
            right: 56,
            bottom: 80,
            opacity: isMesocycles ? panelOpacity : 0,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              padding: 32,
              borderRadius: 24,
              background: "rgba(0,0,0,0.40)",
              border: "1px solid rgba(255,255,255,0.14)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div style={{ fontSize: 16, color: COLORS.faint, letterSpacing: 1 }}>
                  MESOCICLO {mesocycleIndex + 1} / {MESOCYCLES.length}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 36,
                    fontWeight: 950,
                    lineHeight: 1.1,
                    color: currentMesocycle?.color,
                  }}
                >
                  {currentMesocycle?.name}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 20,
                    color: COLORS.muted,
                    lineHeight: 1.4,
                  }}
                >
                  {currentMesocycle?.focus}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexDirection: "column",
                  alignItems: "flex-end",
                }}
              >
                <div
                  style={{
                    padding: "8px 16px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  <span style={{ color: COLORS.faint }}>Duración: </span>
                  <span style={{ color: COLORS.text }}>
                    {currentMesocycle?.weeks} semanas
                  </span>
                </div>
                <div
                  style={{
                    padding: "8px 16px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  <span style={{ color: COLORS.faint }}>Intensidad: </span>
                  <span style={{ color: currentMesocycle?.color }}>
                    {currentMesocycle?.intensity.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Outro */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: outroOpacity,
          }}
        >
          <div
            style={{
              width: 860,
              padding: 40,
              borderRadius: 26,
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div style={{ fontSize: 18, color: COLORS.faint, letterSpacing: 1.1 }}>
              RESUMEN
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 40,
                fontWeight: 950,
                lineHeight: 1.1,
              }}
            >
              Periodiza para progresar sin estancarte
            </div>
            <div
              style={{
                marginTop: 16,
                fontSize: 20,
                color: COLORS.muted,
                lineHeight: 1.4,
              }}
            >
              Alterna fases de{" "}
              <span style={{ color: COLORS.accent, fontWeight: 800 }}>
                acumulación
              </span>{" "}
              (volumen) con fases de{" "}
              <span style={{ color: COLORS.warning, fontWeight: 800 }}>
                intensificación
              </span>{" "}
              y{" "}
              <span style={{ color: COLORS.muted, fontWeight: 800 }}>
                recuperación
              </span>
              .
            </div>
            <div style={{ marginTop: 12, fontSize: 16, color: COLORS.faint }}>
              Un macrociclo típico: 16-24 semanas hasta el pico de rendimiento.
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
