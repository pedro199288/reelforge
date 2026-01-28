import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, clamp01 } from "../ui";

type GlycolysisStep = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly reaction: string;
  readonly enzyme?: string;
  readonly atp: number;
  readonly nadh: number;
};

export type GlucoseMetabolismProps = {
  readonly language?: "es" | "en";
  readonly showEnzymes?: boolean;
};

const STEPS_ES: GlycolysisStep[] = [
  {
    id: "phosphorylation-1",
    title: "1) Fosforilación",
    subtitle: "Inversión de ATP para activar la glucosa",
    reaction: "Glucosa + ATP → Glucosa-6-fosfato",
    enzyme: "Hexoquinasa",
    atp: -1,
    nadh: 0,
  },
  {
    id: "isomerization",
    title: "2) Isomerización",
    subtitle: "Reorganización molecular",
    reaction: "Glucosa-6-P ⇄ Fructosa-6-P",
    enzyme: "Fosfoglucosa isomerasa",
    atp: 0,
    nadh: 0,
  },
  {
    id: "phosphorylation-2",
    title: "3) 2ª Fosforilación",
    subtitle: "Punto de compromiso irreversible",
    reaction: "Fructosa-6-P + ATP → Fructosa-1,6-bisfosfato",
    enzyme: "Fosfofructoquinasa-1 (PFK-1)",
    atp: -1,
    nadh: 0,
  },
  {
    id: "cleavage",
    title: "4) Escisión",
    subtitle: "Se divide en 2 triosas",
    reaction: "F-1,6-BP → DHAP + G3P",
    enzyme: "Aldolasa",
    atp: 0,
    nadh: 0,
  },
  {
    id: "isomerization-2",
    title: "5) Isomerización de triosas",
    subtitle: "Todo el flujo pasa por G3P (×2)",
    reaction: "DHAP ⇄ G3P",
    enzyme: "Triosa fosfato isomerasa",
    atp: 0,
    nadh: 0,
  },
  {
    id: "oxidation",
    title: "6) Oxidación",
    subtitle: "Se genera NADH y un intermediario de alta energía",
    reaction: "G3P → 1,3-BPG + NADH (×2)",
    enzyme: "G3P deshidrogenasa",
    atp: 0,
    nadh: 2,
  },
  {
    id: "substrate-phosphorylation-1",
    title: "7) Fosforilación a nivel de sustrato",
    subtitle: "¡Primera ganancia de ATP!",
    reaction: "1,3-BPG → 3-PG + ATP (×2)",
    enzyme: "Fosfoglicerato quinasa",
    atp: 2,
    nadh: 0,
  },
  {
    id: "isomerization-3",
    title: "8) Isomerización",
    subtitle: "Movimiento del grupo fosfato",
    reaction: "3-PG ⇄ 2-PG",
    enzyme: "Fosfoglicerato mutasa",
    atp: 0,
    nadh: 0,
  },
  {
    id: "dehydration",
    title: "9) Deshidratación",
    subtitle: "Se crea un enlace de alta energía",
    reaction: "2-PG → PEP + H₂O",
    enzyme: "Enolasa",
    atp: 0,
    nadh: 0,
  },
  {
    id: "substrate-phosphorylation-2",
    title: "10) 2ª Fosforilación a nivel de sustrato",
    subtitle: "¡Segunda ganancia de ATP!",
    reaction: "PEP → Piruvato + ATP (×2)",
    enzyme: "Piruvato quinasa",
    atp: 2,
    nadh: 0,
  },
];

const METABOLITES = [
  "Glucosa",
  "G6P",
  "F6P",
  "F1,6BP",
  "DHAP/G3P",
  "1,3BPG",
  "3PG",
  "2PG",
  "PEP",
  "Piruvato",
];

const MetricPill: React.FC<{
  readonly label: string;
  readonly value: number;
  readonly color: string;
}> = ({ label, value, color }) => {
  const prefix = value > 0 ? "+" : "";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <div style={{ color: COLORS.muted, fontSize: 18, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ color, fontSize: 22, fontWeight: 800 }}>
        {prefix}
        {value}
      </div>
    </div>
  );
};

const RingDiagram: React.FC<{
  readonly activeIndex: number;
  readonly progressInStep: number;
}> = ({ activeIndex, progressInStep }) => {
  const { width, height } = useVideoConfig();
  const size = Math.min(width, height);
  const cx = width * 0.5;
  const cy = height * 0.5;
  const r = size * 0.2;
  const nodeR = size * 0.016;

  const points = useMemo(() => {
    const n = METABOLITES.length;
    return METABOLITES.map((_, i) => {
      const angle = -Math.PI / 2 + (i * (2 * Math.PI)) / n;
      return {
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        angle,
      };
    });
  }, [cx, cy, r]);

  const arrowProgress = clamp01(progressInStep);
  const n = points.length;
  const stepAngle = (2 * Math.PI) / n;
  const safeIndex = ((activeIndex % n) + n) % n;
  const startAngle = points[safeIndex]?.angle ?? -Math.PI / 2;
  const markerAngle = startAngle + stepAngle * arrowProgress;
  const arrowX = cx + Math.cos(markerAngle) * r;
  const arrowY = cy + Math.sin(markerAngle) * r;

  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        <radialGradient id="glucoseGlow" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="rgba(245,158,11,0.20)" />
          <stop offset="100%" stopColor="rgba(245,158,11,0.00)" />
        </radialGradient>
        <linearGradient id="glucoseRing" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(245,158,11,0.85)" />
          <stop offset="50%" stopColor="rgba(34,197,94,0.95)" />
          <stop offset="100%" stopColor="rgba(139,92,246,0.80)" />
        </linearGradient>
        <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="blur" />
          <feOffset in="blur" dx="0" dy="10" result="offsetBlur" />
          <feColorMatrix
            in="offsetBlur"
            type="matrix"
            values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0   0 0 0 .35 0"
            result="shadow"
          />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx={cx} cy={cy} r={r * 1.6} fill="url(#glucoseGlow)" />

      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="url(#glucoseRing)"
        strokeWidth={Math.max(6, Math.round(size * 0.006))}
        opacity={0.85}
      />

      {points.map((p, i) => {
        const isActive = i === safeIndex;
        const isNext = i === (safeIndex + 1) % points.length;
        const glow = isActive ? 1 : isNext ? 0.45 : 0.15;
        return (
          <g key={i} filter={isActive ? "url(#softShadow)" : undefined}>
            <circle
              cx={p.x}
              cy={p.y}
              r={nodeR * (isActive ? 1.25 : 1)}
              fill="rgba(10,12,22,0.95)"
              stroke={isActive ? COLORS.warning : "rgba(255,255,255,0.18)"}
              strokeWidth={Math.max(2, Math.round(size * 0.0025))}
              opacity={0.95}
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={nodeR * 2.6}
              fill={isActive ? "rgba(245,158,11,0.12)" : "rgba(139,92,246,0.08)"}
              opacity={glow}
            />
          </g>
        );
      })}

      <g filter="url(#softShadow)">
        <circle
          cx={arrowX}
          cy={arrowY}
          r={nodeR * 0.95}
          fill={COLORS.accent2}
          stroke="rgba(255,255,255,0.30)"
          strokeWidth={Math.max(2, Math.round(size * 0.002))}
        />
      </g>
    </svg>
  );
};

export const GlucoseMetabolismExplainer: React.FC<GlucoseMetabolismProps> = ({
  language = "es",
  showEnzymes = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const preIntro = Math.round(3.5 * fps);
  const intro = Math.round(2.0 * fps);
  const perStep = Math.round(2.8 * fps);
  const outro = Math.round(2.5 * fps);

  const steps = STEPS_ES;
  const totalStepsFrames = steps.length * perStep;
  const stepsStart = preIntro + intro;
  const outroStart = stepsStart + totalStepsFrames;

  const t = frame - stepsStart;
  const stepIndex = Math.max(
    0,
    Math.min(steps.length - 1, Math.floor(t / perStep)),
  );
  const stepLocal = t - stepIndex * perStep;
  const stepProgress = clamp01(stepLocal / perStep);

  const fadeIn = interpolate(frame, [0, Math.round(0.7 * fps)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const introProgress = clamp01((frame - preIntro) / intro);
  const outroProgress = clamp01((frame - outroStart) / outro);

  const titleY = interpolate(introProgress, [0, 1], [18, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const headerScale = spring({
    fps,
    frame,
    config: { damping: 16, mass: 0.7, stiffness: 120 },
    durationInFrames: Math.round(1.1 * fps),
  });

  // Calcular totales acumulados
  const stepsCompleted =
    frame < stepsStart
      ? 0
      : Math.max(
          0,
          Math.min(
            steps.length,
            Math.floor((frame - stepsStart) / perStep) + 1,
          ),
        );

  const tally = steps.slice(0, stepsCompleted).reduce(
    (acc, s) => ({
      atp: acc.atp + s.atp,
      nadh: acc.nadh + s.nadh,
    }),
    { atp: 0, nadh: 0 },
  );

  const totals = steps.reduce(
    (acc, s) => ({
      atp: acc.atp + s.atp,
      nadh: acc.nadh + s.nadh,
    }),
    { atp: 0, nadh: 0 },
  );

  const isPreIntro = frame < preIntro;
  const isSteps = frame >= stepsStart && frame < outroStart;
  const isOutro = frame >= outroStart;

  const ringOpacity = isPreIntro
    ? 0
    : interpolate(frame, [preIntro, preIntro + Math.round(0.6 * fps)], [0, 1], {
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });

  const diagramIndex = isSteps || isOutro ? stepIndex : 0;
  const diagramProgress = isSteps || isOutro ? stepProgress : 0;

  const panelOpacity = isOutro
    ? interpolate(outroProgress, [0, 0.5, 1], [1, 1, 0], {
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      })
    : 1;

  const outroOpacity = isOutro
    ? interpolate(outroProgress, [0, 0.15, 1], [0, 1, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 0;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at 50% 40%, rgba(245,158,11,0.18), transparent 55%),
                     radial-gradient(900px 700px at 70% 60%, rgba(34,197,94,0.12), transparent 60%),
                     ${COLORS.bg}`,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: COLORS.text,
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: fadeIn }}>
        <div style={{ opacity: ringOpacity }}>
          <RingDiagram
            activeIndex={diagramIndex}
            progressInStep={diagramProgress}
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
                  {
                    extrapolateRight: "clamp",
                    easing: Easing.inOut(Easing.cubic),
                  },
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
              transform: `translateY(${interpolate(
                clamp01(frame / Math.max(1, preIntro)),
                [0, 1],
                [18, 0],
                { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
              )}px)`,
            }}
          >
            <div style={{ fontSize: 18, letterSpacing: 1.2, color: COLORS.faint }}>
              BIOQUÍMICA • METABOLISMO ENERGÉTICO
            </div>
            <div
              style={{
                marginTop: 14,
                fontSize: 56,
                fontWeight: 950,
                lineHeight: 1.05,
              }}
            >
              ¿Qué es la Glucólisis?
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 26,
                color: COLORS.muted,
                lineHeight: 1.35,
              }}
            >
              Es la ruta metabólica que convierte{" "}
              <span style={{ color: COLORS.warning, fontWeight: 900 }}>
                glucosa
              </span>{" "}
              en{" "}
              <span style={{ color: COLORS.accent2, fontWeight: 900 }}>
                piruvato
              </span>
              , generando ATP y NADH.
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 20,
                color: COLORS.faint,
                lineHeight: 1.55,
              }}
            >
              - Ocurre en el <span style={{ color: COLORS.text, fontWeight: 900 }}>citoplasma</span> de todas las células.
              <br />- Es la primera etapa de la respiración celular.
              <br />- Rinde{" "}
              <span style={{ color: COLORS.accent2, fontWeight: 900 }}>
                2 ATP netos
              </span>{" "}
              y{" "}
              <span style={{ color: COLORS.cyan, fontWeight: 900 }}>
                2 NADH
              </span>{" "}
              por glucosa.
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
            transform: `translateY(${titleY}px) scale(${0.95 + 0.05 * headerScale})`,
            transformOrigin: "left top",
            opacity: isPreIntro ? 0 : 1,
          }}
        >
          <div style={{ fontSize: 18, letterSpacing: 1.2, color: COLORS.faint }}>
            BIOQUÍMICA • GLUCÓLISIS
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 900,
              lineHeight: 1.05,
              marginTop: 10,
            }}
          >
            Metabolismo de la glucosa
          </div>
          <div style={{ fontSize: 22, color: COLORS.muted, marginTop: 12 }}>
            10 pasos enzimáticos:{" "}
            <span style={{ color: COLORS.warning, fontWeight: 800 }}>
              Glucosa
            </span>{" "}
            →{" "}
            <span style={{ color: COLORS.accent2, fontWeight: 800 }}>
              2 Piruvatos
            </span>
          </div>
        </div>

        {/* Panel del paso actual */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingLeft: 56,
            paddingRight: 56,
            opacity: isSteps ? panelOpacity : 0,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: 940,
              padding: 36,
              borderRadius: 28,
              background: "rgba(0,0,0,0.36)",
              border: "1px solid rgba(255,255,255,0.14)",
              backdropFilter: "blur(12px)",
              textAlign: "center",
              transform: `translateY(${interpolate(
                clamp01(stepProgress),
                [0, 0.15, 1],
                [16, 0, 0],
                { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
              )}px)`,
            }}
          >
            <div style={{ fontSize: 20, letterSpacing: 1.1, color: COLORS.faint }}>
              PASO {Math.min(stepIndex + 1, steps.length)} / {steps.length}
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 40,
                fontWeight: 950,
                lineHeight: 1.08,
              }}
            >
              {steps[stepIndex]?.title}
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 24,
                color: COLORS.muted,
                lineHeight: 1.25,
              }}
            >
              {steps[stepIndex]?.subtitle}
            </div>

            <div
              style={{
                marginTop: 16,
                fontSize: 24,
                color: COLORS.text,
                lineHeight: 1.35,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              }}
            >
              {steps[stepIndex]?.reaction}
            </div>

            {showEnzymes && steps[stepIndex]?.enzyme ? (
              <div style={{ marginTop: 12, color: COLORS.faint, fontSize: 18 }}>
                Enzima:{" "}
                <span style={{ color: COLORS.text, fontWeight: 800 }}>
                  {steps[stepIndex]?.enzyme}
                </span>
              </div>
            ) : null}

            <div
              style={{
                marginTop: 18,
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <MetricPill label="ATP" value={tally.atp} color={tally.atp >= 0 ? COLORS.accent2 : COLORS.danger} />
              <MetricPill label="NADH" value={tally.nadh} color={COLORS.cyan} />
            </div>

            <div style={{ marginTop: 14, color: COLORS.faint, fontSize: 14 }}>
              Balance neto: inversión inicial + ganancias posteriores
            </div>
          </div>
        </div>

        {/* Outro resumen */}
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
              RESUMEN (por 1 glucosa)
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 42,
                fontWeight: 950,
                lineHeight: 1.1,
              }}
            >
              Balance energético de la glucólisis
            </div>

            <div
              style={{
                marginTop: 18,
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <MetricPill label="ATP neto" value={totals.atp} color={COLORS.accent2} />
              <MetricPill label="NADH" value={totals.nadh} color={COLORS.cyan} />
              <MetricPill label="Piruvatos" value={2} color={COLORS.warning} />
            </div>

            <div style={{ marginTop: 18, fontSize: 18, color: COLORS.muted }}>
              El piruvato puede seguir a{" "}
              <span style={{ color: COLORS.text, fontWeight: 800 }}>
                fermentación
              </span>{" "}
              (sin O₂) o al{" "}
              <span style={{ color: COLORS.text, fontWeight: 800 }}>
                ciclo de Krebs
              </span>{" "}
              (con O₂).
            </div>

            <div style={{ marginTop: 8, fontSize: 14, color: COLORS.faint }}>
              El NADH transporta electrones a la cadena respiratoria.
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
