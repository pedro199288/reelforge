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

type ContractionStep = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly detail: string;
  readonly molecules: readonly string[];
};

export type MuscleContractionProps = {
  readonly language?: "es" | "en";
};

const STEPS_ES: ContractionStep[] = [
  {
    id: "nerve-signal",
    title: "1) Señal nerviosa",
    subtitle: "El impulso llega a la unión neuromuscular",
    detail: "El potencial de acción viaja por la motoneurona hasta el terminal axónico.",
    molecules: ["Acetilcolina", "Ca²⁺"],
  },
  {
    id: "calcium-release",
    title: "2) Liberación de Ca²⁺",
    subtitle: "El retículo sarcoplásmico libera calcio",
    detail: "El Ca²⁺ se une a la troponina C, provocando un cambio conformacional.",
    molecules: ["Ca²⁺", "Troponina C"],
  },
  {
    id: "binding-sites-exposed",
    title: "3) Exposición de sitios activos",
    subtitle: "La tropomiosina se desplaza",
    detail: "Los sitios de unión en la actina quedan expuestos para las cabezas de miosina.",
    molecules: ["Tropomiosina", "Actina"],
  },
  {
    id: "cross-bridge",
    title: "4) Formación del puente cruzado",
    subtitle: "La miosina se une a la actina",
    detail: "Las cabezas de miosina (con ADP+Pi) se unen a los sitios activos de actina.",
    molecules: ["Miosina", "Actina", "ADP", "Pi"],
  },
  {
    id: "power-stroke",
    title: "5) Golpe de fuerza",
    subtitle: "El deslizamiento que genera tensión",
    detail: "La liberación de Pi y ADP provoca el pivoteo de la cabeza de miosina (45°).",
    molecules: ["ADP", "Pi"],
  },
  {
    id: "atp-binding",
    title: "6) Unión de ATP",
    subtitle: "Se rompe el puente cruzado",
    detail: "El ATP se une a la miosina, reduciendo su afinidad por la actina.",
    molecules: ["ATP"],
  },
  {
    id: "atp-hydrolysis",
    title: "7) Hidrólisis de ATP",
    subtitle: "La miosina se \"recarga\"",
    detail: "ATP → ADP + Pi. La energía re-posiciona la cabeza de miosina (ángulo 90°).",
    molecules: ["ATP", "ADP", "Pi"],
  },
  {
    id: "cycle-repeat",
    title: "8) Repetición del ciclo",
    subtitle: "Mientras haya Ca²⁺ y ATP disponibles",
    detail: "El sarcómero se acorta progresivamente con cada ciclo de puentes cruzados.",
    molecules: ["Ca²⁺", "ATP"],
  },
];

const MoleculePill: React.FC<{
  readonly name: string;
  readonly delay: number;
}> = ({ name, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const anim = spring({
    frame: frame - delay,
    fps,
    config: { damping: 18, mass: 0.6, stiffness: 140 },
    durationInFrames: secondsToFrames(0.6, fps),
  });

  const colors: Record<string, string> = {
    "Ca²⁺": COLORS.warning,
    ATP: COLORS.accent2,
    ADP: COLORS.cyan,
    Pi: COLORS.muted,
    Actina: COLORS.danger,
    Miosina: COLORS.accent,
    Acetilcolina: COLORS.warning,
    "Troponina C": COLORS.cyan,
    Troponina: COLORS.cyan,
    Tropomiosina: COLORS.accent,
  };

  return (
    <div
      style={{
        padding: "8px 14px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        fontSize: 16,
        fontWeight: 700,
        color: colors[name] || COLORS.text,
        opacity: interpolate(anim, [0, 1], [0, 1]),
        transform: `translateY(${interpolate(anim, [0, 1], [10, 0])}px)`,
      }}
    >
      {name}
    </div>
  );
};

const SarcomereDiagram: React.FC<{
  readonly contractionLevel: number; // 0-1 (0=relajado, 1=contraído)
  readonly activePhase: number;
}> = ({ contractionLevel, activePhase }) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cx = width * 0.5;
  const cy = height * 0.48;
  const baseWidth = width * 0.7;
  const sarcWidth = baseWidth * (1 - contractionLevel * 0.35);
  const sarcHeight = height * 0.18;

  const zLineX1 = cx - sarcWidth / 2;
  const zLineX2 = cx + sarcWidth / 2;

  const pulseAnim = interpolate(
    frame % Math.round(fps * 0.8),
    [0, Math.round(fps * 0.4), Math.round(fps * 0.8)],
    [0, 1, 0],
  );

  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, opacity: 0.9 }}
    >
      <defs>
        <linearGradient id="actinGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="rgba(251,113,133,0.7)" />
          <stop offset="100%" stopColor="rgba(251,113,133,0.3)" />
        </linearGradient>
        <linearGradient id="myosinGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="rgba(139,92,246,0.4)" />
          <stop offset="50%" stopColor="rgba(139,92,246,0.8)" />
          <stop offset="100%" stopColor="rgba(139,92,246,0.4)" />
        </linearGradient>
        <filter id="sarcGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
        </filter>
      </defs>

      {/* Líneas Z */}
      <line
        x1={zLineX1}
        y1={cy - sarcHeight / 2}
        x2={zLineX1}
        y2={cy + sarcHeight / 2}
        stroke={COLORS.text}
        strokeWidth={4}
        opacity={0.9}
      />
      <line
        x1={zLineX2}
        y1={cy - sarcHeight / 2}
        x2={zLineX2}
        y2={cy + sarcHeight / 2}
        stroke={COLORS.text}
        strokeWidth={4}
        opacity={0.9}
      />

      {/* Línea M (centro) */}
      <line
        x1={cx}
        y1={cy - sarcHeight / 2 + 10}
        x2={cx}
        y2={cy + sarcHeight / 2 - 10}
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={2}
        strokeDasharray="8 4"
      />

      {/* Filamentos de actina (delgados) - desde líneas Z */}
      {[-1, 1].map((side) => (
        <React.Fragment key={side}>
          {[0.25, 0.5, 0.75].map((yOff, i) => {
            const actinLength = sarcWidth * 0.38;
            const startX = side === -1 ? zLineX1 : zLineX2;
            const endX = side === -1 ? zLineX1 + actinLength : zLineX2 - actinLength;
            const y = cy - sarcHeight / 2 + sarcHeight * yOff;
            return (
              <line
                key={`actin-${side}-${i}`}
                x1={startX}
                y1={y}
                x2={endX}
                y2={y}
                stroke="url(#actinGrad)"
                strokeWidth={6}
                strokeLinecap="round"
                opacity={activePhase >= 3 ? 0.9 + pulseAnim * 0.1 : 0.7}
              />
            );
          })}
        </React.Fragment>
      ))}

      {/* Filamentos de miosina (gruesos) - centro */}
      {[0.25, 0.5, 0.75].map((yOff, i) => {
        const myosinLength = sarcWidth * 0.5;
        const y = cy - sarcHeight / 2 + sarcHeight * yOff;
        return (
          <line
            key={`myosin-${i}`}
            x1={cx - myosinLength / 2}
            y1={y}
            x2={cx + myosinLength / 2}
            y2={y}
            stroke="url(#myosinGrad)"
            strokeWidth={12}
            strokeLinecap="round"
            filter={activePhase >= 4 ? "url(#sarcGlow)" : undefined}
          />
        );
      })}

      {/* Cabezas de miosina (puentes cruzados) */}
      {activePhase >= 4 && (
        <>
          {[-1, 1].map((side) =>
            [0.25, 0.5, 0.75].map((yOff, i) => {
              const y = cy - sarcHeight / 2 + sarcHeight * yOff;
              const headX =
                side === -1
                  ? cx - sarcWidth * 0.2 - (activePhase >= 5 ? 15 : 0)
                  : cx + sarcWidth * 0.2 + (activePhase >= 5 ? 15 : 0);
              const angle = activePhase >= 5 ? (side === -1 ? -45 : 45) : side === -1 ? -90 : 90;
              return (
                <g
                  key={`head-${side}-${i}`}
                  transform={`translate(${headX}, ${y}) rotate(${angle})`}
                >
                  <ellipse
                    cx={0}
                    cy={-8}
                    rx={6}
                    ry={10}
                    fill={COLORS.accent}
                    opacity={0.9 + pulseAnim * 0.1}
                  />
                </g>
              );
            }),
          )}
        </>
      )}

      {/* Etiquetas */}
      <text
        x={zLineX1}
        y={cy + sarcHeight / 2 + 30}
        fill={COLORS.faint}
        fontSize={16}
        fontWeight={700}
        textAnchor="middle"
      >
        Línea Z
      </text>
      <text
        x={zLineX2}
        y={cy + sarcHeight / 2 + 30}
        fill={COLORS.faint}
        fontSize={16}
        fontWeight={700}
        textAnchor="middle"
      >
        Línea Z
      </text>
      <text
        x={cx}
        y={cy + sarcHeight / 2 + 30}
        fill={COLORS.faint}
        fontSize={14}
        fontWeight={600}
        textAnchor="middle"
      >
        Línea M
      </text>
    </svg>
  );
};

export const MuscleContractionExplainer: React.FC<MuscleContractionProps> = ({
  language = "es",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const preIntro = Math.round(3.5 * fps);
  const intro = Math.round(2.0 * fps);
  const perStep = Math.round(3.2 * fps);
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

  const outroProgress = clamp01((frame - outroStart) / outro);

  const isPreIntro = frame < preIntro;
  const isSteps = frame >= stepsStart && frame < outroStart;
  const isOutro = frame >= outroStart;

  // Nivel de contracción progresivo
  const contractionLevel = isSteps
    ? clamp01((stepIndex + stepProgress) / steps.length)
    : isOutro
      ? 1
      : 0;

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

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at 50% 40%, rgba(139,92,246,0.18), transparent 55%),
                     radial-gradient(900px 700px at 70% 60%, rgba(251,113,133,0.12), transparent 60%),
                     ${COLORS.bg}`,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: COLORS.text,
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: fadeIn }}>
        <div style={{ opacity: diagramOpacity }}>
          <SarcomereDiagram
            contractionLevel={contractionLevel}
            activePhase={isSteps ? stepIndex : 0}
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
              FISIOLOGÍA • SISTEMA MUSCULAR
            </div>
            <div
              style={{
                marginTop: 14,
                fontSize: 54,
                fontWeight: 950,
                lineHeight: 1.05,
              }}
            >
              Contracción Muscular
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 26,
                color: COLORS.muted,
                lineHeight: 1.35,
              }}
            >
              El ciclo de puentes cruzados:{" "}
              <span style={{ color: COLORS.accent, fontWeight: 900 }}>
                miosina
              </span>{" "}
              +{" "}
              <span style={{ color: COLORS.danger, fontWeight: 900 }}>
                actina
              </span>{" "}
              +{" "}
              <span style={{ color: COLORS.accent2, fontWeight: 900 }}>
                ATP
              </span>
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 20,
                color: COLORS.faint,
                lineHeight: 1.55,
              }}
            >
              - Ocurre en el{" "}
              <span style={{ color: COLORS.text, fontWeight: 900 }}>
                sarcómero
              </span>
              , la unidad funcional del músculo.
              <br />- Requiere{" "}
              <span style={{ color: COLORS.warning, fontWeight: 900 }}>
                Ca²⁺
              </span>{" "}
              y{" "}
              <span style={{ color: COLORS.accent2, fontWeight: 900 }}>
                ATP
              </span>
              .
              <br />- Los filamentos se deslizan sin acortarse (teoría del
              deslizamiento).
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
            FISIOLOGÍA • CONTRACCIÓN MUSCULAR
          </div>
          <div
            style={{
              fontSize: 44,
              fontWeight: 900,
              lineHeight: 1.05,
              marginTop: 10,
            }}
          >
            Ciclo de puentes cruzados
          </div>
        </div>

        {/* Panel del paso actual */}
        <div
          style={{
            position: "absolute",
            left: 56,
            right: 56,
            bottom: 80,
            opacity: isSteps ? panelOpacity : 0,
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
                  PASO {stepIndex + 1} / {steps.length}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 32,
                    fontWeight: 950,
                    lineHeight: 1.1,
                  }}
                >
                  {steps[stepIndex]?.title}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 20,
                    color: COLORS.muted,
                  }}
                >
                  {steps[stepIndex]?.subtitle}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 18,
                    color: COLORS.faint,
                    lineHeight: 1.4,
                  }}
                >
                  {steps[stepIndex]?.detail}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {steps[stepIndex]?.molecules.map((mol, i) => (
                <MoleculePill key={mol} name={mol} delay={i * 4} />
              ))}
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
              El sarcómero se acorta por deslizamiento
            </div>
            <div
              style={{
                marginTop: 16,
                fontSize: 20,
                color: COLORS.muted,
                lineHeight: 1.4,
              }}
            >
              Cada ciclo de puentes cruzados mueve la actina ~10 nm hacia el
              centro. Miles de ciclos por segundo producen la fuerza muscular.
            </div>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <MoleculePill name="Ca²⁺" delay={0} />
              <MoleculePill name="ATP" delay={4} />
              <MoleculePill name="Actina" delay={8} />
              <MoleculePill name="Miosina" delay={12} />
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
