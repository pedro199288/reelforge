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

type ChartRect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const secondsToFrames = (s: number, fps: number) => Math.round(s * fps);

const Panel: React.FC<{ readonly children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <div
      style={{
        background: BG.panel,
        border: `1px solid ${BG.panelBorder}`,
        borderRadius: 22,
        padding: 26,
        backdropFilter: "blur(10px)",
      }}
    >
      {children}
    </div>
  );
};

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
          color: BG.text,
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

const SvgLabel: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly color?: string;
  readonly size?: number;
  readonly weight?: number;
  readonly opacity?: number;
  readonly anchor?: "start" | "middle" | "end";
}> = ({
  x,
  y,
  text,
  color = BG.text,
  size = 18,
  weight = 900,
  opacity = 1,
  anchor = "start",
}) => {
  return (
    <text
      x={x}
      y={y}
      fill={color}
      fontSize={size}
      fontWeight={weight}
      textAnchor={anchor}
      style={{ opacity }}
    >
      {text}
    </text>
  );
};

const Axes: React.FC<{
  readonly rect: ChartRect;
  readonly xLabel: string;
  readonly yLabel: string;
  readonly opacity?: number;
}> = ({ rect, xLabel, yLabel, opacity = 1 }) => {
  const axis = "rgba(255,255,255,0.28)";
  const grid = "rgba(255,255,255,0.10)";
  const base = rect.y + rect.h * 0.55;

  return (
    <g style={{ opacity }}>
      {Array.from({ length: 4 }).map((_, i) => {
        const t = (i + 1) / 5;
        const y = rect.y + rect.h * t;
        return (
          <line
            key={i}
            x1={rect.x}
            x2={rect.x + rect.w}
            y1={y}
            y2={y}
            stroke={grid}
            strokeWidth={1}
          />
        );
      })}

      <line
        x1={rect.x}
        x2={rect.x}
        y1={rect.y}
        y2={rect.y + rect.h}
        stroke={axis}
        strokeWidth={3}
      />
      <line
        x1={rect.x}
        x2={rect.x + rect.w}
        y1={rect.y + rect.h}
        y2={rect.y + rect.h}
        stroke={axis}
        strokeWidth={3}
      />

      <line
        x1={rect.x}
        x2={rect.x + rect.w}
        y1={base}
        y2={base}
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={2}
      />

      <SvgLabel
        x={rect.x + rect.w * 0.5}
        y={rect.y + rect.h + 56}
        text={xLabel}
        color={BG.faint}
        size={20}
        weight={950}
        anchor="middle"
      />
      <SvgLabel
        x={rect.x - 66}
        y={rect.y + rect.h * 0.5}
        text={yLabel}
        color={BG.faint}
        size={20}
        weight={950}
        anchor="middle"
      />
    </g>
  );
};

const PathDraw: React.FC<{
  readonly d: string;
  readonly color: string;
  readonly width?: number;
  readonly progress: number; // 0..1
  readonly opacity?: number;
  readonly dasharray?: string;
}> = ({ d, color, width = 7, progress, opacity = 1, dasharray }) => {
  const p = clamp01(progress);
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={opacity}
      pathLength={1}
      strokeDasharray={dasharray ?? "1"}
      strokeDashoffset={dasharray ? "0" : String(1 - p)}
    />
  );
};

type SupercompShape = {
  readonly d: string;
  readonly baselineY: number;
  readonly dip: { x: number; y: number };
  readonly peak: { x: number; y: number };
};

const buildSupercompPath = (
  rect: ChartRect,
  opts: { readonly dipDepth: number; readonly peakHeight: number },
): SupercompShape => {
  const baselineY = rect.y + rect.h * 0.55;
  const x0 = rect.x;
  const x1 = rect.x + rect.w * 0.22;
  const x2 = rect.x + rect.w * 0.72;
  const x3 = rect.x + rect.w;

  const y0 = baselineY;
  const yDip = baselineY + rect.h * opts.dipDepth;
  const yPeak = baselineY - rect.h * opts.peakHeight;

  const d = [
    `M ${x0} ${y0}`,
    `C ${rect.x + rect.w * 0.08} ${y0} ${x1 - rect.w * 0.07} ${yDip} ${x1} ${yDip}`,
    `C ${x1 + rect.w * 0.12} ${yDip} ${x2 - rect.w * 0.16} ${yPeak} ${x2} ${yPeak}`,
    `C ${x2 + rect.w * 0.18} ${yPeak} ${x3 - rect.w * 0.12} ${y0} ${x3} ${y0}`,
  ].join(" ");

  return {
    d,
    baselineY,
    dip: { x: x1, y: yDip },
    peak: { x: x2, y: yPeak },
  };
};

const buildProgressiveOverloadPath = (rect: ChartRect, cycles: number) => {
  const base0 = rect.y + rect.h * 0.58;
  const slope = -rect.h * 0.12;
  const cycleW = rect.w / cycles;

  const baseAt = (i: number) => base0 + (slope * i) / (cycles - 1);

  const path: string[] = [];
  path.push(`M ${rect.x} ${baseAt(0)}`);
  for (let i = 0; i < cycles; i++) {
    const x0 = rect.x + i * cycleW;
    const x1 = x0 + cycleW * 0.28;
    const x2 = x0 + cycleW * 0.72;
    const x3 = x0 + cycleW;

    const base = baseAt(i);
    const dip = base + rect.h * (0.18 - i * 0.01);
    const peak = base - rect.h * (0.18 + i * 0.01);
    const nextBase = baseAt(Math.min(i + 1, cycles - 1));

    path.push(
      `C ${x0 + cycleW * 0.08} ${base} ${x1 - cycleW * 0.08} ${dip} ${x1} ${dip}`,
    );
    path.push(
      `C ${x1 + cycleW * 0.14} ${dip} ${x2 - cycleW * 0.14} ${peak} ${x2} ${peak}`,
    );
    path.push(
      `C ${x2 + cycleW * 0.18} ${peak} ${x3 - cycleW * 0.1} ${nextBase} ${x3} ${nextBase}`,
    );
  }

  const fitnessLine = `M ${rect.x} ${baseAt(0)} L ${rect.x + rect.w} ${baseAt(cycles - 1)}`;
  return { wave: path.join(" "), fitnessLine, baseAt, cycleW };
};

const GraphPanel: React.FC<{
  readonly children: (args: {
    readonly rect: ChartRect;
    readonly w: number;
    readonly h: number;
  }) => React.ReactNode;
}> = ({ children }) => {
  const { width } = useVideoConfig();
  const panelW = width - 112;
  const panelH = 980;
  const pad = 26;
  const w = panelW - pad * 2;
  const h = panelH - pad * 2;

  const rect: ChartRect = useMemo(
    () => ({
      x: 86,
      y: 34,
      w: w - 110,
      h: h - 130,
    }),
    [h, w],
  );

  return (
    <div style={{ position: "absolute", left: 56, right: 56, top: 320 }}>
      <Panel>
        <svg width={w} height={h}>
          {children({ rect, w, h })}
        </svg>
      </Panel>
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
        <linearGradient id="poGlowGrid" x1="0" x2="1" y1="0" y2="1">
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
              stroke="url(#poGlowGrid)"
              strokeOpacity={0.12}
              strokeWidth={1}
            />
          );
        }),
      )}
    </svg>
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

  return (
    <AbsoluteFill style={{ opacity: inOpacity * outOpacity }}>
      {children}
    </AbsoluteFill>
  );
};

const IntroSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, secondsToFrames(0.6, fps)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ opacity }}>
      <Title
        kicker="MODELO TEÓRICO"
        title="Sobrecarga progresiva"
        subtitle="Supercompensación + repetición del estímulo = mejora sostenida"
      />
      <div style={{ position: "absolute", left: 56, right: 56, top: 330 }}>
        <Panel>
          <div style={{ fontSize: 22, color: BG.muted, lineHeight: 1.35 }}>
            Curvas tipo “pizarra”, como tus referencias: fatiga → recuperación →
            supercompensación.
          </div>
        </Panel>
      </div>
    </AbsoluteFill>
  );
};

const SupercompModelSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fade = interpolate(frame, [0, secondsToFrames(0.5, fps)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Title
        kicker="SUPERCOMPENSACIÓN"
        title="Una sesión, una onda"
        subtitle="Estímulo → fatiga → recuperación → pico."
      />
      <GraphPanel>
        {({ rect }) => {
          const shape = buildSupercompPath(rect, {
            dipDepth: 0.28,
            peakHeight: 0.3,
          });
          const draw = interpolate(
            frame,
            [0, secondsToFrames(3.6, fps)],
            [0, 1],
            {
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            },
          );

          const labelIn = (s: number) =>
            interpolate(
              frame,
              [secondsToFrames(s, fps), secondsToFrames(s + 0.6, fps)],
              [0, 1],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              },
            );

          return (
            <>
              <Axes
                rect={rect}
                xLabel="TIEMPO"
                yLabel="RENDIMIENTO"
                opacity={fade}
              />
              <PathDraw
                d={shape.d}
                color="rgba(34,197,94,0.95)"
                width={7}
                progress={draw}
              />
              <SvgLabel
                x={shape.dip.x - 10}
                y={shape.dip.y + 46}
                text="Fatiga"
                color={BG.danger}
                size={18}
                weight={950}
                opacity={labelIn(1.0)}
                anchor="end"
              />
              <SvgLabel
                x={rect.x + rect.w * 0.42}
                y={shape.baselineY + 56}
                text="Recuperación"
                color={BG.cyan}
                size={18}
                weight={950}
                opacity={labelIn(1.6)}
                anchor="middle"
              />
              <SvgLabel
                x={shape.peak.x}
                y={shape.peak.y - 16}
                text="Supercompensación"
                color={BG.accent2}
                size={18}
                weight={950}
                opacity={labelIn(2.2)}
                anchor="middle"
              />
            </>
          );
        }}
      </GraphPanel>
    </AbsoluteFill>
  );
};

const SupercompCompareSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fade = interpolate(frame, [0, secondsToFrames(0.5, fps)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const show = (startS: number) =>
    interpolate(
      frame,
      [secondsToFrames(startS, fps), secondsToFrames(startS + 0.6, fps)],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      },
    );

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Title
        kicker="DOSIS DEL ESTÍMULO"
        title="Demasiado poco vs justo vs demasiado"
        subtitle="La dosis correcta maximiza el pico sin acumular fatiga crónica."
      />
      <GraphPanel>
        {({ rect }) => {
          const tooLittle = buildSupercompPath(rect, {
            dipDepth: 0.12,
            peakHeight: 0.12,
          });
          const justRight = buildSupercompPath(rect, {
            dipDepth: 0.26,
            peakHeight: 0.3,
          });
          const tooMuch = buildSupercompPath(rect, {
            dipDepth: 0.46,
            peakHeight: 0.16,
          });

          const p = interpolate(frame, [0, secondsToFrames(3.6, fps)], [0, 1], {
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });

          return (
            <>
              <Axes
                rect={rect}
                xLabel="TIEMPO"
                yLabel="RENDIMIENTO"
                opacity={fade}
              />
              <PathDraw
                d={tooLittle.d}
                color="rgba(245,158,11,0.85)"
                width={6}
                progress={p}
                opacity={show(0.4)}
              />
              <PathDraw
                d={tooMuch.d}
                color="rgba(251,113,133,0.80)"
                width={6}
                progress={p}
                opacity={show(1.0)}
              />
              <PathDraw
                d={justRight.d}
                color="rgba(34,197,94,0.95)"
                width={7}
                progress={p}
                opacity={show(1.6)}
              />
              <SvgLabel
                x={rect.x + rect.w - 6}
                y={rect.y + 18}
                text="Leyenda: poco / demasiado / justo"
                color={BG.faint}
                size={16}
                weight={900}
                opacity={show(2.0)}
                anchor="end"
              />
            </>
          );
        }}
      </GraphPanel>
    </AbsoluteFill>
  );
};

const ProgressiveOverloadWavesSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fade = interpolate(frame, [0, secondsToFrames(0.5, fps)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Title
        kicker="SOBRECARGA PROGRESIVA"
        title="Repetición del estímulo = mejora"
        subtitle="Ondas que, con el timing correcto, elevan la línea de fitness."
      />
      <GraphPanel>
        {({ rect }) => {
          const cycles = 5;
          const { wave, fitnessLine, baseAt, cycleW } =
            buildProgressiveOverloadPath(rect, cycles);
          const draw = interpolate(
            frame,
            [0, secondsToFrames(4.0, fps)],
            [0, 1],
            {
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            },
          );

          return (
            <>
              <Axes
                rect={rect}
                xLabel="TIEMPO"
                yLabel="RENDIMIENTO"
                opacity={fade}
              />
              <PathDraw
                d={fitnessLine}
                color="rgba(255,255,255,0.35)"
                width={4}
                progress={1}
                dasharray="10 12"
              />
              <SvgLabel
                x={rect.x + rect.w - 6}
                y={baseAt(cycles - 1) - 14}
                text="Fitness"
                color={BG.faint}
                size={16}
                weight={950}
                anchor="end"
                opacity={interpolate(
                  frame,
                  [secondsToFrames(1.0, fps), secondsToFrames(1.8, fps)],
                  [0, 1],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  },
                )}
              />
              <PathDraw
                d={wave}
                color="rgba(255,255,255,0.90)"
                width={6}
                progress={draw}
              />
              {Array.from({ length: cycles }).map((_, i) => {
                const arrowIn = spring({
                  frame: frame - i * 8,
                  fps,
                  config: { damping: 200 },
                  durationInFrames: secondsToFrames(0.8, fps),
                });
                const x = rect.x + i * cycleW + cycleW * 0.5;
                const y1 = rect.y - 6;
                const y2 = baseAt(i) - rect.h * 0.1 * arrowIn;
                return (
                  <line
                    key={i}
                    x1={x}
                    x2={x}
                    y1={y1}
                    y2={y2}
                    stroke="rgba(255,255,255,0.55)"
                    strokeWidth={4}
                    opacity={clamp01(arrowIn)}
                  />
                );
              })}
            </>
          );
        }}
      </GraphPanel>
    </AbsoluteFill>
  );
};

export type ProgressiveOverloadGraphsProps = {
  readonly fontFamily?: FontId;
};

export const ProgressiveOverloadGraphsExplainer: React.FC<
  ProgressiveOverloadGraphsProps
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

  const intro = secondsToFrames(2.5, fps);
  const model = secondsToFrames(6.0, fps);
  const compare = secondsToFrames(6.0, fps);
  const waves = secondsToFrames(5.5, fps);
  const endFrame = intro + model + compare + waves;

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

      <AbsoluteFill style={{ opacity: fadeOut }}>
        <SlideSequence from={0} durationInFrames={intro}>
          <IntroSlide />
        </SlideSequence>
        <SlideSequence from={intro} durationInFrames={model}>
          <SupercompModelSlide />
        </SlideSequence>
        <SlideSequence from={intro + model} durationInFrames={compare}>
          <SupercompCompareSlide />
        </SlideSequence>
        <SlideSequence from={intro + model + compare} durationInFrames={waves}>
          <ProgressiveOverloadWavesSlide />
        </SlideSequence>
      </AbsoluteFill>

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
        reelforge • gráficos: sobrecarga progresiva
      </div>
    </AbsoluteFill>
  );
};
