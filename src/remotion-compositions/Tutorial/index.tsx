/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    TUTORIAL INTERACTIVO DE REMOTION                       ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  Instrucciones:                                                           ║
 * ║  1. Descomenta cada bloque de código en orden (PASO 1, PASO 2, etc.)      ║
 * ║  2. Guarda el archivo y observa los cambios en el Remotion Studio         ║
 * ║  3. Lee los comentarios para entender qué hace cada parte                 ║
 * ║  4. Experimenta modificando los valores una vez entiendas el concepto     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { AbsoluteFill } from "remotion";

// ============================================================================
// PASO 1: HOOKS FUNDAMENTALES
// ============================================================================
// Descomenta la siguiente línea para importar los hooks básicos de Remotion.
//
// useCurrentFrame() - Devuelve el número de frame actual (0, 1, 2, 3...)
// useVideoConfig() - Devuelve la configuración del video (fps, width, height, durationInFrames)
//
// Estos son los hooks más importantes de Remotion. Todo se basa en frames.
// Si tu video es de 30fps, el frame 30 = segundo 1, frame 60 = segundo 2, etc.
// ----------------------------------------------------------------------------
import { useCurrentFrame, useVideoConfig } from "remotion";

// ============================================================================
// PASO 4: ANIMACIONES CON SPRING
// ============================================================================
// Descomenta para importar spring - crea animaciones físicamente realistas.
//
// spring() simula un resorte físico. Produce valores de 0 a ~1 con rebote
// natural. Es perfecto para animaciones que deben sentirse "vivas".
// ----------------------------------------------------------------------------
import { spring } from "remotion";

// ============================================================================
// PASO 6: INTERPOLACIÓN AVANZADA
// ============================================================================
// Descomenta para importar interpolate - mapea rangos de valores.
//
// interpolate(valor, [entrada], [salida]) convierte un valor de un rango
// a otro. Por ejemplo: interpolate(0.5, [0, 1], [0, 100]) = 50
// Es la función más versátil para crear animaciones en Remotion.
// ----------------------------------------------------------------------------
import { interpolate, Easing } from "remotion";

// ============================================================================
// PASO 9: SECUENCIAS
// ============================================================================
// Descomenta para importar Sequence - organiza elementos en el tiempo.
//
// <Sequence from={30}> hace que su contenido aparezca desde el frame 30.
// Es como una línea de tiempo de edición de video.
// ----------------------------------------------------------------------------
import { Sequence } from "remotion";

// ============================================================================
// PASO 12: ARCHIVOS ESTÁTICOS
// ============================================================================
// Descomenta para importar staticFile - accede a archivos en /public.
//
// staticFile("video.mp4") devuelve la URL correcta para assets.
// Los archivos deben estar en la carpeta /public del proyecto.
// ----------------------------------------------------------------------------
import { staticFile, Video, Img } from "remotion";

// Este tutorial usa muchos imports "más adelante" en bloques comentados.
// Para que `tsc` (noUnusedLocals) no falle, los marcamos como usados.
void staticFile;
void Video;
void Img;

export const Tutorial: React.FC = () => {
  // ==========================================================================
  // PASO 2: OBTENER EL FRAME ACTUAL
  // ==========================================================================
  // Descomenta las siguientes líneas para obtener el frame actual y la config.
  //
  // 'frame' será 0 en el primer frame, 1 en el segundo, etc.
  // 'fps' es frames por segundo (30 en este tutorial)
  // 'durationInFrames' es la duración total del video en frames
  //
  // Prueba: descomenta y observa el número que aparece en el video.
  // --------------------------------------------------------------------------
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // ==========================================================================
  // PASO 3: CALCULAR PROGRESO
  // ==========================================================================
  // Descomenta para calcular el progreso del video (0 a 1).
  //
  // progress = 0 al inicio, 0.5 a la mitad, 1 al final
  // Esto es útil para crear animaciones que dependan del tiempo total.
  // --------------------------------------------------------------------------
  const progress = frame / durationInFrames;

  // ==========================================================================
  // PASO 5: ANIMACIÓN CON SPRING
  // ==========================================================================
  // Descomenta para crear una animación con física de resorte.
  //
  // El spring comienza en 0 y llega a ~1 con un rebote natural.
  // - frame: frame actual (inicio de la animación)
  // - fps: frames por segundo
  // - config.damping: amortiguación (más alto = menos rebote)
  //
  // Experimenta cambiando damping: 5 (mucho rebote) vs 200 (sin rebote)
  // --------------------------------------------------------------------------
  const scale = spring({
    frame,
    fps,
    config: {
      damping: 50, // Prueba: 5, 15, 50, 200
    },
  });

  // ==========================================================================
  // PASO 7: ANIMACIÓN DE OPACIDAD CON INTERPOLATE
  // ==========================================================================
  // Descomenta para crear un fade-in durante los primeros 30 frames.
  //
  // interpolate mapea el frame actual a un valor de opacidad:
  // - frame 0 → opacidad 0
  // - frame 15 → opacidad 0.5
  // - frame 30+ → opacidad 1
  //
  // extrapolateRight: "clamp" evita que pase de 1
  // --------------------------------------------------------------------------
  const opacity = interpolate(
    frame,
    [0, 30], // Rango de entrada: frames 0-30
    [0, 1], // Rango de salida: opacidad 0-1
    {
      extrapolateRight: "clamp", // No pasar de 1
    },
  );

  // ==========================================================================
  // PASO 8: ANIMACIÓN DE ROTACIÓN CON EASING
  // ==========================================================================
  // Descomenta para crear una rotación con curva de aceleración.
  //
  // Easing modifica la velocidad de la animación:
  // - Easing.linear: velocidad constante
  // - Easing.ease: suave inicio y fin
  // - Easing.out(Easing.cubic): desacelera al final
  // - Easing.inOut(Easing.quad): acelera y desacelera
  //
  // Prueba diferentes easings y observa cómo cambia la sensación.
  // --------------------------------------------------------------------------
  const rotation = interpolate(frame, [0, 60], [0, 360], {
    easing: Easing.out(Easing.bounce), // Prueba: Easing.linear, Easing.bounce
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#1a1a2e",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* ════════════════════════════════════════════════════════════════════
          PASO 2.1: MOSTRAR INFO DEL FRAME
          ════════════════════════════════════════════════════════════════════
          Descomenta este bloque para ver el frame actual en pantalla.

          Observa cómo el número incrementa mientras el video avanza.
          Esta es la base de TODAS las animaciones en Remotion.
          ──────────────────────────────────────────────────────────────────── */}

      <div
        style={{
          position: "absolute",
          top: 40,
          left: 40,
          color: "#4a5568",
          fontSize: 24,
        }}
      >
        Frame: {frame} / {durationInFrames}
        <br />
        Tiempo: {(frame / fps).toFixed(2)}s
        <br />
        Tamaño: {width}×{height}
        <br />
        Progreso: {(progress * 100).toFixed(1)}%
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          PASO 3.1: BARRA DE PROGRESO
          ════════════════════════════════════════════════════════════════════
          Descomenta para ver una barra de progreso animada.

          Usa la variable 'progress' (0-1) para el ancho de la barra.
          Esta es la forma más simple de animación: frame → estilo.
          ──────────────────────────────────────────────────────────────────── */}

      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 60,
          right: 60,
          height: 8,
          backgroundColor: "#2d3748",
          borderRadius: 4,
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            backgroundColor: "#48bb78",
            borderRadius: 4,
          }}
        />
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          PASO 5.1: CAJA CON ANIMACIÓN SPRING
          ════════════════════════════════════════════════════════════════════
          Descomenta para ver una caja que aparece con efecto de rebote.

          transform: `scale(${scale})` aplica el valor del spring (0→1)
          al tamaño de la caja. El rebote hace que se sienta "viva".
          ──────────────────────────────────────────────────────────────────── */}

      <div
        style={{
          width: 150,
          height: 150,
          backgroundColor: "#6366f1",
          borderRadius: 20,
          transform: `scale(${scale})`,
        }}
      />

      {/* ════════════════════════════════════════════════════════════════════
          PASO 7.1: TEXTO CON FADE-IN
          ════════════════════════════════════════════════════════════════════
          Descomenta para ver texto que aparece gradualmente.

          opacity va de 0 a 1 durante los primeros 30 frames.
          Combina esto con transform para efectos más complejos.
          ──────────────────────────────────────────────────────────────────── */}

      <h1
        style={{
          color: "white",
          fontSize: 72,
          fontWeight: "bold",
          opacity: opacity,
          marginTop: 200,
        }}
      >
        Hola Remotion
      </h1>

      {/* ════════════════════════════════════════════════════════════════════
          PASO 8.1: ELEMENTO CON ROTACIÓN
          ════════════════════════════════════════════════════════════════════
          Descomenta para ver un elemento que rota suavemente.

          La rotación usa Easing.out para que desacelere al final,
          dando una sensación más natural y menos mecánica.
          ──────────────────────────────────────────────────────────────────── */}

      <div
        style={{
          position: "absolute",
          top: 100,
          right: 100,
          width: 60,
          height: 60,
          backgroundColor: "#f59e0b",
          transform: `rotate(${rotation}deg)`,
        }}
      />

      {/* ════════════════════════════════════════════════════════════════════
          PASO 9.1: SECUENCIAS - TIMING
          ════════════════════════════════════════════════════════════════════
          Descomenta para ver elementos que aparecen en diferentes momentos.

          <Sequence from={X}> hace que su contenido empiece en el frame X.
          <Sequence from={30} durationInFrames={60}> = frames 30-90.

          Esto es como una línea de tiempo de edición de video.
          ──────────────────────────────────────────────────────────────────── */}

      <Sequence durationInFrames={60}>
        <AbsoluteFill
          style={{ justifyContent: "center", alignItems: "center" }}
        >
          <h2 style={{ color: "#ef4444", fontSize: 48 }}>
            Escena 1 (frames 0-60)
          </h2>
        </AbsoluteFill>
      </Sequence>

      <Sequence from={60} durationInFrames={60}>
        <AbsoluteFill
          style={{ justifyContent: "center", alignItems: "center" }}
        >
          <h2 style={{ color: "#10b981", fontSize: 48 }}>
            Escena 2 (frames 60-120)
          </h2>
        </AbsoluteFill>
      </Sequence>

      <Sequence from={120}>
        <AbsoluteFill
          style={{ justifyContent: "center", alignItems: "center" }}
        >
          <h2 style={{ color: "#8b5cf6", fontSize: 48 }}>
            Escena 3 (frame 120+)
          </h2>
        </AbsoluteFill>
      </Sequence>

      {/* ════════════════════════════════════════════════════════════════════
          PASO 10: COMPOSICIÓN DE ANIMACIONES
          ════════════════════════════════════════════════════════════════════
          Descomenta para ver varias animaciones combinadas.

          Este ejemplo combina:
          - Scale con spring para el tamaño
          - Interpolate para el movimiento vertical
          - Opacity para el fade-in

          La clave es combinar múltiples valores animados en un transform.
          ──────────────────────────────────────────────────────────────────── */}

      <div
        style={{
          width: 200,
          height: 200,
          backgroundColor: "#ec4899",
          borderRadius: "50%",
          opacity: opacity,
          transform: `
            scale(${scale})
            translateY(${interpolate(frame, [0, 60], [100, 0], { extrapolateRight: "clamp" })}px)
          `,
          boxShadow: `0 ${interpolate(frame, [0, 30], [0, 20], { extrapolateRight: "clamp" })}px 40px rgba(0,0,0,0.3)`,
        }}
      />

      {/* ════════════════════════════════════════════════════════════════════
          PASO 11: ANIMACIÓN DE TEXTO PALABRA POR PALABRA
          ════════════════════════════════════════════════════════════════════
          Descomenta para ver cómo animar cada palabra individualmente.

          Usamos el índice de cada palabra para escalonar la animación.
          Cada palabra tiene un delay basado en su posición (i * 5 frames).
          ──────────────────────────────────────────────────────────────────── */}

      <div style={{ display: "flex", gap: 20, marginTop: 300 }}>
        {["Aprende", "Remotion", "Paso", "a", "Paso"].map((word, i) => {
          const delay = i * 5; // Cada palabra aparece 5 frames después
          const wordOpacity = interpolate(frame, [delay, delay + 15], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const wordY = interpolate(frame, [delay, delay + 15], [30, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <span
              key={i}
              style={{
                color: "white",
                fontSize: 48,
                fontWeight: "bold",
                opacity: wordOpacity,
                transform: `translateY(${wordY}px)`,
              }}
            >
              {word}
            </span>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          PASO 12.1: INCLUIR IMAGEN ESTÁTICA
          ════════════════════════════════════════════════════════════════════
          Descomenta para incluir una imagen desde la carpeta /public.

          staticFile() genera la URL correcta para archivos en /public.
          Asegúrate de tener una imagen en public/images/logo.png
          ──────────────────────────────────────────────────────────────────── */}
      {/* 
      <Img
        src={staticFile("images/logo.png")}
        style={{
          position: "absolute",
          top: 40,
          right: 40,
          width: 100,
          height: 100,
          opacity: opacity,
        }}
      /> */}

      {/* ════════════════════════════════════════════════════════════════════
          PASO 13: ANIMACIÓN LOOP (CONTINUA)
          ════════════════════════════════════════════════════════════════════
          Descomenta para ver una animación que se repite continuamente.

          El operador módulo (%) crea un loop. frame % 60 va de 0 a 59
          y luego vuelve a empezar. Útil para animaciones infinitas.
          ──────────────────────────────────────────────────────────────────── */}

      <div
        style={{
          position: "absolute",
          bottom: 150,
          width: 40,
          height: 40,
          backgroundColor: "#06b6d4",
          borderRadius: "50%",
          transform: `
            translateX(${interpolate(frame % 60, [0, 30, 60], [-200, 200, -200])}px)
          `,
        }}
      />

      {/* ════════════════════════════════════════════════════════════════════
          PASO 14: ANIMACIÓN CONDICIONAL
          ════════════════════════════════════════════════════════════════════
          Descomenta para ver animación que cambia según condiciones.

          Aquí el color cambia cada 30 frames usando el frame actual.
          Puedes crear transiciones de escena basadas en el tiempo.
          ──────────────────────────────────────────────────────────────────── */}

      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 100,
          height: 100,
          borderRadius: 16,
          transform: "translate(-50%, -50%)",
          backgroundColor:
            frame < 30
              ? "#ef4444"
              : frame < 60
                ? "#f59e0b"
                : frame < 90
                  ? "#10b981"
                  : "#6366f1",
          transition: "none", // CSS transitions no funcionan en Remotion
        }}
      />

      {/* ════════════════════════════════════════════════════════════════════
          PASO 15: LAYOUT FLEX ANIMADO
          ════════════════════════════════════════════════════════════════════
          Descomenta para ver múltiples elementos con stagger animation.

          Array.from crea N elementos. Cada uno tiene un delay diferente.
          Este patrón es muy común para listas y grids animados.
          ──────────────────────────────────────────────────────────────────── */}

      <div
        style={{
          position: "absolute",
          bottom: 250,
          display: "flex",
          gap: 20,
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => {
          const delay = i * 8;
          const itemScale = spring({
            frame: frame - delay, // Restar delay crea el stagger
            fps,
            config: { damping: 12 },
          });
          return (
            <div
              key={i}
              style={{
                width: 50,
                height: 50,
                backgroundColor: `hsl(${i * 60}, 70%, 60%)`,
                borderRadius: 12,
                transform: `scale(${Math.max(0, itemScale)})`,
              }}
            />
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          ESTADO INICIAL: Mensaje de bienvenida
          ════════════════════════════════════════════════════════════════════
          Este mensaje desaparecerá cuando empieces a descomentar código.
          Empieza por el PASO 1 en la sección de imports arriba.
          ──────────────────────────────────────────────────────────────────── */}
      <div style={{ textAlign: "center", padding: 40 }}>
        <h1
          style={{
            color: "white",
            fontSize: 64,
            fontWeight: "bold",
            marginBottom: 24,
          }}
        >
          Tutorial de Remotion
        </h1>
        <p
          style={{
            color: "#a0aec0",
            fontSize: 28,
            maxWidth: 600,
            lineHeight: 1.6,
          }}
        >
          Empieza descomentando el PASO 1 en los imports arriba.
          <br />
          Sigue los pasos en orden numérico.
        </p>
        <div
          style={{
            marginTop: 40,
            padding: "16px 32px",
            backgroundColor: "#2d3748",
            borderRadius: 12,
            display: "inline-block",
          }}
        >
          <code style={{ color: "#48bb78", fontSize: 20 }}>
            // Descomenta PASO 1 para empezar
          </code>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// INFORMACIÓN ADICIONAL DE REFERENCIA
// ============================================================================
//
// HOOKS PRINCIPALES:
// - useCurrentFrame()  → número de frame actual
// - useVideoConfig()   → { fps, width, height, durationInFrames }
// - useDelayRender()   → pausa el render hasta que assets carguen
//
// FUNCIONES DE ANIMACIÓN:
// - spring({ frame, fps, config })     → animación con física de resorte
// - interpolate(valor, [in], [out])    → mapea valores entre rangos
// - Easing.out(Easing.cubic)           → curvas de aceleración
//
// COMPONENTES PRINCIPALES:
// - <AbsoluteFill>     → contenedor fullscreen con position: absolute
// - <Sequence>         → organiza contenido en el tiempo
// - <Video>            → reproduce video
// - <Audio>            → reproduce audio
// - <Img>              → imagen optimizada
// - <Series>           → secuencias que van una tras otra
//
// UTILIDADES:
// - staticFile()       → URL para archivos en /public
// - delayRender()      → pausa el render
// - continueRender()   → continúa el render
// - random()           → número aleatorio determinístico
//
// CONFIGURACIONES DE SPRING:
// - damping: 200       → sin rebote, suave
// - damping: 50        → poco rebote
// - damping: 15        → rebote natural
// - damping: 5         → mucho rebote
// - stiffness: 200     → más rápido
// - mass: 0.5          → más ligero
//
// ============================================================================
