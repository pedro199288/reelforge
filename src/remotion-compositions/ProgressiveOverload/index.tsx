import React, { useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  Easing,
  cancelRender,
  interpolate,
  spring,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import { DEFAULT_FONT, loadFont, type FontId } from "../../load-font";

const BG = {
  base: "#060812",
  panel: "rgba(255,255,255,0.06)",
  panelBorder: "rgba(255,255,255,0.10)",
  text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.70)",
  faint: "rgba(255,255,255,0.45)",
  accent: "#8B5CF6",
  accent2: "#22C55E",
  danger: "#FB7185",
  warning: "#F59E0B",
  cyan: "#06B6D4",
} as const;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const secondsToFrames = (s: number, fps: number) => Math.round(s * fps);

const Title: React.FC<{
  readonly kicker: string;
  readonly title: string;
  readonly subtitle: string;
}> = ({ kicker, title, subtitle }) => {
  return (
    <div style={{ padding: "54px 56px 0 56px" }}>
      <div style={{ fontSize: 18, letterSpacing: 1.2, color: BG.faint }}>
        {kicker}
      </div>
      <div
        style={{
          fontSize: 60,
          fontWeight: 950,
          lineHeight: 1.04,
          marginTop: 10,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 24, color: BG.muted, marginTop: 12 }}>
        {subtitle}
      </div>
    </div>
  );
};

const Pill: React.FC<{
  readonly label: string;
  readonly color: string;
}> = ({ label, color }) => {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        fontSize: 18,
        fontWeight: 800,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
};

const Panel: React.FC<{
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
}> = ({ children, style }) => {
  return (
    <div
      style={{
        background: BG.panel,
        border: `1px solid ${BG.panelBorder}`,
        borderRadius: 22,
        padding: 26,
        backdropFilter: "blur(10px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

const DecorativeGrid: React.FC = () => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const drift = interpolate(frame, [0, 10 * fps], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  const offsetX = interpolate(drift, [0, 1], [0, -36]);
  const offsetY = interpolate(drift, [0, 1], [0, 24]);

  const cell = 48;
  const cols = Math.ceil(width / cell) + 2;
  const rows = Math.ceil(height / cell) + 2;

  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, opacity: 0.35 }}
    >
      <defs>
        <linearGradient id="poGlow" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(139,92,246,0.50)" />
          <stop offset="50%" stopColor="rgba(34,197,94,0.35)" />
          <stop offset="100%" stopColor="rgba(6,182,212,0.35)" />
        </linearGradient>
      </defs>
      {Array.from({ length: rows }).flatMap((_, r) =>
        Array.from({ length: cols }).map((__, c) => {
          const x = c * cell + offsetX - cell;
          const y = r * cell + offsetY - cell;
          const inBounds = x < width + cell && y < height + cell;
          if (!inBounds) return null;
          return (
            <rect
              key={`${r}-${c}`}
              x={x}
              y={y}
              width={cell}
              height={cell}
              fill="none"
              stroke="url(#poGlow)"
              strokeOpacity={0.12}
              strokeWidth={1}
            />
          );
        }),
      )}
      <circle
        cx={width * 0.25}
        cy={height * 0.35}
        r={520}
        fill="rgba(139,92,246,0.10)"
      />
      <circle
        cx={width * 0.75}
        cy={height * 0.6}
        r={460}
        fill="rgba(34,197,94,0.08)"
      />
    </svg>
  );
};

const IntroSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const appear = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: secondsToFrames(0.9, fps),
  });

  const y = interpolate(appear, [0, 1], [18, 0]);
  const opacity = interpolate(frame, [0, secondsToFrames(0.6, fps)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ opacity }}>
      <Title
        kicker="ENTRENAMIENTO • FUERZA • HIPERTROFIA"
        title="Sobrecarga progresiva"
        subtitle="El principio que convierte sesiones… en progreso."
      />
      <div
        style={{
          position: "absolute",
          left: 56,
          right: 56,
          top: 340,
          transform: `translateY(${y}px)`,
        }}
      >
        <Panel>
          <div style={{ fontSize: 24, fontWeight: 900, color: BG.text }}>
            Idea central
          </div>
          <div
            style={{
              marginTop: 12,
              fontSize: 22,
              color: BG.muted,
              lineHeight: 1.35,
            }}
          >
            Si el estímulo de hoy es{" "}
            <span style={{ color: BG.accent2, fontWeight: 900 }}>igual</span> al
            de siempre, tu cuerpo se adapta… y luego se estanca.
          </div>
          <div
            style={{
              marginTop: 16,
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <Pill label="Estímulo ↑" color={BG.accent2} />
            <Pill label="Adaptación ↑" color={BG.accent} />
            <Pill label="Resultado ↑" color={BG.cyan} />
          </div>
        </Panel>
      </div>
    </AbsoluteFill>
  );
};

const WhatCountsSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fade = interpolate(frame, [0, secondsToFrames(0.6, fps)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const items = useMemo(
    () => [
      {
        title: "Carga",
        desc: "Más kg con la misma técnica.",
        color: BG.accent2,
      },
      {
        title: "Reps",
        desc: "Más repeticiones con el mismo peso.",
        color: BG.cyan,
      },
      {
        title: "Series",
        desc: "Más trabajo total (volumen).",
        color: BG.accent,
      },
      {
        title: "Densidad",
        desc: "Mismo trabajo en menos tiempo.",
        color: BG.warning,
      },
    ],
    [],
  );

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Title
        kicker="¿QUÉ SIGNIFICA “PROGRESAR”?"
        title="Formas de sobrecarga"
        subtitle="No es solo subir peso. Es aumentar el estímulo de forma medible."
      />
      <div
        style={{
          position: "absolute",
          left: 56,
          right: 56,
          top: 330,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        {items.map((it, i) => {
          const delay = i * 6;
          const inAnim = spring({
            frame: frame - delay,
            fps,
            config: { damping: 200 },
            durationInFrames: secondsToFrames(0.8, fps),
          });

          const y = interpolate(inAnim, [0, 1], [14, 0]);
          const o = interpolate(inAnim, [0, 1], [0, 1]);
          return (
            <Panel
              key={it.title}
              style={{
                opacity: o,
                transform: `translateY(${y}px)`,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <div style={{ fontSize: 26, fontWeight: 950, color: it.color }}>
                  {it.title}
                </div>
                <div style={{ fontSize: 16, color: BG.faint }}>palanca</div>
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 20,
                  color: BG.muted,
                  lineHeight: 1.35,
                }}
              >
                {it.desc}
              </div>
            </Panel>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          left: 56,
          right: 56,
          bottom: 70,
          fontSize: 18,
          color: BG.faint,
          lineHeight: 1.4,
        }}
      >
        Consejo práctico: progresa una variable a la vez (y mantén el resto
        estable).
      </div>
    </AbsoluteFill>
  );
};

type WeekPoint = {
  readonly week: string;
  readonly loadKg: number;
  readonly reps: number;
  readonly sets: number;
};

const BarChart: React.FC<{
  readonly data: WeekPoint[];
  readonly title: string;
  readonly subtitle: string;
}> = ({ data, title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const max = Math.max(...data.map((d) => d.loadKg));
  const min = Math.min(...data.map((d) => d.loadKg));
  const range = Math.max(1, max - min);

  const duration = secondsToFrames(5.5, fps);
  const progress = clamp01(frame / duration);
  const activeIndex = Math.min(
    data.length - 1,
    Math.floor(
      interpolate(progress, [0, 1], [0, data.length], {
        extrapolateRight: "clamp",
      }),
    ),
  );

  return (
    <Panel style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontSize: 26, fontWeight: 950, color: BG.text }}>
          {title}
        </div>
        <div style={{ fontSize: 16, color: BG.faint }}>{subtitle}</div>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <Pill label="Objetivo: +2.5kg" color={BG.accent2} />
        <div style={{ color: BG.faint, fontSize: 16 }}>
          cuando completas todas las series con técnica y RIR similar
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          height: 420,
          display: "grid",
          gridTemplateColumns: `repeat(${data.length}, 1fr)`,
          gap: 12,
          alignItems: "end",
        }}
      >
        {data.map((d, i) => {
          const delay = i * 6;
          const grow = spring({
            frame: frame - delay,
            fps,
            config: { damping: 200 },
            durationInFrames: secondsToFrames(1.0, fps),
          });

          const norm = (d.loadKg - min) / range;
          const h = 110 + norm * 280;
          const height = h * clamp01(grow);

          const isActive = i === activeIndex;
          const border = isActive
            ? "rgba(255,255,255,0.30)"
            : "rgba(255,255,255,0.10)";
          const fill = isActive
            ? "rgba(34,197,94,0.28)"
            : "rgba(139,92,246,0.20)";

          const labelIn = spring({
            frame: frame - delay - 8,
            fps,
            config: { damping: 200 },
            durationInFrames: secondsToFrames(0.6, fps),
          });

          const labelOpacity = interpolate(labelIn, [0, 1], [0, 1]);
          const labelY = interpolate(labelIn, [0, 1], [10, 0]);

          return (
            <div
              key={d.week}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                gap: 10,
              }}
            >
              <div
                style={{
                  height: 28,
                  opacity: labelOpacity,
                  transform: `translateY(${labelY}px)`,
                  color: isActive ? BG.accent2 : BG.faint,
                  fontWeight: 900,
                  fontSize: 18,
                  textAlign: "center",
                }}
              >
                {d.loadKg.toFixed(1)}kg
              </div>
              <div
                style={{
                  height,
                  borderRadius: 16,
                  background: fill,
                  border: `1px solid ${border}`,
                  boxShadow: isActive
                    ? "0 16px 40px rgba(34,197,94,0.16)"
                    : "none",
                }}
              />
              <div
                style={{ color: BG.faint, textAlign: "center", fontSize: 16 }}
              >
                {d.week}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          color: BG.muted,
          fontSize: 18,
        }}
      >
        <div>
          Ejemplo (sentadilla):{" "}
          <span style={{ color: BG.text, fontWeight: 900 }}>
            {data[activeIndex]?.sets}×{data[activeIndex]?.reps}
          </span>{" "}
          a{" "}
          <span style={{ color: BG.accent2, fontWeight: 900 }}>
            {data[activeIndex]?.loadKg.toFixed(1)}kg
          </span>
        </div>
        <div style={{ color: BG.faint }}>
          Semana activa: {data[activeIndex]?.week}
        </div>
      </div>
    </Panel>
  );
};

const ExampleSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fade = interpolate(frame, [0, secondsToFrames(0.6, fps)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const data: WeekPoint[] = useMemo(
    () => [
      { week: "W1", loadKg: 60, reps: 8, sets: 3 },
      { week: "W2", loadKg: 62.5, reps: 8, sets: 3 },
      { week: "W3", loadKg: 65, reps: 8, sets: 3 },
      { week: "W4", loadKg: 67.5, reps: 8, sets: 3 },
      { week: "W5", loadKg: 70, reps: 8, sets: 3 },
      { week: "W6", loadKg: 72.5, reps: 8, sets: 3 },
    ],
    [],
  );

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Title
        kicker="APLICACIÓN PRÁCTICA"
        title="Ejemplo de progresión"
        subtitle="Pequeñas subidas sostenidas (mejor que cambios enormes)."
      />
      <div
        style={{
          position: "absolute",
          left: 56,
          right: 56,
          top: 320,
        }}
      >
        <BarChart
          data={data}
          title="Carga por semana"
          subtitle="mismo esquema (3×8)"
        />
      </div>
    </AbsoluteFill>
  );
};

const RulesSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fade = interpolate(frame, [0, secondsToFrames(0.6, fps)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const bullets = useMemo(
    () => [
      {
        k: "Primero calidad",
        v: "Si la técnica se degrada, no es progreso: es compensación.",
        c: BG.cyan,
      },
      {
        k: "Rango de reps",
        v: "Usa un rango (p.ej. 6–10). Cuando llegas arriba, sube peso.",
        c: BG.accent2,
      },
      {
        k: "Recuperación manda",
        v: "Sin sueño/comida/descanso, la sobrecarga no se “convierte” en adaptación.",
        c: BG.warning,
      },
      {
        k: "Deload (a veces)",
        v: "Baja volumen 1 semana si acumulas fatiga y el rendimiento cae.",
        c: BG.danger,
      },
    ],
    [],
  );

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Title
        kicker="REGLAS PARA QUE FUNCIONE"
        title="Progresar sin romperte"
        subtitle="La sobrecarga es dosis. La dosis correcta es sostenible."
      />
      <div
        style={{
          position: "absolute",
          left: 56,
          right: 56,
          top: 320,
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 14,
        }}
      >
        {bullets.map((b, i) => {
          const delay = i * 5;
          const inAnim = spring({
            frame: frame - delay,
            fps,
            config: { damping: 200 },
            durationInFrames: secondsToFrames(0.7, fps),
          });
          const y = interpolate(inAnim, [0, 1], [12, 0]);
          const o = interpolate(inAnim, [0, 1], [0, 1]);

          return (
            <Panel
              key={b.k}
              style={{
                display: "flex",
                gap: 16,
                opacity: o,
                transform: `translateY(${y}px)`,
              }}
            >
              <div
                style={{
                  width: 12,
                  borderRadius: 999,
                  background: b.c,
                  opacity: 0.9,
                }}
              />
              <div>
                <div style={{ fontSize: 22, fontWeight: 950, color: BG.text }}>
                  {b.k}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 20,
                    color: BG.muted,
                    lineHeight: 1.35,
                  }}
                >
                  {b.v}
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const OutroSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const inAnim = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: secondsToFrames(0.9, fps),
  });

  const scale = interpolate(inAnim, [0, 1], [0.98, 1]);
  const opacity = interpolate(frame, [0, secondsToFrames(0.6, fps)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ opacity }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Panel
          style={{ width: 900, transform: `scale(${scale})`, padding: 34 }}
        >
          <div style={{ fontSize: 18, letterSpacing: 1.2, color: BG.faint }}>
            RESUMEN EN 1 FRASE
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 46,
              fontWeight: 950,
              lineHeight: 1.1,
            }}
          >
            Aumenta el estímulo{" "}
            <span style={{ color: BG.accent2 }}>poco a poco</span>…
            <br />
            para poder repetirlo{" "}
            <span style={{ color: BG.cyan }}>mucho tiempo</span>.
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 20,
              color: BG.muted,
              lineHeight: 1.4,
            }}
          >
            Mide, ajusta, recupera y repite. Eso es sobrecarga progresiva.
          </div>
          <div
            style={{
              marginTop: 18,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Pill label="Consistencia" color={BG.cyan} />
            <Pill label="Técnica" color={BG.accent2} />
            <Pill label="Recuperación" color={BG.warning} />
          </div>
        </Panel>
      </div>
    </AbsoluteFill>
  );
};

export type ProgressiveOverloadProps = {
  readonly fontFamily?: FontId;
};

export const ProgressiveOverloadExplainer: React.FC<
  ProgressiveOverloadProps
> = ({ fontFamily = DEFAULT_FONT }) => {
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender());

  useEffect(() => {
    loadFont(fontFamily)
      .then(() => continueRender(handle))
      .catch((e) => cancelRender(e));
  }, [continueRender, fontFamily, handle]);

  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();

  // Timeline (total = 20s @ 30fps = 600 frames en Root)
  const intro = secondsToFrames(3.0, fps);
  const whatCounts = secondsToFrames(4.0, fps);
  const example = secondsToFrames(8.0, fps);
  const rules = secondsToFrames(4.0, fps);
  const outro = secondsToFrames(1.0, fps);

  const endFrame = intro + whatCounts + example + rules + outro;

  const fadeOut = interpolate(
    frame,
    [endFrame - secondsToFrames(0.6, fps), endFrame],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    },
  );

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 900px at 50% 35%, rgba(139,92,246,0.18), transparent 55%),
                     radial-gradient(900px 700px at 70% 65%, rgba(34,197,94,0.12), transparent 60%),
                     radial-gradient(900px 700px at 20% 75%, rgba(6,182,212,0.10), transparent 60%),
                     ${BG.base}`,
        color: BG.text,
        fontFamily: `${fontFamily}, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`,
      }}
    >
      <DecorativeGrid />

      {/* Slides */}
      <AbsoluteFill style={{ opacity: fadeOut }}>
        <SlideSequence from={0} durationInFrames={intro}>
          <IntroSlide />
        </SlideSequence>
        <SlideSequence from={intro} durationInFrames={whatCounts}>
          <WhatCountsSlide />
        </SlideSequence>
        <SlideSequence from={intro + whatCounts} durationInFrames={example}>
          <ExampleSlide />
        </SlideSequence>
        <SlideSequence
          from={intro + whatCounts + example}
          durationInFrames={rules}
        >
          <RulesSlide />
        </SlideSequence>
        <SlideSequence
          from={intro + whatCounts + example + rules}
          durationInFrames={outro}
        >
          <OutroSlide />
        </SlideSequence>
      </AbsoluteFill>

      {/* Minimal watermark / footer */}
      <div
        style={{
          position: "absolute",
          left: 56,
          bottom: 26,
          fontSize: 14,
          color: BG.faint,
          letterSpacing: 0.3,
        }}
      >
        reelforge • principio: sobrecarga progresiva
      </div>
    </AbsoluteFill>
  );
};

const SlideSequence: React.FC<{
  readonly from: number;
  readonly durationInFrames: number;
  readonly children: React.ReactNode;
}> = ({ from, durationInFrames, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const local = frame - from;
  const inOpacity = interpolate(local, [0, secondsToFrames(0.5, fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const outOpacity = interpolate(
    local,
    [durationInFrames - secondsToFrames(0.45, fps), durationInFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    },
  );

  const opacity = inOpacity * outOpacity;
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export type { ProgressiveOverloadGraphsProps } from "./Graphs";
export { ProgressiveOverloadGraphsExplainer } from "./Graphs";
