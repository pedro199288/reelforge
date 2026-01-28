import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS } from "./colors";
import { secondsToFrames } from "./utils";

export type QuoteOverlayProps = {
  /** Texto de la cita */
  readonly quote: string;
  /** Autor de la cita (opcional) */
  readonly author?: string;
  /** Fuente o contexto (opcional) */
  readonly source?: string;
  /** Color del acento */
  readonly accentColor?: string;
  /** Estilo de la cita */
  readonly style?: "minimal" | "boxed" | "dramatic";
  /** Tamaño del texto */
  readonly size?: "small" | "medium" | "large";
};

export const QuoteOverlay: React.FC<QuoteOverlayProps> = ({
  quote,
  author,
  source,
  accentColor = COLORS.accent,
  style = "boxed",
  size = "medium",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Tamaños de fuente según size
  const fontSizes = {
    small: { quote: 32, author: 18, source: 14 },
    medium: { quote: 42, author: 22, source: 16 },
    large: { quote: 56, author: 26, source: 18 },
  }[size];

  // Animaciones de entrada
  const quoteIn = spring({
    frame,
    fps,
    config: { damping: 20, mass: 0.8, stiffness: 100 },
    durationInFrames: secondsToFrames(0.9, fps),
  });

  const authorIn = spring({
    frame: frame - secondsToFrames(0.4, fps),
    fps,
    config: { damping: 18, mass: 0.7, stiffness: 120 },
    durationInFrames: secondsToFrames(0.7, fps),
  });

  const quoteY = interpolate(quoteIn, [0, 1], [30, 0]);
  const quoteOpacity = interpolate(quoteIn, [0, 1], [0, 1]);
  const authorOpacity = interpolate(authorIn, [0, 1], [0, 1]);

  // Línea decorativa animada
  const lineWidth = interpolate(quoteIn, [0, 1], [0, 100], {
    easing: Easing.out(Easing.cubic),
  });

  const renderContent = () => (
    <>
      {/* Comillas decorativas */}
      <div
        style={{
          position: "absolute",
          top: -20,
          left: -10,
          fontSize: 120,
          fontWeight: 900,
          color: accentColor,
          opacity: 0.15,
          lineHeight: 1,
          pointerEvents: "none",
        }}
      >
        "
      </div>

      {/* Cita principal */}
      <div
        style={{
          fontSize: fontSizes.quote,
          fontWeight: 800,
          color: COLORS.text,
          lineHeight: 1.3,
          transform: `translateY(${quoteY}px)`,
          opacity: quoteOpacity,
          position: "relative",
          zIndex: 1,
        }}
      >
        "{quote}"
      </div>

      {/* Línea decorativa */}
      <div
        style={{
          width: `${lineWidth}%`,
          height: 4,
          background: accentColor,
          borderRadius: 999,
          marginTop: 24,
          marginBottom: 16,
          opacity: 0.8,
        }}
      />

      {/* Autor y fuente */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          opacity: authorOpacity,
        }}
      >
        {author && (
          <div
            style={{
              fontSize: fontSizes.author,
              fontWeight: 700,
              color: accentColor,
            }}
          >
            — {author}
          </div>
        )}
        {source && (
          <div
            style={{
              fontSize: fontSizes.source,
              color: COLORS.faint,
              fontStyle: "italic",
            }}
          >
            {source}
          </div>
        )}
      </div>
    </>
  );

  // Estilos según variante
  if (style === "minimal") {
    return (
      <div
        style={{
          padding: "40px 56px",
          position: "relative",
        }}
      >
        {renderContent()}
      </div>
    );
  }

  if (style === "dramatic") {
    return (
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.95) 100%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 80,
        }}
      >
        <div
          style={{
            maxWidth: 900,
            textAlign: "center",
            position: "relative",
          }}
        >
          {renderContent()}
        </div>
      </AbsoluteFill>
    );
  }

  // Estilo boxed (default)
  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.panelBorder}`,
        borderRadius: 24,
        padding: "36px 40px",
        backdropFilter: "blur(12px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {renderContent()}
    </div>
  );
};

/**
 * Composición standalone para preview/demo
 */
export const QuoteOverlayDemo: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        padding: 56,
        display: "flex",
        flexDirection: "column",
        gap: 40,
        justifyContent: "center",
      }}
    >
      <QuoteOverlay
        quote="El dolor que sientes hoy será la fuerza que sientas mañana."
        author="Arnold Schwarzenegger"
        accentColor={COLORS.accent2}
        style="boxed"
        size="medium"
      />
    </AbsoluteFill>
  );
};
