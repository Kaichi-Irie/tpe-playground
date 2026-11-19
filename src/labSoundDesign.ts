export type LabSound = "kernel" | "sample" | "bandwidth" | "split" | "alpha";
// Every Lab sound is synthesized (not recorded) and sits in C major, so
// overlapping tails and chords stay consonant.
export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

// Peak-normalize with headroom and fade the last 20 ms to silence.
function finish(result: Float32Array, sampleRate: number): Float32Array {
  const fade = Math.floor(sampleRate * 0.02);
  for (let i = 0; i < fade; i++) result[result.length - 1 - i] *= i / fade;
  let peak = 0;
  for (const value of result) peak = Math.max(peak, Math.abs(value));
  const scale = peak > 0 ? 0.75 / peak : 1;
  return result.map((value) => value * scale);
}

// Split γ: a ratchet click per good-count step. It is slightly higher when the
// divider moves up (more good), lower when it moves down, neutral for a tap.
export type SplitDirection = -1 | 0 | 1;
export function renderSplit(direction: SplitDirection, sampleRate: number): Float32Array {
  const center = direction > 0 ? 2300 : direction < 0 ? 1500 : 1850;
  // A softened noise impulse through a two-pole resonator.
  const result = new Float32Array(Math.ceil(sampleRate * 0.08));
  const r = Math.exp(-1 / (0.005 * sampleRate));
  const c = 2 * r * Math.cos(2 * Math.PI * center / sampleRate);
  let seed = 7919, excitation = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < result.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    excitation += 0.745 * ((seed >>> 0) / 2147483648 - 1 - excitation);
    const y = excitation * Math.exp(-i / sampleRate / 0.0018) + c * y1 - r * r * y2;
    y2 = y1; y1 = y;
    result[i] = y;
  }
  return finish(result, sampleRate);
}

// Kernel: x ∈ [−5, 5] picks a C-major triad tone, low on the left, high on the right.
export const kernelTones = [60, 64, 67, 72, 76] as const;
export function kernelNote(x: number): number {
  const bounded = clamp(Number.isFinite(x) ? x : 0, -5, 5);
  return kernelTones[Math.min(kernelTones.length - 1, Math.floor((bounded + 5) / 10 * kernelTones.length))];
}
// A round "pop": the pitch settles onto the triad tone within ~30 ms.
export function renderKernel(midi: number, sampleRate: number): Float32Array {
  const hz = midiToHz(midi);
  const result = new Float32Array(Math.ceil(sampleRate * 0.5));
  let phase = 0;
  for (let i = 0; i < result.length; i++) {
    const t = i / sampleRate;
    phase += 2 * Math.PI * hz * (1 - 0.22 * Math.exp(-t / 0.012)) / sampleRate;
    result[i] = (Math.sin(phase) + 0.12 * Math.sin(2 * phase)) * Math.exp(-t / 0.11) * Math.min(1, t / 0.0015);
  }
  return finish(result, sampleRate);
}

// Bandwidth: C-major pentatonic, C3–C5, higher for narrower h. A bounded,
// consonant palette rather than arbitrary frequencies from 1/h.
export const bandwidthNotes = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72] as const;
export function bandwidthFrequency(h: number): number {
  const bounded = Math.max(0.2, Math.min(1.5, Number.isFinite(h) ? h : 0.55));
  const index = Math.round((1.5 - bounded) / 1.3 * (bandwidthNotes.length - 1));
  return midiToHz(bandwidthNotes[index]);
}
// A short, cushioned wooden note: modal resonances with a soft attack.
export function renderBandwidth(h: number, sampleRate: number): Float32Array {
  const frequency = bandwidthFrequency(h);
  const decay = 0.075, brightness = 0.04;
  const result = new Float32Array(Math.ceil(sampleRate * 0.8));
  for (let i = 0; i < result.length; i++) {
    const t = i / sampleRate;
    const body = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t / decay)
      + brightness * Math.sin(2 * Math.PI * frequency * 2.71 * t) * Math.exp(-t / (decay * 0.45))
      + 0.18 * Math.sin(2 * Math.PI * frequency * 4.13 * t) * Math.exp(-t / (decay * 0.2));
    const attack = Math.min(1, t / 0.018);
    const tail = Math.min(1, (result.length - i - 1) / (sampleRate * 0.015));
    result[i] = attack * tail * (body * 0.5);
  }
  let peak = 0;
  for (const value of result) peak = Math.max(peak, Math.abs(value));
  const scale = 0.75 / Math.max(0.75, peak);
  return result.map((value) => value * scale);
}
