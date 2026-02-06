import { useMemo, memo } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { MultiTrackMain } from "@/remotion-compositions/MultiTrackEditor";
import type { Track } from "@/types/editor";
import { usePlayerSync } from "@/hooks/usePlayerSync";

interface EditorPreviewProps {
  tracks: Track[];
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  playerRef: React.RefObject<PlayerRef | null>;
}

export const EditorPreview = memo(function EditorPreview({
  tracks,
  fps,
  width,
  height,
  durationInFrames,
  playerRef,
}: EditorPreviewProps) {
  usePlayerSync({ playerRef, fps });

  const inputProps = useMemo(() => ({ tracks }), [tracks]);

  return (
    <div className="flex-1 flex items-center justify-center bg-black/90 p-4 min-h-0 min-w-0">
      <div
        className="relative w-full h-full flex items-center justify-center"
        style={{ maxWidth: "100%", maxHeight: "100%" }}
      >
        <Player
          ref={playerRef}
          component={MultiTrackMain}
          inputProps={inputProps}
          durationInFrames={Math.max(1, durationInFrames)}
          compositionWidth={width}
          compositionHeight={height}
          fps={fps}
          style={{
            width: "100%",
            maxHeight: "100%",
            aspectRatio: `${width}/${height}`,
          }}
          errorFallback={({ error }) => (
            <div className="flex items-center justify-center h-full text-red-400 text-sm">
              Error: {error.message}
            </div>
          )}
        />
      </div>
    </div>
  );
});
