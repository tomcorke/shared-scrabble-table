import { z } from "zod";

export const MAX_SOUND_LAYERS = 64; // ponytail: bound imported nodes; raise after playback profiling.
export const MAX_FREQUENCY_HZ = 16_000;
export const SOUND_SAMPLE_RATE = 48_000;

const range = (min: number, max: number) =>
  z.number().finite().min(min).max(max);

export const WaveformSchema = z.enum([
  "sine",
  "square",
  "sawtooth",
  "triangle",
]);
export const FilterTypeSchema = z.enum(["highpass", "lowpass", "bandpass"]);

const commonLayer = {
  id: z.string().min(1).max(80),
  delayMs: range(0, 3000).default(0),
  enabled: z.boolean(),
  gain: range(0.00001, 0.3),
  envelope: z.array(range(0, 1)).min(2).max(401).optional(),
};

export const OscillatorLayerSchema = z
  .object({
    ...commonLayer,
    type: z.literal("oscillator"),
    waveform: WaveformSchema,
    startFrequencyHz: range(100, MAX_FREQUENCY_HZ),
    endFrequencyHz: range(50, MAX_FREQUENCY_HZ),
    sweepMs: range(5, 150),
    fadeMs: range(5, 2000),
    durationMs: range(15, 2000),
  })
  .strict();

export const NoiseLayerSchema = z
  .object({
    ...commonLayer,
    type: z.literal("noise"),
    filterType: FilterTypeSchema,
    filterFrequencyHz: range(200, MAX_FREQUENCY_HZ),
    filterEndFrequencyHz: range(200, MAX_FREQUENCY_HZ).optional(),
    attackMs: range(0, 2000).optional(),
    fadeMs: range(3, 2000),
    durationMs: range(3, 2000),
  })
  .strict();

export const SoundLayerSchema = z.discriminatedUnion("type", [
  OscillatorLayerSchema,
  NoiseLayerSchema,
]);

export const SoundSettingsSchema = z
  .object({
    version: z.literal(2),
    name: z.string().max(48),
    layers: z.array(SoundLayerSchema).max(MAX_SOUND_LAYERS),
  })
  .strict();

export const LegacySoundSettingsSchema = z
  .object({
    version: z.literal(1),
    name: z.string().max(48),
    tone: z
      .object({
        enabled: z.boolean(),
        waveform: WaveformSchema,
        startFrequencyHz: range(100, 1600),
        endFrequencyHz: range(50, 1600),
        sweepMs: range(5, 150),
        fadeMs: range(5, 300),
        durationMs: range(15, 300),
        gain: range(0.01, 0.3),
      })
      .strict(),
    click: z
      .object({
        enabled: z.boolean(),
        durationMs: range(3, 60),
        highpassHz: range(200, 6000),
        gain: range(0.01, 0.25),
      })
      .strict(),
  })
  .strict();

export type Waveform = z.infer<typeof WaveformSchema>;
export type FilterType = z.infer<typeof FilterTypeSchema>;
export type OscillatorLayer = z.infer<typeof OscillatorLayerSchema>;
export type NoiseLayer = z.infer<typeof NoiseLayerSchema>;
export type SoundLayer = z.infer<typeof SoundLayerSchema>;
export type SoundSettings = z.infer<typeof SoundSettingsSchema>;
export type LegacySoundSettings = z.infer<typeof LegacySoundSettingsSchema>;

export const DEFAULT_SOUND: SoundSettings = {
  version: 2,
  name: "Scrabble tile",
  layers: [
    {
      id: "scrabble-tone",
      type: "oscillator",
      delayMs: 0,
      enabled: true,
      waveform: "triangle",
      startFrequencyHz: 780,
      endFrequencyHz: 260,
      sweepMs: 35,
      fadeMs: 45,
      durationMs: 50,
      gain: 0.13,
    },
    {
      id: "scrabble-click",
      type: "noise",
      delayMs: 0,
      enabled: true,
      filterType: "highpass",
      filterFrequencyHz: 900,
      fadeMs: 12,
      durationMs: 12,
      gain: 0.08,
    },
  ],
};

export function isSoundSettings(value: unknown): value is SoundSettings {
  return SoundSettingsSchema.safeParse(value).success;
}

export function migrateSoundSettings(value: unknown): SoundSettings | null {
  const current = SoundSettingsSchema.safeParse(value);
  if (current.success) return current.data;

  const legacy = LegacySoundSettingsSchema.safeParse(value);
  if (!legacy.success) return null;
  return {
    version: 2,
    name: legacy.data.name,
    layers: [
      {
        ...legacy.data.tone,
        id: "legacy-tone",
        type: "oscillator",
        delayMs: 0,
      },
      {
        id: "legacy-click",
        type: "noise",
        delayMs: 0,
        enabled: legacy.data.click.enabled,
        filterType: "highpass",
        filterFrequencyHz: legacy.data.click.highpassHz,
        durationMs: legacy.data.click.durationMs,
        fadeMs: legacy.data.click.durationMs,
        gain: legacy.data.click.gain,
      },
    ],
  };
}

let audioContext: AudioContext | undefined;

export function playSound(settings: SoundSettings): boolean {
  const parsed = SoundSettingsSchema.safeParse(settings);
  if (!parsed.success || typeof window === "undefined" || !window.AudioContext)
    return false;

  try {
    if (!audioContext || audioContext.state === "closed")
      audioContext = new window.AudioContext({ sampleRate: SOUND_SAMPLE_RATE });
    if (audioContext.state === "suspended")
      void audioContext.resume().catch(() => {});

    const now = audioContext.currentTime;
    for (const layer of parsed.data.layers) {
      if (!layer.enabled) continue;
      const startAt = now + layer.delayMs / 1000;
      if (layer.type === "oscillator")
        playOscillator(audioContext, layer, startAt);
      else playNoise(audioContext, layer, startAt);
    }
    return true;
  } catch {
    return false;
  }
}

function playOscillator(
  context: AudioContext,
  layer: OscillatorLayer,
  now: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = layer.waveform;
  oscillator.frequency.setValueAtTime(layer.startFrequencyHz, now);
  oscillator.frequency.exponentialRampToValueAtTime(
    layer.endFrequencyHz,
    now + layer.sweepMs / 1000,
  );
  if (!scheduleEnvelope(gain.gain, layer, now)) {
    gain.gain.setValueAtTime(layer.gain, now);
    gain.gain.exponentialRampToValueAtTime(
      Math.min(0.001, layer.gain * 0.1),
      now + layer.fadeMs / 1000,
    );
  }
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + layer.durationMs / 1000);
}

function playNoise(context: AudioContext, layer: NoiseLayer, now: number) {
  const length = Math.ceil((context.sampleRate * layer.durationMs) / 1000);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  const attackMs = Math.min(
    layer.attackMs ?? 0,
    Math.max(0, layer.durationMs - 3),
  );
  for (let index = 0; index < samples.length; index++)
    samples[index] =
      (Math.random() * 2 - 1) *
      (attackMs || layer.envelope ? 1 : 1 - index / samples.length);

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  filter.type = layer.filterType;
  filter.frequency.setValueAtTime(layer.filterFrequencyHz, now);
  if (
    layer.filterEndFrequencyHz &&
    layer.filterEndFrequencyHz !== layer.filterFrequencyHz
  )
    filter.frequency.exponentialRampToValueAtTime(
      layer.filterEndFrequencyHz,
      now + layer.durationMs / 1000,
    );
  if (!scheduleEnvelope(gain.gain, layer, now)) {
    const floor = Math.min(0.001, layer.gain * 0.1);
    if (attackMs) {
      gain.gain.setValueAtTime(floor, now);
      gain.gain.linearRampToValueAtTime(layer.gain, now + attackMs / 1000);
      const fadeStartMs = Math.max(attackMs, layer.durationMs - layer.fadeMs);
      if (fadeStartMs > attackMs)
        gain.gain.setValueAtTime(layer.gain, now + fadeStartMs / 1000);
    } else {
      gain.gain.setValueAtTime(layer.gain, now);
    }
    gain.gain.exponentialRampToValueAtTime(
      floor,
      now + (attackMs ? layer.durationMs : layer.fadeMs) / 1000,
    );
  }
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(now);
  source.stop(now + layer.durationMs / 1000);
}

function scheduleEnvelope(param: AudioParam, layer: SoundLayer, now: number) {
  if (!layer.envelope) return false;
  param.setValueAtTime(layer.gain * layer.envelope[0], now);
  const step = layer.durationMs / 1000 / (layer.envelope.length - 1);
  for (let index = 1; index < layer.envelope.length; index++)
    param.linearRampToValueAtTime(
      layer.gain * layer.envelope[index],
      now + index * step,
    );
  return true;
}
