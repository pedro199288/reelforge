import { useCallback, useEffect, useRef } from "react";
import type { PlayerRef } from "@remotion/player";
import { useEditorProjectStore } from "@/store/editor-project";

interface UsePlayerSyncOptions {
  playerRef: React.RefObject<PlayerRef | null>;
  fps: number;
}

export function usePlayerSync({ playerRef, fps }: UsePlayerSyncOptions) {
  const rafRef = useRef<number>(0);
  const isSyncingFromPlayer = useRef(false);

  const store = useEditorProjectStore;

  // RAF loop: Player → Store (during playback)
  useEffect(() => {
    const tick = () => {
      const player = playerRef.current;
      const { isPlaying } = store.getState();

      if (player && isPlaying) {
        isSyncingFromPlayer.current = true;
        store.getState().setCurrentFrame(player.getCurrentFrame());
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playerRef, store]);

  // Store → Player: seek when currentFrame changes from UI (not from RAF)
  useEffect(() => {
    const unsub = store.subscribe((state, prevState) => {
      if (state.currentFrame !== prevState.currentFrame) {
        if (isSyncingFromPlayer.current) {
          isSyncingFromPlayer.current = false;
          return;
        }
        playerRef.current?.seekTo(state.currentFrame);
      }
    });
    return unsub;
  }, [playerRef, store]);

  // Store → Player: play/pause sync
  useEffect(() => {
    const unsub = store.subscribe((state, prevState) => {
      if (state.isPlaying !== prevState.isPlaying) {
        const player = playerRef.current;
        if (!player) return;
        if (state.isPlaying) {
          player.play();
        } else {
          player.pause();
        }
      }
    });
    return unsub;
  }, [playerRef, store]);

  const seekTo = useCallback(
    (frame: number) => {
      playerRef.current?.seekTo(frame);
      store.getState().setCurrentFrame(frame);
    },
    [playerRef, store]
  );

  return { seekTo };
}
