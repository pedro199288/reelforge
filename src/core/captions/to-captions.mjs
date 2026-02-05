/**
 * Custom toCaptions that uses DTW timestamps from whisper.cpp.
 *
 * Remotion's toCaptions ignores the `timestampMs` (DTW) field for startMs/endMs,
 * using only segment offsets. This version prioritizes DTW timestamps (t_dtw * 10)
 * which are significantly more accurate for word-level timing.
 *
 * Requires flashAttention: false in whisper.cpp transcribe options,
 * since flash attention skips storing attention weights needed by DTW.
 */
export function toCaptionsDTW(whisperCppOutput) {
  const { transcription } = whisperCppOutput;
  const captions = [];

  for (let i = 0; i < transcription.length; i++) {
    const item = transcription[i];
    if (item.text === "") continue;

    const token = item.tokens[0];
    const dtwMs = token.t_dtw === -1 ? null : token.t_dtw * 10;

    // Use DTW if available, fallback to segment offsets
    const startMs = dtwMs ?? item.offsets.from;

    // endMs: estimate based on word length, capped by next word's start
    // This avoids inflated durations during pauses between words
    let endMs;
    const wordText = item.text.trim();
    const estimatedMaxMs = Math.max(150, wordText.length * 70);
    const nextItem = transcription[i + 1];
    if (nextItem) {
      const nextDtwMs =
        nextItem.tokens[0].t_dtw === -1
          ? null
          : nextItem.tokens[0].t_dtw * 10;
      const nextStart = nextDtwMs ?? nextItem.offsets.from;
      endMs = Math.min(nextStart, startMs + estimatedMaxMs);
    } else {
      endMs = Math.min(item.offsets.to, startMs + estimatedMaxMs);
    }

    // Ensure reasonable minimum duration (50ms)
    if (endMs <= startMs) {
      endMs = startMs + Math.max(50, item.offsets.to - item.offsets.from);
    }

    captions.push({
      text: captions.length === 0 ? item.text.trimStart() : item.text,
      startMs,
      endMs,
      timestampMs: dtwMs,
      confidence: token.p,
    });
  }

  return { captions };
}
