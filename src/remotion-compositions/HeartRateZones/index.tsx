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

type HeartRateZone = {
  readonly id: string;
  readonly zone: number;
  readonly name: string;
  readonly percentHRMax: [number, number];
  readonly intensity: string;
  readonly benefits: readonly string[];
  readonly color: string;
  readonly duration: string;
};

export type HeartRateZonesProps = {
  readonly language?: "es" | "en";
  readonly maxHR?: number;
};

const ZONES: HeartRateZone[] = [
  {
    id: "zone1",
    zone: 1,
    name: "Recuperación Activa",
    percentHRMax: [50, 60],
    intensity: "Muy ligera",
    benefits: ["Recuperación", "Calentamiento", "Quema de grasa básica"],
    color: "#94A3B8", // Gris azulado
    duration: "30-60 min",
  },
  {
    id: "zone2",
    zone: 2,
    name: "Base Aeróbica",
    percentHRMax: [60, 70],
    intensity: "Ligera",
    benefits: ["Eficiencia cardiovascular", "Oxidación de grasas", "Resistencia base"],
    color: COLORS.cyan,
    duration: "45-90 min",
  },
  {
    id: "zone3",
    zone: 3,
    name: "Aeróbico",
    percentHRMax: [70, 80],
    intensity: "Moderada",
    benefits: ["Capacidad aeróbica", "Economía de carrera", "Umbral lactato"],
    color: COLORS.accent2,
    duration: "30-60 min",
  },
  {
    id: "zone4",
    zone: 4,
    name: "Umbral Anaeróbico",
    percentHRMax: [80, 90],
    intensity: "Alta",
    benefits: ["Tolerancia al lactato", "VO₂max", "Velocidad sostenida"],
    color: COLORS.warning,
    duration: "10-30 min",
  },
  {
    id: "zone5",
    zone: 5,
    name: "Máximo / VO₂max",
    percentHRMax: [90, 100],
    intensity: "Máxima",
    benefits: ["Potencia máxima", "Capacidad anaeróbica", "Sprint final"],
    color: COLORS.danger,
    duration: "1-5 min",
  },
];

const ZoneBar: React.FC<{
  readonly zone: HeartRateZone;
  readonly index: number;
  readonly isActive: boolean;
  readonly maxHR: number;
}> = ({ zone, index, isActive, maxHR }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  const delay = index * 8;
  const barAnim = spring({
    frame: frame - delay,
    fps,
    config: { damping: 18, mass: 0.7, stiffness: 120 },
    durationInFrames: secondsToFrames(0.8, fps),
  });

  const barHeight = (height * 0.08) * barAnim;
  const hrMin = Math.round(maxHR * (zone.percentHRMax[0] / 100));
  const hrMax = Math.round(maxHR * (zone.percentHRMax[1] / 100));

  const pulseAnim = isActive
    ? interpolate(
        frame % Math.round(fps * 0.8),
        [0, Math.round(fps * 0.4), Math.round(fps * 0.8)],
        [1, 1.02, 1],
      )
    : 1;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity: interpolate(barAnim, [0, 1], [0, 1]),
        transform: `translateX(${interpolate(barAnim, [0, 1], [-30, 0])}px) scale(${pulseAnim})`,
      }}
    >
      {/* Número de zona */}
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: 12,
          background: zone.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 28,
          fontWeight: 950,
          color: "#000",
          boxShadow: isActive ? `0 0 30px ${zone.color}50` : "none",
        }}
      >
        Z{zone.zone}
      </div>

      {/* Barra principal */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            height: barHeight,
            background: `linear-gradient(90deg, ${zone.color}90, ${zone.color}40)`,
            borderRadius: 8,
            border: isActive
              ? `2px solid ${zone.color}`
              : "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            paddingLeft: 16,
            paddingRight: 16,
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                color: "#fff",
                textShadow: "0 2px 4px rgba(0,0,0,0.5)",
              }}
            >
              {zone.name}
            </div>
            <div
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.8)",
                fontWeight: 600,
              }}
            >
              {zone.intensity}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: "#fff",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {hrMin}-{hrMax} bpm
            </div>
            <div
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.7)",
              }}
            >
              {zone.percentHRMax[0]}-{zone.percentHRMax[1]}% FCmáx
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const BenefitsList: React.FC<{
  readonly benefits: readonly string[];
  readonly color: string;
}> = ({ benefits, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {benefits.map((benefit, i) => {
        const delay = i * 6;
        const anim = spring({
          frame: frame - delay,
          fps,
          config: { damping: 18, mass: 0.6, stiffness: 140 },
          durationInFrames: secondsToFrames(0.6, fps),
        });

        return (
          <div
            key={benefit}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              opacity: interpolate(anim, [0, 1], [0, 1]),
              transform: `translateX(${interpolate(anim, [0, 1], [20, 0])}px)`,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: color,
              }}
            />
            <span style={{ fontSize: 18, color: COLORS.muted }}>
              {benefit}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export const HeartRateZonesExplainer: React.FC<HeartRateZonesProps> = ({
  language = "es",
  maxHR = 190,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const preIntro = Math.round(3.5 * fps);
  const intro = Math.round(2.0 * fps);
  const perZone = Math.round(4.0 * fps);
  const outro = Math.round(2.5 * fps);

  const totalZonesFrames = ZONES.length * perZone;
  const zonesStart = preIntro + intro;
  const outroStart = zonesStart + totalZonesFrames;

  const t = frame - zonesStart;
  const zoneIndex = Math.max(
    0,
    Math.min(ZONES.length - 1, Math.floor(t / perZone)),
  );

  const fadeIn = interpolate(frame, [0, Math.round(0.7 * fps)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const outroProgress = clamp01((frame - outroStart) / outro);

  const isPreIntro = frame < preIntro;
  const isZones = frame >= zonesStart && frame < outroStart;
  const isOutro = frame >= outroStart;

  const barsOpacity = isPreIntro
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

  const currentZone = ZONES[zoneIndex];

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at 50% 30%, rgba(251,113,133,0.15), transparent 55%),
                     radial-gradient(900px 700px at 70% 70%, rgba(34,197,94,0.10), transparent 60%),
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
            <div style={{ fontSize: 18, letterSpacing: 1.2, color: COLORS.faint }}>
              CARDIO • ENTRENAMIENTO
            </div>
            <div
              style={{
                marginTop: 14,
                fontSize: 54,
                fontWeight: 950,
                lineHeight: 1.05,
              }}
            >
              Zonas de Frecuencia Cardíaca
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 26,
                color: COLORS.muted,
                lineHeight: 1.35,
              }}
            >
              Entrena con{" "}
              <span style={{ color: COLORS.danger, fontWeight: 900 }}>
                intensidad precisa
              </span>{" "}
              según tu{" "}
              <span style={{ color: COLORS.accent2, fontWeight: 900 }}>
                frecuencia cardíaca máxima
              </span>
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
                FCmáx estimada (220 - edad)
              </div>
              <div
                style={{
                  fontSize: 42,
                  fontWeight: 950,
                  color: COLORS.danger,
                  marginTop: 4,
                }}
              >
                {maxHR} bpm
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
            ZONAS DE FC • {maxHR} BPM MÁXIMO
          </div>
          <div
            style={{
              fontSize: 42,
              fontWeight: 900,
              lineHeight: 1.05,
              marginTop: 10,
            }}
          >
            5 Zonas de Entrenamiento
          </div>
        </div>

        {/* Barras de zonas */}
        <div
          style={{
            position: "absolute",
            left: 56,
            right: 56,
            top: 200,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            opacity: barsOpacity,
          }}
        >
          {ZONES.map((zone, i) => (
            <ZoneBar
              key={zone.id}
              zone={zone}
              index={i}
              isActive={isZones && i === zoneIndex}
              maxHR={maxHR}
            />
          ))}
        </div>

        {/* Panel de beneficios */}
        <div
          style={{
            position: "absolute",
            left: 56,
            right: 56,
            bottom: 80,
            opacity: isZones ? panelOpacity : 0,
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
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 32,
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 14,
                  color: COLORS.faint,
                  letterSpacing: 1,
                  marginBottom: 8,
                }}
              >
                BENEFICIOS DE LA ZONA {currentZone?.zone}
              </div>
              <BenefitsList
                benefits={currentZone?.benefits ?? []}
                color={currentZone?.color ?? COLORS.text}
              />
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
                Duración recomendada
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: currentZone?.color,
                  marginTop: 4,
                }}
              >
                {currentZone?.duration}
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
              Usa las zonas para entrenar con propósito
            </div>
            <div
              style={{
                marginTop: 16,
                fontSize: 20,
                color: COLORS.muted,
                lineHeight: 1.4,
              }}
            >
              <span style={{ color: COLORS.cyan, fontWeight: 800 }}>
                Zona 2
              </span>{" "}
              para base aeróbica (80% del tiempo),{" "}
              <span style={{ color: COLORS.warning, fontWeight: 800 }}>
                Zona 4-5
              </span>{" "}
              para mejorar rendimiento (20%).
            </div>
            <div style={{ marginTop: 12, fontSize: 16, color: COLORS.faint }}>
              Distribuye: 80% bajo / 20% alto intensidad (modelo polarizado).
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
