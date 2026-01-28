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

type ExercisePhase = {
  readonly id: string;
  readonly name: string;
  readonly duration: string;
  readonly cues: readonly string[];
  readonly musclesActive: readonly string[];
  readonly commonMistakes?: readonly string[];
};

type Exercise = {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly primaryMuscles: readonly string[];
  readonly secondaryMuscles: readonly string[];
  readonly equipment: string;
  readonly phases: readonly ExercisePhase[];
};

export type ExerciseBreakdownProps = {
  readonly language?: "es" | "en";
  readonly exercise?: Exercise;
};

const DEFAULT_EXERCISE: Exercise = {
  id: "squat",
  name: "Sentadilla con Barra",
  category: "Compuesto • Tren Inferior",
  primaryMuscles: ["Cuádriceps", "Glúteos"],
  secondaryMuscles: ["Isquiotibiales", "Core", "Erectores"],
  equipment: "Barra y rack",
  phases: [
    {
      id: "setup",
      name: "1. Posición Inicial",
      duration: "Setup",
      cues: [
        "Barra en trapecio alto o bajo",
        "Pies a la anchura de hombros",
        "Puntas ligeramente hacia afuera",
        "Pecho alto, mirada al frente",
      ],
      musclesActive: ["Core", "Erectores"],
      commonMistakes: ["Barra muy alta en el cuello", "Pies demasiado juntos"],
    },
    {
      id: "descent",
      name: "2. Descenso (Excéntrica)",
      duration: "2-3 seg",
      cues: [
        "Inicia con cadera hacia atrás",
        "Rodillas en línea con puntas",
        "Mantén espalda neutra",
        "Baja hasta paralelo o más",
      ],
      musclesActive: ["Cuádriceps", "Glúteos", "Isquiotibiales"],
      commonMistakes: ["Rodillas hacia dentro", "Redondear espalda baja"],
    },
    {
      id: "bottom",
      name: "3. Posición Baja",
      duration: "Pausa breve",
      cues: [
        "Muslos paralelos al suelo (mínimo)",
        "Peso en medio del pie",
        "Rodillas tracking sobre dedos",
        "Tensión en core mantenida",
      ],
      musclesActive: ["Cuádriceps", "Glúteos", "Core"],
      commonMistakes: ["Butt wink excesivo", "Talones que se levantan"],
    },
    {
      id: "ascent",
      name: "4. Ascenso (Concéntrica)",
      duration: "1-2 seg",
      cues: [
        "Empuja el suelo con los pies",
        "Activa glúteos conscientemente",
        "Sube pecho y cadera a la vez",
        "Bloquea arriba sin hiperextender",
      ],
      musclesActive: ["Cuádriceps", "Glúteos"],
      commonMistakes: ["Cadera sube antes que pecho", "Bloqueo agresivo"],
    },
  ],
};

const PhaseIndicator: React.FC<{
  readonly phases: readonly ExercisePhase[];
  readonly activeIndex: number;
}> = ({ phases, activeIndex }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        justifyContent: "center",
        marginBottom: 16,
      }}
    >
      {phases.map((phase, i) => {
        const isActive = i === activeIndex;
        const isPast = i < activeIndex;

        const dotAnim = spring({
          frame: frame - i * 4,
          fps,
          config: { damping: 18, mass: 0.6, stiffness: 140 },
          durationInFrames: secondsToFrames(0.5, fps),
        });

        return (
          <div
            key={phase.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              opacity: dotAnim,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: isActive
                  ? COLORS.accent2
                  : isPast
                    ? COLORS.accent
                    : "rgba(255,255,255,0.2)",
                boxShadow: isActive ? `0 0 12px ${COLORS.accent2}` : "none",
                transition: "all 0.3s ease",
              }}
            />
            {i < phases.length - 1 && (
              <div
                style={{
                  width: 30,
                  height: 2,
                  background: isPast
                    ? COLORS.accent
                    : "rgba(255,255,255,0.15)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

const CuesList: React.FC<{
  readonly cues: readonly string[];
  readonly color: string;
}> = ({ cues, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {cues.map((cue, i) => {
        const delay = i * 6;
        const anim = spring({
          frame: frame - delay,
          fps,
          config: { damping: 18, mass: 0.6, stiffness: 140 },
          durationInFrames: secondsToFrames(0.6, fps),
        });

        return (
          <div
            key={cue}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              opacity: anim,
              transform: `translateX(${interpolate(anim, [0, 1], [20, 0])}px)`,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: `${color}20`,
                border: `2px solid ${color}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 900,
                color,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <span
              style={{
                fontSize: 18,
                color: COLORS.text,
                lineHeight: 1.4,
              }}
            >
              {cue}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const MuscleChips: React.FC<{
  readonly muscles: readonly string[];
  readonly isPrimary: boolean;
}> = ({ muscles, isPrimary }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {muscles.map((muscle, i) => {
        const delay = i * 3;
        const anim = spring({
          frame: frame - delay,
          fps,
          config: { damping: 18, mass: 0.5, stiffness: 160 },
          durationInFrames: secondsToFrames(0.4, fps),
        });

        return (
          <div
            key={muscle}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              background: isPrimary
                ? `${COLORS.accent2}25`
                : "rgba(255,255,255,0.06)",
              border: `1px solid ${isPrimary ? COLORS.accent2 : "rgba(255,255,255,0.12)"}`,
              fontSize: 14,
              fontWeight: 700,
              color: isPrimary ? COLORS.accent2 : COLORS.muted,
              opacity: anim,
              transform: `scale(${interpolate(anim, [0, 1], [0.8, 1])})`,
            }}
          >
            {muscle}
          </div>
        );
      })}
    </div>
  );
};

const MistakesList: React.FC<{
  readonly mistakes: readonly string[];
}> = ({ mistakes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {mistakes.map((mistake, i) => {
        const delay = i * 5;
        const anim = spring({
          frame: frame - delay,
          fps,
          config: { damping: 18, mass: 0.6, stiffness: 140 },
          durationInFrames: secondsToFrames(0.5, fps),
        });

        return (
          <div
            key={mistake}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              opacity: anim,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: COLORS.danger,
              }}
            />
            <span style={{ fontSize: 14, color: COLORS.danger }}>
              {mistake}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export const ExerciseBreakdownExplainer: React.FC<ExerciseBreakdownProps> = ({
  language = "es",
  exercise = DEFAULT_EXERCISE,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const preIntro = Math.round(3.5 * fps);
  const intro = Math.round(2.0 * fps);
  const perPhase = Math.round(5.0 * fps);
  const outro = Math.round(2.5 * fps);

  const totalPhasesFrames = exercise.phases.length * perPhase;
  const phasesStart = preIntro + intro;
  const outroStart = phasesStart + totalPhasesFrames;

  const t = frame - phasesStart;
  const phaseIndex = Math.max(
    0,
    Math.min(exercise.phases.length - 1, Math.floor(t / perPhase)),
  );

  const fadeIn = interpolate(frame, [0, Math.round(0.7 * fps)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const outroProgress = clamp01((frame - outroStart) / outro);

  const isPreIntro = frame < preIntro;
  const isPhases = frame >= phasesStart && frame < outroStart;
  const isOutro = frame >= outroStart;

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

  const currentPhase = exercise.phases[phaseIndex];

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at 50% 35%, rgba(34,197,94,0.15), transparent 55%),
                     radial-gradient(900px 700px at 70% 65%, rgba(139,92,246,0.12), transparent 60%),
                     ${COLORS.bg}`,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: COLORS.text,
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: fadeIn }}>
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
            <div
              style={{ fontSize: 18, letterSpacing: 1.2, color: COLORS.faint }}
            >
              TÉCNICA • {exercise.category.toUpperCase()}
            </div>
            <div
              style={{
                marginTop: 14,
                fontSize: 54,
                fontWeight: 950,
                lineHeight: 1.05,
              }}
            >
              {exercise.name}
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 22,
                color: COLORS.muted,
                lineHeight: 1.35,
              }}
            >
              Desglose técnico paso a paso para ejecución perfecta
            </div>

            <div style={{ marginTop: 24 }}>
              <div
                style={{
                  fontSize: 14,
                  color: COLORS.faint,
                  marginBottom: 10,
                  letterSpacing: 1,
                }}
              >
                MÚSCULOS PRINCIPALES
              </div>
              <MuscleChips muscles={exercise.primaryMuscles} isPrimary={true} />
            </div>

            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  fontSize: 14,
                  color: COLORS.faint,
                  marginBottom: 10,
                  letterSpacing: 1,
                }}
              >
                MÚSCULOS SECUNDARIOS
              </div>
              <MuscleChips
                muscles={exercise.secondaryMuscles}
                isPrimary={false}
              />
            </div>

            <div
              style={{
                marginTop: 20,
                padding: "12px 20px",
                background: "rgba(255,255,255,0.06)",
                borderRadius: 12,
                display: "inline-block",
              }}
            >
              <span style={{ color: COLORS.faint }}>Equipamiento: </span>
              <span style={{ color: COLORS.text, fontWeight: 700 }}>
                {exercise.equipment}
              </span>
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
          <div
            style={{ fontSize: 18, letterSpacing: 1.2, color: COLORS.faint }}
          >
            TÉCNICA • {exercise.category.toUpperCase()}
          </div>
          <div
            style={{
              fontSize: 42,
              fontWeight: 900,
              lineHeight: 1.05,
              marginTop: 10,
            }}
          >
            {exercise.name}
          </div>
        </div>

        {/* Indicador de fases */}
        <div
          style={{
            position: "absolute",
            left: 56,
            right: 56,
            top: 180,
            opacity: isPreIntro ? 0 : 1,
          }}
        >
          <PhaseIndicator
            phases={exercise.phases}
            activeIndex={isPhases ? phaseIndex : -1}
          />
        </div>

        {/* Panel de fase actual */}
        <div
          style={{
            position: "absolute",
            left: 56,
            right: 56,
            top: 250,
            bottom: 80,
            opacity: isPhases ? panelOpacity : 0,
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
              height: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 20,
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
                  FASE {phaseIndex + 1} / {exercise.phases.length}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 36,
                    fontWeight: 950,
                    lineHeight: 1.1,
                    color: COLORS.accent2,
                  }}
                >
                  {currentPhase?.name}
                </div>
              </div>
              <div
                style={{
                  padding: "10px 18px",
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 12,
                }}
              >
                <span style={{ color: COLORS.faint, fontSize: 14 }}>
                  Tempo:{" "}
                </span>
                <span
                  style={{
                    color: COLORS.text,
                    fontWeight: 800,
                    fontSize: 16,
                  }}
                >
                  {currentPhase?.duration}
                </span>
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 14,
                  color: COLORS.faint,
                  letterSpacing: 1,
                  marginBottom: 12,
                }}
              >
                CLAVES TÉCNICAS
              </div>
              <CuesList
                cues={currentPhase?.cues ?? []}
                color={COLORS.accent2}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginTop: 20,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 14,
                    color: COLORS.faint,
                    letterSpacing: 1,
                    marginBottom: 8,
                  }}
                >
                  MÚSCULOS ACTIVOS
                </div>
                <MuscleChips
                  muscles={currentPhase?.musclesActive ?? []}
                  isPrimary={true}
                />
              </div>

              {currentPhase?.commonMistakes &&
                currentPhase.commonMistakes.length > 0 && (
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 14,
                        color: COLORS.danger,
                        letterSpacing: 1,
                        marginBottom: 8,
                      }}
                    >
                      ⚠️ ERRORES COMUNES
                    </div>
                    <MistakesList mistakes={currentPhase.commonMistakes} />
                  </div>
                )}
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
            <div
              style={{ fontSize: 18, color: COLORS.faint, letterSpacing: 1.1 }}
            >
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
              La técnica antes que el peso
            </div>
            <div
              style={{
                marginTop: 16,
                fontSize: 20,
                color: COLORS.muted,
                lineHeight: 1.4,
              }}
            >
              Domina cada fase del movimiento antes de añadir carga. La{" "}
              <span style={{ color: COLORS.accent2, fontWeight: 800 }}>
                calidad
              </span>{" "}
              del movimiento protege de lesiones y maximiza resultados.
            </div>
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  fontSize: 14,
                  color: COLORS.faint,
                  marginBottom: 8,
                }}
              >
                MÚSCULOS TRABAJADOS
              </div>
              <MuscleChips muscles={exercise.primaryMuscles} isPrimary={true} />
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
