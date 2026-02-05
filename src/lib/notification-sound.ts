/**
 * Play a short two-tone ascending chime (~300ms) using Web Audio API.
 * No external audio files needed. Fails silently if AudioContext is unavailable.
 */
export async function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    // Resume context — required when created outside a direct user-gesture handler
    if (ctx.state === "suspended") await ctx.resume();

    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);

    // First tone — C6 (1047 Hz)
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = 1047;
    osc1.connect(gain);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.12);

    // Second tone — E6 (1319 Hz), starts right after first
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = 1319;
    osc2.connect(gain);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.3);

    // Fade out at the end
    gain.gain.setValueAtTime(0.15, ctx.currentTime + 0.25);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);

    // Clean up context after sound finishes
    setTimeout(() => ctx.close(), 500);
  } catch {
    // AudioContext not available — ignore silently
  }
}
