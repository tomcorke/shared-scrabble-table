let audioContext: AudioContext | undefined;

export function unlockTileAudio() {
  if (typeof window === "undefined" || !window.AudioContext) return;
  try {
    audioContext ??= new window.AudioContext();
    if (audioContext.state === "suspended")
      void audioContext.resume().catch(() => {});
  } catch {
    audioContext = undefined;
  }
}

export function playTileSound() {
  const context = audioContext;
  if (!context || context.state === "closed") return;

  try {
    if (context.state === "suspended") void context.resume().catch(() => {});
    const now = context.currentTime;
    const tone = context.createOscillator();
    const toneGain = context.createGain();
    tone.type = "triangle";
    tone.frequency.setValueAtTime(780, now);
    tone.frequency.exponentialRampToValueAtTime(260, now + 0.035);
    toneGain.gain.setValueAtTime(0.13, now);
    toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    tone.connect(toneGain).connect(context.destination);
    tone.start(now);
    tone.stop(now + 0.05);

    const source = context.createBufferSource();
    const buffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * 0.012),
      context.sampleRate,
    );
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++)
      samples[index] = (Math.random() * 2 - 1) * (1 - index / samples.length);
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(900, now);
    const clickGain = context.createGain();
    clickGain.gain.setValueAtTime(0.08, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.012);
    source.connect(filter).connect(clickGain).connect(context.destination);
    source.start(now);
    source.stop(now + 0.012);
  } catch {
    return;
  }
}
