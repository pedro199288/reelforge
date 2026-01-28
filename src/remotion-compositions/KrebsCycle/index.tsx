import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type Yield = {
  readonly nadh: number;
  readonly fadh2: number;
  readonly gtp: number;
  readonly co2: number;
};

type KrebsStep = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly reaction: string;
  readonly enzyme?: string;
  readonly yields: Yield;
};

export type KrebsCycleProps = {
  /**
   * Si quieres usarlo como plantilla, puedes personalizarlo.
   * Todo debe ser JSON-serializable para defaultProps.
   */
  readonly language?: "es" | "en";
  readonly showEnzymes?: boolean;
};

const STEPS_ES: KrebsStep[] = [
  {
    id: "condensation",
    title: "1) Condensación",
    subtitle: "Entrada del acetil‑CoA",
    reaction: "Oxaloacetato + Acetil‑CoA → Citrato",
    enzyme: "Citrato sintasa",
    yields: { nadh: 0, fadh2: 0, gtp: 0, co2: 0 },
  },
  {
    id: "isomerization",
    title: "2) Isomerización",
    subtitle: "Reordenamiento para oxidar",
    reaction: "Citrato ⇄ Isocitrato",
    enzyme: "Aconitasa",
    yields: { nadh: 0, fadh2: 0, gtp: 0, co2: 0 },
  },
  {
    id: "oxidative-decarboxylation-1",
    title: "3) 1ª descarboxilación oxidativa",
    subtitle: "Se libera CO₂ y se produce NADH",
    reaction: "Isocitrato → α‑Cetoglutarato + CO₂ + NADH",
    enzyme: "Isocitrato deshidrogenasa",
    yields: { nadh: 1, fadh2: 0, gtp: 0, co2: 1 },
  },
  {
    id: "oxidative-decarboxylation-2",
    title: "4) 2ª descarboxilación oxidativa",
    subtitle: "Más CO₂ y más NADH",
    reaction: "α‑Cetoglutarato → Succinil‑CoA + CO₂ + NADH",
    enzyme: "Complejo α‑cetoglutarato deshidrogenasa",
    yields: { nadh: 1, fadh2: 0, gtp: 0, co2: 1 },
  },
  {
    id: "substrate-level-phosphorylation",
    title: "5) Fosforilación a nivel de sustrato",
    subtitle: "Se captura energía como GTP/ATP",
    reaction: "Succinil‑CoA → Succinato + GTP(≈ATP)",
    enzyme: "Succinil‑CoA sintetasa",
    yields: { nadh: 0, fadh2: 0, gtp: 1, co2: 0 },
  },
  {
    id: "fadh2",
    title: "6) Oxidación (FADH₂)",
    subtitle: "Electrones a FAD",
    reaction: "Succinato → Fumarato + FADH₂",
    enzyme: "Succinato deshidrogenasa",
    yields: { nadh: 0, fadh2: 1, gtp: 0, co2: 0 },
  },
  {
    id: "hydration",
    title: "7) Hidratación",
    subtitle: "Entra agua para preparar oxidación final",
    reaction: "Fumarato → Malato",
    enzyme: "Fumarasa",
    yields: { nadh: 0, fadh2: 0, gtp: 0, co2: 0 },
  },
  {
    id: "nadh",
    title: "8) Oxidación (NADH) y regeneración",
    subtitle: "Vuelve el oxaloacetato",
    reaction: "Malato → Oxaloacetato + NADH",
    enzyme: "Malato deshidrogenasa",
    yields: { nadh: 1, fadh2: 0, gtp: 0, co2: 0 },
  },
];

const METABOLITES_ES = [
  "Oxaloacetato",
  "Citrato",
  "Isocitrato",
  "α‑Cetoglutarato",
  "Succinil‑CoA",
  "Succinato",
  "Fumarato",
  "Malato",
];

const BG = {
  base: "#070A12",
  panel: "rgba(255,255,255,0.06)",
  panelBorder: "rgba(255,255,255,0.10)",
  text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.70)",
  faint: "rgba(255,255,255,0.45)",
  accent: "#7C3AED",
  accent2: "#22C55E",
  danger: "#FB7185",
  warning: "#F59E0B",
};

const sumYields = (steps: KrebsStep[]) =>
  steps.reduce<Yield>(
    (acc, s) => ({
      nadh: acc.nadh + s.yields.nadh,
      fadh2: acc.fadh2 + s.yields.fadh2,
      gtp: acc.gtp + s.yields.gtp,
      co2: acc.co2 + s.yields.co2,
    }),
    { nadh: 0, fadh2: 0, gtp: 0, co2: 0 },
  );

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const MetricPill: React.FC<{
  readonly label: string;
  readonly value: number;
  readonly color: string;
}> = ({ label, value, color }) => {
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
      <div style={{ color: BG.muted, fontSize: 18, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ color, fontSize: 22, fontWeight: 800 }}>{value}</div>
    </div>
  );
};

const RingDiagram: React.FC<{
  readonly activeIndex: number;
  readonly progressInStep: number; // 0..1
}> = ({ activeIndex, progressInStep }) => {
  const { width, height } = useVideoConfig();
  const size = Math.min(width, height);
  const cx = width * 0.5;
  const cy = height * 0.5;
  const r = size * 0.22;
  const nodeR = size * 0.018;

  const points = useMemo(() => {
    const n = METABOLITES_ES.length;
    return METABOLITES_ES.map((_, i) => {
      // Start at top, go clockwise
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
  // Movimiento sobre el arco (circular), no lineal entre puntos
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
        <radialGradient id="krebsGlow" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="rgba(124,58,237,0.20)" />
          <stop offset="100%" stopColor="rgba(124,58,237,0.00)" />
        </radialGradient>
        <linearGradient id="krebsRing" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(34,197,94,0.85)" />
          <stop offset="50%" stopColor="rgba(124,58,237,0.95)" />
          <stop offset="100%" stopColor="rgba(251,113,133,0.80)" />
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

      {/* Soft center glow */}
      <circle cx={cx} cy={cy} r={r * 1.6} fill="url(#krebsGlow)" />

      {/* Main ring */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="url(#krebsRing)"
        strokeWidth={Math.max(6, Math.round(size * 0.006))}
        opacity={0.85}
      />

      {/* Nodes */}
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
              stroke={isActive ? BG.accent2 : "rgba(255,255,255,0.18)"}
              strokeWidth={Math.max(2, Math.round(size * 0.0025))}
              opacity={0.95}
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={nodeR * 2.6}
              fill={isActive ? "rgba(34,197,94,0.12)" : "rgba(124,58,237,0.08)"}
              opacity={glow}
            />
          </g>
        );
      })}

      {/* Moving marker */}
      <g filter="url(#softShadow)">
        <circle
          cx={arrowX}
          cy={arrowY}
          r={nodeR * 0.95}
          fill={BG.warning}
          stroke="rgba(255,255,255,0.30)"
          strokeWidth={Math.max(2, Math.round(size * 0.002))}
        />
      </g>
    </svg>
  );
};

export const KrebsCycleExplainer: React.FC<KrebsCycleProps> = ({
  language = "es",
  showEnzymes = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Timing
  // 1) Pantalla inicial: ¿qué es el ciclo de Krebs?
  const preIntro = Math.round(3.0 * fps);
  // 2) Entrada del diagrama antes de empezar a recorrerlo
  const intro = Math.round(2.0 * fps);
  // 3) Duración por paso (texto grande y legible)
  const perStep = Math.round(3.0 * fps);
  // 4) Cierre/resumen
  const outro = Math.round(2.0 * fps);

  const steps = STEPS_ES;
  const totalStepsFrames = steps.length * perStep;
  const stepsStart = preIntro + intro;
  const outroStart = stepsStart + totalStepsFrames;
  const endFrame = outroStart + outro;

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
  const tally = sumYields(steps.slice(0, stepsCompleted));
  const all = sumYields(steps);

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

  const safeLang = language; // placeholder por si se amplía a EN después
  void safeLang;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at 50% 40%, rgba(124,58,237,0.18), transparent 55%),
                     radial-gradient(900px 700px at 70% 60%, rgba(34,197,94,0.12), transparent 60%),
                     ${BG.base}`,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: BG.text,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: fadeIn,
        }}
      >
        <div style={{ opacity: ringOpacity }}>
          <RingDiagram
            activeIndex={diagramIndex}
            progressInStep={diagramProgress}
          />
        </div>

        {/* Pantalla inicial (antes de mostrar/recorrer el ciclo) */}
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
            <div style={{ fontSize: 18, letterSpacing: 1.2, color: BG.faint }}>
              BIOQUÍMICA • METABOLISMO ENERGÉTICO
            </div>
            <div
              style={{
                marginTop: 14,
                fontSize: 60,
                fontWeight: 950,
                lineHeight: 1.05,
              }}
            >
              ¿Qué es el ciclo de Krebs?
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 26,
                color: BG.muted,
                lineHeight: 1.35,
              }}
            >
              Es una ruta metabólica (cíclica) que oxida el{" "}
              <span style={{ color: BG.text, fontWeight: 900 }}>
                acetil‑CoA
              </span>{" "}
              para obtener energía en forma de{" "}
              <span style={{ color: BG.accent2, fontWeight: 900 }}>NADH</span> y{" "}
              <span style={{ color: BG.warning, fontWeight: 900 }}>FADH₂</span>.
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 20,
                color: BG.faint,
                lineHeight: 1.55,
              }}
            >
              - Ocurre en la matriz mitocondrial (en eucariotas).
              <br />- Libera{" "}
              <span style={{ color: BG.danger, fontWeight: 900 }}>CO₂</span>.
              <br />- Los electrones capturados alimentan la cadena respiratoria
              para producir ATP.
            </div>
          </div>
        </div>

        {/* Header (compacto) */}
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
          <div style={{ fontSize: 18, letterSpacing: 1.2, color: BG.faint }}>
            BIOQUÍMICA • METABOLISMO ENERGÉTICO
          </div>
          <div
            style={{
              fontSize: 52,
              fontWeight: 900,
              lineHeight: 1.05,
              marginTop: 10,
            }}
          >
            El ciclo de Krebs
          </div>
          <div style={{ fontSize: 22, color: BG.muted, marginTop: 12 }}>
            Una vuelta convierte el acetil‑CoA en{" "}
            <span style={{ color: BG.danger, fontWeight: 800 }}>CO₂</span> y
            produce{" "}
            <span style={{ color: BG.accent2, fontWeight: 800 }}>
              transportadores de electrones
            </span>{" "}
            para la cadena respiratoria.
          </div>
        </div>

        {/* Explicación del paso (grande y centrada) */}
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
              padding: 40,
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
            <div style={{ fontSize: 22, letterSpacing: 1.1, color: BG.faint }}>
              PASO {Math.min(stepIndex + 1, steps.length)} / {steps.length}
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 44,
                fontWeight: 950,
                lineHeight: 1.08,
              }}
            >
              {steps[stepIndex]?.title}
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 26,
                color: BG.muted,
                lineHeight: 1.25,
              }}
            >
              {steps[stepIndex]?.subtitle}
            </div>

            <div
              style={{
                marginTop: 18,
                fontSize: 26,
                color: BG.text,
                lineHeight: 1.35,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              }}
            >
              {steps[stepIndex]?.reaction}
            </div>

            {showEnzymes && steps[stepIndex]?.enzyme ? (
              <div style={{ marginTop: 14, color: BG.faint, fontSize: 20 }}>
                Enzima:{" "}
                <span style={{ color: BG.text, fontWeight: 800 }}>
                  {steps[stepIndex]?.enzyme}
                </span>
              </div>
            ) : null}

            <div
              style={{
                marginTop: 20,
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <MetricPill label="NADH" value={tally.nadh} color={BG.accent2} />
              <MetricPill
                label="FADH₂"
                value={tally.fadh2}
                color={BG.warning}
              />
              <MetricPill label="GTP" value={tally.gtp} color={BG.accent} />
              <MetricPill label="CO₂" value={tally.co2} color={BG.danger} />
            </div>

            <div style={{ marginTop: 18, color: BG.faint, fontSize: 16 }}>
              Idea clave: el{" "}
              <span style={{ color: BG.text, fontWeight: 800 }}>
                oxaloacetato se regenera
              </span>{" "}
              → por eso es un ciclo.
            </div>
          </div>
        </div>

        {/* Outro summary */}
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
            <div style={{ fontSize: 18, color: BG.faint, letterSpacing: 1.1 }}>
              RESUMEN (por 1 acetil‑CoA)
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 44,
                fontWeight: 950,
                lineHeight: 1.1,
              }}
            >
              Energía capturada en forma de NADH/FADH₂
            </div>

            <div
              style={{
                marginTop: 18,
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <MetricPill label="NADH" value={all.nadh} color={BG.accent2} />
              <MetricPill label="FADH₂" value={all.fadh2} color={BG.warning} />
              <MetricPill label="GTP" value={all.gtp} color={BG.accent} />
              <MetricPill label="CO₂" value={all.co2} color={BG.danger} />
            </div>

            <div style={{ marginTop: 18, fontSize: 18, color: BG.muted }}>
              Estos electrones alimentan la{" "}
              <span style={{ color: BG.text, fontWeight: 800 }}>
                cadena de transporte de electrones
              </span>{" "}
              para producir ATP.
            </div>

            <div style={{ marginTop: 8, fontSize: 14, color: BG.faint }}>
              Nota: el ciclo ocurre en la matriz mitocondrial (en eucariotas).
            </div>
          </div>
        </div>

        {/* Debug-ish safety: end fade */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: frame > endFrame ? 0 : 1,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
