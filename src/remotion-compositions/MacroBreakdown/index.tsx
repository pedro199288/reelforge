import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, clamp01, secondsToFrames } from "../ui";

type Macro = {
  readonly id: string;
  readonly name: string;
  readonly grams: number;
  readonly calories: number;
  readonly percent: number;
  readonly color: string;
  readonly icon: string;
  readonly benefits: readonly string[];
  readonly sources: readonly string[];
};

export type MacroBreakdownProps = {
  readonly language?: "es" | "en";
  readonly totalCalories?: number;
  readonly proteinGrams?: number;
  readonly carbGrams?: number;
  readonly fatGrams?: number;
};

const DonutChart: React.FC<{
  readonly macros: Macro[];
  readonly progress: number;
  readonly activeMacro: string | null;
}> = ({ macros, progress, activeMacro }) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cx = width * 0.5;
  const cy = height * 0.4;
  const outerR = Math.min(width, height) * 0.22;
  const innerR = outerR * 0.6;
  const strokeWidth = outerR - innerR;

  // Calcular ángulos para cada segmento
  let startAngle = -90; // Empezar desde arriba
  const segments = macros.map((macro) => {
    const angle = (macro.percent / 100) * 360;
    const segment = {
      macro,
      startAngle,
      endAngle: startAngle + angle,
      midAngle: startAngle + angle / 2,
    };
    startAngle += angle;
    return segment;
  });

  const polarToCartesian = (
    centerX: number,
    centerY: number,
    radius: number,
    angleInDegrees: number,
  ) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  };

  const describeArc = (
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
  ) => {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return [
      "M",
      start.x,
      start.y,
      "A",
      radius,
      radius,
      0,
      largeArcFlag,
      0,
      end.x,
      end.y,
    ].join(" ");
  };

  const midRadius = (outerR + innerR) / 2;

  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        <filter id="donutGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" />
        </filter>
        <filter id="shadowFilter" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="8" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Círculo de fondo */}
      <circle
        cx={cx}
        cy={cy}
        r={midRadius}
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={strokeWidth}
      />

      {/* Segmentos del donut */}
      {segments.map((seg, i) => {
        const delay = i * 8;
        const segmentAnim = spring({
          frame: frame - delay,
          fps,
          config: { damping: 20, mass: 0.8, stiffness: 100 },
          durationInFrames: secondsToFrames(1.0, fps),
        });

        const animatedEndAngle =
          seg.startAngle +
          (seg.endAngle - seg.startAngle) * segmentAnim * progress;
        const isActive = activeMacro === seg.macro.id;

        const path = describeArc(
          cx,
          cy,
          midRadius,
          seg.startAngle,
          animatedEndAngle,
        );

        // Línea hacia la etiqueta
        const labelRadius = outerR + 40;
        const midAngleRad = ((seg.midAngle - 90) * Math.PI) / 180;
        const labelX = cx + Math.cos(midAngleRad) * labelRadius;
        const labelY = cy + Math.sin(midAngleRad) * labelRadius;
        const arcEdgeX = cx + Math.cos(midAngleRad) * outerR;
        const arcEdgeY = cy + Math.sin(midAngleRad) * outerR;

        const labelAnim = spring({
          frame: frame - delay - 15,
          fps,
          config: { damping: 18, mass: 0.6, stiffness: 140 },
          durationInFrames: secondsToFrames(0.6, fps),
        });

        return (
          <g key={seg.macro.id}>
            {/* Arco */}
            <path
              d={path}
              fill="none"
              stroke={seg.macro.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              opacity={isActive ? 1 : 0.7}
              filter={isActive ? "url(#donutGlow)" : undefined}
            />

            {/* Línea a etiqueta */}
            <line
              x1={arcEdgeX}
              y1={arcEdgeY}
              x2={labelX}
              y2={labelY}
              stroke={seg.macro.color}
              strokeWidth={2}
              opacity={labelAnim * 0.5}
            />

            {/* Etiqueta */}
            <g
              transform={`translate(${labelX}, ${labelY})`}
              opacity={labelAnim}
            >
              <circle r={30} fill={seg.macro.color} opacity={0.15} />
              <text
                textAnchor="middle"
                fill={seg.macro.color}
                fontSize={18}
                fontWeight={900}
                dy={-8}
              >
                {seg.macro.percent}%
              </text>
              <text
                textAnchor="middle"
                fill={COLORS.faint}
                fontSize={12}
                fontWeight={600}
                dy={10}
              >
                {seg.macro.name}
              </text>
            </g>
          </g>
        );
      })}

      {/* Centro del donut */}
      <circle cx={cx} cy={cy} r={innerR - 10} fill={COLORS.bg} opacity={0.9} />

      {/* Texto central */}
      {activeMacro && (
        <g>
          {(() => {
            const active = macros.find((m) => m.id === activeMacro);
            if (!active) return null;
            return (
              <>
                <text
                  x={cx}
                  y={cy - 20}
                  textAnchor="middle"
                  fill={active.color}
                  fontSize={48}
                  fontWeight={950}
                >
                  {active.grams}g
                </text>
                <text
                  x={cx}
                  y={cy + 15}
                  textAnchor="middle"
                  fill={COLORS.muted}
                  fontSize={18}
                  fontWeight={700}
                >
                  {active.name}
                </text>
                <text
                  x={cx}
                  y={cy + 40}
                  textAnchor="middle"
                  fill={COLORS.faint}
                  fontSize={14}
                >
                  {active.calories} kcal
                </text>
              </>
            );
          })()}
        </g>
      )}
    </svg>
  );
};

const SourcesList: React.FC<{
  readonly sources: readonly string[];
  readonly color: string;
}> = ({ sources, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {sources.map((source, i) => {
        const delay = i * 4;
        const anim = spring({
          frame: frame - delay,
          fps,
          config: { damping: 18, mass: 0.6, stiffness: 140 },
          durationInFrames: secondsToFrames(0.5, fps),
        });

        return (
          <div
            key={source}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
              border: `1px solid ${color}40`,
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.muted,
              opacity: anim,
              transform: `scale(${interpolate(anim, [0, 1], [0.9, 1])})`,
            }}
          >
            {source}
          </div>
        );
      })}
    </div>
  );
};

export const MacroBreakdownExplainer: React.FC<MacroBreakdownProps> = ({
  language = "es",
  totalCalories = 2500,
  proteinGrams = 180,
  carbGrams = 280,
  fatGrams = 80,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Calcular calorías y porcentajes
  const proteinCal = proteinGrams * 4;
  const carbCal = carbGrams * 4;
  const fatCal = fatGrams * 9;
  const actualTotal = proteinCal + carbCal + fatCal;

  const macros: Macro[] = [
    {
      id: "protein",
      name: "Proteína",
      grams: proteinGrams,
      calories: proteinCal,
      percent: Math.round((proteinCal / actualTotal) * 100),
      color: COLORS.danger,
      icon: "🥩",
      benefits: ["Síntesis muscular", "Saciedad", "Termogénesis"],
      sources: ["Pollo", "Huevos", "Pescado", "Legumbres", "Whey"],
    },
    {
      id: "carbs",
      name: "Carbohidratos",
      grams: carbGrams,
      calories: carbCal,
      percent: Math.round((carbCal / actualTotal) * 100),
      color: COLORS.warning,
      icon: "🍚",
      benefits: ["Energía rápida", "Glucógeno muscular", "Rendimiento"],
      sources: ["Arroz", "Avena", "Patata", "Frutas", "Pan integral"],
    },
    {
      id: "fat",
      name: "Grasas",
      grams: fatGrams,
      calories: fatCal,
      percent: Math.round((fatCal / actualTotal) * 100),
      color: COLORS.accent2,
      icon: "🥑",
      benefits: ["Hormonas", "Absorción vitaminas", "Saciedad"],
      sources: ["Aguacate", "Aceite oliva", "Frutos secos", "Pescado azul"],
    },
  ];

  const preIntro = Math.round(3.5 * fps);
  const intro = Math.round(2.0 * fps);
  const perMacro = Math.round(4.5 * fps);
  const outro = Math.round(2.5 * fps);

  const totalMacrosFrames = macros.length * perMacro;
  const macrosStart = preIntro + intro;
  const outroStart = macrosStart + totalMacrosFrames;

  const t = frame - macrosStart;
  const macroIndex = Math.max(
    0,
    Math.min(macros.length - 1, Math.floor(t / perMacro)),
  );

  const fadeIn = interpolate(frame, [0, Math.round(0.7 * fps)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const outroProgress = clamp01((frame - outroStart) / outro);

  const isPreIntro = frame < preIntro;
  const isMacros = frame >= macrosStart && frame < outroStart;
  const isOutro = frame >= outroStart;

  const chartOpacity = isPreIntro
    ? 0
    : interpolate(frame, [preIntro, preIntro + Math.round(0.6 * fps)], [0, 1], {
        extrapolateRight: "clamp",
      });

  const chartProgress = isPreIntro
    ? 0
    : clamp01((frame - preIntro) / (intro + totalMacrosFrames));

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

  const currentMacro = macros[macroIndex];

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at 50% 35%, rgba(251,113,133,0.12), transparent 55%),
                     radial-gradient(900px 700px at 30% 65%, rgba(245,158,11,0.10), transparent 60%),
                     radial-gradient(800px 600px at 70% 70%, rgba(34,197,94,0.10), transparent 60%),
                     ${COLORS.bg}`,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: COLORS.text,
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: fadeIn }}>
        <div style={{ opacity: chartOpacity }}>
          <DonutChart
            macros={macros}
            progress={chartProgress}
            activeMacro={isMacros ? currentMacro?.id ?? null : null}
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
              NUTRICIÓN • MACRONUTRIENTES
            </div>
            <div
              style={{
                marginTop: 14,
                fontSize: 54,
                fontWeight: 950,
                lineHeight: 1.05,
              }}
            >
              Distribución de Macros
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 26,
                color: COLORS.muted,
                lineHeight: 1.35,
              }}
            >
              <span style={{ color: COLORS.danger, fontWeight: 900 }}>
                Proteína
              </span>
              ,{" "}
              <span style={{ color: COLORS.warning, fontWeight: 900 }}>
                carbohidratos
              </span>{" "}
              y{" "}
              <span style={{ color: COLORS.accent2, fontWeight: 900 }}>
                grasas
              </span>{" "}
              para tus objetivos
            </div>
            <div
              style={{
                marginTop: 20,
                padding: "16px 24px",
                background: "rgba(255,255,255,0.06)",
                borderRadius: 16,
                display: "inline-block",
              }}
            >
              <div style={{ fontSize: 16, color: COLORS.faint }}>
                Objetivo diario
              </div>
              <div
                style={{
                  fontSize: 42,
                  fontWeight: 950,
                  color: COLORS.text,
                  marginTop: 4,
                }}
              >
                {actualTotal.toLocaleString()} kcal
              </div>
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
            MACROS • {actualTotal.toLocaleString()} KCAL
          </div>
          <div
            style={{
              fontSize: 42,
              fontWeight: 900,
              lineHeight: 1.05,
              marginTop: 10,
            }}
          >
            Tu Plan Nutricional
          </div>
        </div>

        {/* Panel de macro actual */}
        <div
          style={{
            position: "absolute",
            left: 56,
            right: 56,
            bottom: 80,
            opacity: isMacros ? panelOpacity : 0,
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
                marginBottom: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 14,
                    color: COLORS.faint,
                    letterSpacing: 1,
                  }}
                >
                  MACRO {macroIndex + 1} / {macros.length}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 34,
                    fontWeight: 950,
                    lineHeight: 1.1,
                    color: currentMacro?.color,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span>{currentMacro?.icon}</span>
                  {currentMacro?.name}
                </div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div
                  style={{
                    padding: "12px 20px",
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 950, color: currentMacro?.color }}>
                    {currentMacro?.grams}g
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.faint }}>
                    diarios
                  </div>
                </div>
                <div
                  style={{
                    padding: "12px 20px",
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 950, color: COLORS.muted }}>
                    {currentMacro?.calories}
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.faint }}>
                    kcal
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, color: COLORS.faint, marginBottom: 8 }}>
                BENEFICIOS
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {currentMacro?.benefits.map((b) => (
                  <span
                    key={b}
                    style={{
                      fontSize: 14,
                      color: COLORS.muted,
                      padding: "4px 10px",
                      background: `${currentMacro?.color}20`,
                      borderRadius: 6,
                    }}
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 14, color: COLORS.faint, marginBottom: 8 }}>
                FUENTES PRINCIPALES
              </div>
              <SourcesList
                sources={currentMacro?.sources ?? []}
                color={currentMacro?.color ?? COLORS.text}
              />
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
              Los macros determinan los resultados
            </div>
            <div
              style={{
                marginTop: 16,
                fontSize: 20,
                color: COLORS.muted,
                lineHeight: 1.4,
              }}
            >
              Prioriza{" "}
              <span style={{ color: COLORS.danger, fontWeight: 800 }}>
                proteína (~1.6-2.2g/kg)
              </span>{" "}
              para músculo. Ajusta{" "}
              <span style={{ color: COLORS.warning, fontWeight: 800 }}>
                carbos
              </span>{" "}
              según actividad y{" "}
              <span style={{ color: COLORS.accent2, fontWeight: 800 }}>
                grasas
              </span>{" "}
              para hormonas.
            </div>
            <div style={{ marginTop: 12, fontSize: 16, color: COLORS.faint }}>
              Las calorías totales determinan si ganas o pierdes peso.
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
