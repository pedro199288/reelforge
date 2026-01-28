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

type SleepStage = {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly level: number; // 0=REM, 1=N1, 2=N2, 3=N3 (profundo)
  readonly color: string;
  readonly description: string;
  readonly benefits: readonly string[];
  readonly duration: string;
};

export type SleepCyclesProps = {
  readonly language?: "es" | "en";
};

const STAGES: SleepStage[] = [
  {
    id: "n1",
    name: "N1 - Transición",
    shortName: "N1",
    level: 1,
    color: COLORS.cyan,
    description: "Adormecimiento ligero, fácil despertar",
    benefits: ["Transición vigilia-sueño", "Relajación muscular inicial"],
    duration: "5-10 min",
  },
  {
    id: "n2",
    name: "N2 - Sueño Ligero",
    shortName: "N2",
    level: 2,
    color: COLORS.accent,
    description: "Husos del sueño y complejos K",
    benefits: ["Consolidación de memoria motora", "Regulación metabólica"],
    duration: "45-55% del sueño",
  },
  {
    id: "n3",
    name: "N3 - Sueño Profundo",
    shortName: "N3",
    level: 3,
    color: COLORS.accent2,
    description: "Ondas delta lentas, restauración física",
    benefits: [
      "Reparación muscular",
      "Liberación de hormona del crecimiento",
      "Sistema inmune",
    ],
    duration: "15-25% del sueño",
  },
  {
    id: "rem",
    name: "REM - Sueño Paradójico",
    shortName: "REM",
    level: 0,
    color: COLORS.danger,
    description: "Movimientos oculares rápidos, sueños vívidos",
    benefits: [
      "Consolidación de memoria",
      "Procesamiento emocional",
      "Creatividad",
    ],
    duration: "20-25% del sueño",
  },
];

// Hipnograma simulado (ciclo típico de ~90min repetido)
const HYPNOGRAM_DATA = [
  // Ciclo 1 (0-90 min) - poco REM
  { stage: "n1", start: 0, end: 10 },
  { stage: "n2", start: 10, end: 30 },
  { stage: "n3", start: 30, end: 60 },
  { stage: "n2", start: 60, end: 75 },
  { stage: "rem", start: 75, end: 90 },
  // Ciclo 2 (90-180 min)
  { stage: "n2", start: 90, end: 110 },
  { stage: "n3", start: 110, end: 140 },
  { stage: "n2", start: 140, end: 160 },
  { stage: "rem", start: 160, end: 180 },
  // Ciclo 3 (180-270 min) - más REM
  { stage: "n2", start: 180, end: 200 },
  { stage: "n3", start: 200, end: 220 },
  { stage: "n2", start: 220, end: 240 },
  { stage: "rem", start: 240, end: 270 },
  // Ciclo 4 (270-360 min) - máximo REM
  { stage: "n2", start: 270, end: 290 },
  { stage: "n3", start: 290, end: 310 },
  { stage: "n2", start: 310, end: 330 },
  { stage: "rem", start: 330, end: 360 },
  // Ciclo 5 (360-450 min) - mucho REM
  { stage: "n2", start: 360, end: 380 },
  { stage: "n2", start: 380, end: 400 },
  { stage: "rem", start: 400, end: 450 },
  // Despertar
  { stage: "n1", start: 450, end: 480 },
];

const stageToLevel: Record<string, number> = {
  rem: 0,
  n1: 1,
  n2: 2,
  n3: 3,
};

const stageToColor: Record<string, string> = {
  rem: COLORS.danger,
  n1: COLORS.cyan,
  n2: COLORS.accent,
  n3: COLORS.accent2,
};

const HypnogramChart: React.FC<{
  readonly progress: number;
  readonly activeStage: string | null;
}> = ({ progress, activeStage }) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const chartPadding = { left: 100, right: 56, top: 40, bottom: 60 };
  const chartWidth = width - chartPadding.left - chartPadding.right;
  const chartHeight = height * 0.35;
  const chartY = height * 0.35;

  const totalMinutes = 480; // 8 horas
  const minuteToX = (min: number) =>
    chartPadding.left + (min / totalMinutes) * chartWidth;
  const levelToY = (level: number) =>
    chartY + (level / 3) * (chartHeight - 20) + 10;

  const pathData = useMemo(() => {
    const points: Array<{ x: number; y: number; stage: string }> = [];

    HYPNOGRAM_DATA.forEach((segment) => {
      const level = stageToLevel[segment.stage] ?? 0;
      points.push({
        x: minuteToX(segment.start),
        y: levelToY(level),
        stage: segment.stage,
      });
      points.push({
        x: minuteToX(segment.end),
        y: levelToY(level),
        stage: segment.stage,
      });
    });

    return points;
  }, []);

  const drawProgress = interpolate(progress, [0, 1], [0, 1], {
    easing: Easing.out(Easing.cubic),
  });

  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        <linearGradient id="sleepGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="rgba(6,182,212,0.3)" />
          <stop offset="50%" stopColor="rgba(139,92,246,0.3)" />
          <stop offset="100%" stopColor="rgba(251,113,133,0.3)" />
        </linearGradient>
        <filter id="sleepGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
        </filter>
      </defs>

      {/* Fondo del gráfico */}
      <rect
        x={chartPadding.left}
        y={chartY}
        width={chartWidth}
        height={chartHeight}
        fill="rgba(255,255,255,0.02)"
        rx={12}
      />

      {/* Líneas horizontales para cada nivel */}
      {[0, 1, 2, 3].map((level) => {
        const y = levelToY(level);
        const labels = ["REM", "N1", "N2", "N3"];
        return (
          <g key={level}>
            <line
              x1={chartPadding.left}
              y1={y}
              x2={chartPadding.left + chartWidth}
              y2={y}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
            <text
              x={chartPadding.left - 16}
              y={y + 5}
              fill={COLORS.faint}
              fontSize={16}
              fontWeight={700}
              textAnchor="end"
            >
              {labels[level]}
            </text>
          </g>
        );
      })}

      {/* Marcadores de hora */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((hour) => {
        const x = minuteToX(hour * 60);
        return (
          <g key={hour}>
            <line
              x1={x}
              y1={chartY}
              x2={x}
              y2={chartY + chartHeight}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
            <text
              x={x}
              y={chartY + chartHeight + 25}
              fill={COLORS.faint}
              fontSize={14}
              fontWeight={600}
              textAnchor="middle"
            >
              {hour}h
            </text>
          </g>
        );
      })}

      {/* Bloques de color para cada segmento */}
      {HYPNOGRAM_DATA.map((segment, i) => {
        const x1 = minuteToX(segment.start);
        const x2 = minuteToX(segment.end);
        const y = levelToY(stageToLevel[segment.stage] ?? 0);
        const segmentProgress = clamp01(
          (drawProgress * HYPNOGRAM_DATA.length - i) * 2,
        );
        const isActive = activeStage === segment.stage;

        return (
          <g key={i} opacity={segmentProgress}>
            <rect
              x={x1}
              y={y - 12}
              width={(x2 - x1) * segmentProgress}
              height={24}
              fill={stageToColor[segment.stage]}
              opacity={isActive ? 0.8 : 0.4}
              rx={4}
              filter={isActive ? "url(#sleepGlow)" : undefined}
            />
          </g>
        );
      })}

      {/* Línea del hipnograma */}
      <path
        d={pathData
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
          .join(" ")}
        fill="none"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - drawProgress}
      />

      {/* Etiquetas de ejes */}
      <text
        x={chartPadding.left + chartWidth / 2}
        y={chartY + chartHeight + 50}
        fill={COLORS.faint}
        fontSize={16}
        fontWeight={700}
        textAnchor="middle"
      >
        HORAS DE SUEÑO
      </text>

      {/* Ciclos */}
      {[1, 2, 3, 4, 5].map((cycle, i) => {
        const x = minuteToX(90 * (i + 0.5));
        const cycleAnim = spring({
          frame: frame - i * 15,
          fps,
          config: { damping: 20, mass: 0.7, stiffness: 100 },
          durationInFrames: secondsToFrames(0.7, fps),
        });

        return (
          <text
            key={cycle}
            x={x}
            y={chartY - 14}
            fill={COLORS.muted}
            fontSize={14}
            fontWeight={600}
            textAnchor="middle"
            opacity={cycleAnim}
          >
            Ciclo {cycle}
          </text>
        );
      })}
    </svg>
  );
};

export const SleepCyclesExplainer: React.FC<SleepCyclesProps> = ({
  language = "es",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const preIntro = Math.round(3.5 * fps);
  const intro = Math.round(2.0 * fps);
  const perStage = Math.round(4.0 * fps);
  const outro = Math.round(2.5 * fps);

  const totalStagesFrames = STAGES.length * perStage;
  const stagesStart = preIntro + intro;
  const outroStart = stagesStart + totalStagesFrames;

  const t = frame - stagesStart;
  const stageIndex = Math.max(
    0,
    Math.min(STAGES.length - 1, Math.floor(t / perStage)),
  );

  const fadeIn = interpolate(frame, [0, Math.round(0.7 * fps)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const outroProgress = clamp01((frame - outroStart) / outro);

  const isPreIntro = frame < preIntro;
  const isStages = frame >= stagesStart && frame < outroStart;
  const isOutro = frame >= outroStart;

  const chartOpacity = isPreIntro
    ? 0
    : interpolate(frame, [preIntro, preIntro + Math.round(0.6 * fps)], [0, 1], {
        extrapolateRight: "clamp",
      });

  const chartProgress = isPreIntro
    ? 0
    : clamp01((frame - preIntro) / (stagesStart + totalStagesFrames - preIntro));

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

  const currentStage = STAGES[stageIndex];

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at 50% 30%, rgba(139,92,246,0.15), transparent 55%),
                     radial-gradient(900px 700px at 30% 70%, rgba(6,182,212,0.10), transparent 60%),
                     ${COLORS.bg}`,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: COLORS.text,
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: fadeIn }}>
        <div style={{ opacity: chartOpacity }}>
          <HypnogramChart
            progress={chartProgress}
            activeStage={isStages ? currentStage?.id ?? null : null}
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
              RECUPERACIÓN • SUEÑO
            </div>
            <div
              style={{
                marginTop: 14,
                fontSize: 54,
                fontWeight: 950,
                lineHeight: 1.05,
              }}
            >
              Ciclos del Sueño
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 26,
                color: COLORS.muted,
                lineHeight: 1.35,
              }}
            >
              El sueño alterna entre fases{" "}
              <span style={{ color: COLORS.accent, fontWeight: 900 }}>
                NREM
              </span>{" "}
              y{" "}
              <span style={{ color: COLORS.danger, fontWeight: 900 }}>REM</span>{" "}
              en ciclos de ~90 minutos
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 20,
                color: COLORS.faint,
                lineHeight: 1.55,
              }}
            >
              - <strong>N1-N3:</strong> sueño no-REM (de ligero a profundo)
              <br />- <strong>REM:</strong> sueños vívidos, consolidación de
              memoria
              <br />- 4-6 ciclos por noche para óptima recuperación
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
            FASES DEL SUEÑO • HIPNOGRAMA
          </div>
          <div
            style={{
              fontSize: 42,
              fontWeight: 900,
              lineHeight: 1.05,
              marginTop: 10,
            }}
          >
            Arquitectura del Sueño
          </div>
        </div>

        {/* Panel de fase actual */}
        <div
          style={{
            position: "absolute",
            left: 56,
            right: 56,
            bottom: 80,
            opacity: isStages ? panelOpacity : 0,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              padding: 28,
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
                <div
                  style={{ fontSize: 14, color: COLORS.faint, letterSpacing: 1 }}
                >
                  FASE {stageIndex + 1} / {STAGES.length}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 34,
                    fontWeight: 950,
                    lineHeight: 1.1,
                    color: currentStage?.color,
                  }}
                >
                  {currentStage?.name}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 20,
                    color: COLORS.muted,
                  }}
                >
                  {currentStage?.description}
                </div>
                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {currentStage?.benefits.map((benefit, i) => (
                    <div
                      key={benefit}
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          background: currentStage?.color,
                        }}
                      />
                      <span style={{ fontSize: 16, color: COLORS.muted }}>
                        {benefit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div
                style={{
                  padding: "16px 24px",
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 16,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: COLORS.faint }}>
                  Proporción
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 900,
                    color: currentStage?.color,
                    marginTop: 4,
                  }}
                >
                  {currentStage?.duration}
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
              Respeta los ciclos para despertar mejor
            </div>
            <div
              style={{
                marginTop: 16,
                fontSize: 20,
                color: COLORS.muted,
                lineHeight: 1.4,
              }}
            >
              Despierta al final de un ciclo (~90 min múltiplos):{" "}
              <span style={{ color: COLORS.accent2, fontWeight: 800 }}>
                6h, 7.5h o 9h
              </span>{" "}
              de sueño. Evita interrumpir el{" "}
              <span style={{ color: COLORS.accent2, fontWeight: 800 }}>
                sueño profundo
              </span>
              .
            </div>
            <div style={{ marginTop: 12, fontSize: 16, color: COLORS.faint }}>
              REM aumenta hacia el final de la noche - no acortes las últimas
              horas.
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
