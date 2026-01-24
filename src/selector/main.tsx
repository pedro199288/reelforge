import { createRoot } from "react-dom/client";
import { App } from "./App";
import type { Segment } from "../core/silence/segments";

declare global {
  interface Window {
    REELFORGE_CONFIG?: {
      videoSrc: string;
      segments: Segment[];
      initialSelection?: number[];
    };
  }
}

// Datos de ejemplo para desarrollo
const exampleSegments: Segment[] = [
  { index: 0, startTime: 0, endTime: 2.5, duration: 2.5 },
  { index: 1, startTime: 3.2, endTime: 5.8, duration: 2.6 },
  { index: 2, startTime: 6.5, endTime: 9.1, duration: 2.6 },
  { index: 3, startTime: 10.0, endTime: 12.3, duration: 2.3 },
  { index: 4, startTime: 13.5, endTime: 16.0, duration: 2.5 },
];

const config = window.REELFORGE_CONFIG ?? {
  videoSrc: "/public/video.mp4",
  segments: exampleSegments,
};

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

const root = createRoot(container);
root.render(
  <App
    videoSrc={config.videoSrc}
    segments={config.segments}
    initialSelection={config.initialSelection}
    onSave={(selection) => {
      console.log("Selection saved:", selection);
      // Descargar como JSON
      const blob = new Blob([JSON.stringify(selection, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `selection-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }}
  />
);
