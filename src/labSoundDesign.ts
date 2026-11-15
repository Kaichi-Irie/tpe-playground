export type LabSound = "kernel" | "sample" | "bandwidth" | "split" | "alpha";
export type SoundDesign = { name: string; description: string; frequency: number; decay: number; noise: number; brightness: number; impacts: number };
// Retained audition studies. Runtime uses kernel 0/2/7, bandwidth 2 and split 0;
// sample studies here are archival. Live dice synthesis is in diceSounds.ts.
export const soundDesigns: Record<Exclude<LabSound, "alpha">, readonly SoundDesign[]> = {
  kernel: [
    { name: "Soft walnut", description: "Low, rounded wooden body", frequency: 290, decay: 0.09, noise: 0.12, brightness: 0.25, impacts: 1 },
    { name: "Maple block", description: "Dry, firm wood", frequency: 430, decay: 0.065, noise: 0.2, brightness: 0.4, impacts: 1 },
    { name: "Felt mallet", description: "Soft attack, warm resonance", frequency: 340, decay: 0.14, noise: 0.03, brightness: 0.12, impacts: 1 },
    { name: "Hollow oak", description: "Deeper, hollow knock", frequency: 220, decay: 0.11, noise: 0.18, brightness: 0.6, impacts: 1 },
    { name: "Ceramic pebble", description: "Small, clear mineral tone", frequency: 760, decay: 0.12, noise: 0.08, brightness: 0.65, impacts: 1 },
    { name: "Rubber pad", description: "Damped, tactile thud", frequency: 180, decay: 0.045, noise: 0.3, brightness: 0.12, impacts: 1 },
    { name: "Bamboo", description: "Light but textured, hollow tap", frequency: 560, decay: 0.08, noise: 0.24, brightness: 0.7, impacts: 1 },
    { name: "Muted marimba", description: "Warm, longer pitched body", frequency: 390, decay: 0.18, noise: 0.04, brightness: 0.32, impacts: 1 },
  ],
  bandwidth: [
    { name: "Felt xylophone", description: "Soft attack, quiet upper partials", frequency: 280, decay: 0.12, noise: 0, brightness: 0.08, impacts: 1 },
    { name: "Warm marimba", description: "Round and gently resonant", frequency: 280, decay: 0.18, noise: 0, brightness: 0.18, impacts: 1 },
    { name: "Muted wood", description: "Short, cushioned wooden note", frequency: 280, decay: 0.075, noise: 0, brightness: 0.04, impacts: 1 },
    { name: "Soft vibraphone", description: "Smooth, slightly shimmering sustain", frequency: 280, decay: 0.23, noise: 0, brightness: 0.3, impacts: 1 },
  ],
  split: [
    { name: "Felt piano C3", description: "Low C, intimate and rounded", frequency: 130.81, decay: 0.45, noise: 0, brightness: 0.14, impacts: 1 },
    { name: "Warm piano E3", description: "Warm middle-low E", frequency: 164.81, decay: 0.55, noise: 0, brightness: 0.24, impacts: 1 },
    { name: "Deep piano A2", description: "Deeper, spacious resonance", frequency: 110, decay: 0.65, noise: 0, brightness: 0.2, impacts: 1 },
    { name: "Muted piano G3", description: "Compact, soft G", frequency: 196, decay: 0.32, noise: 0, brightness: 0.12, impacts: 1 },
    { name: "Open fifth", description: "Low C with a quiet fifth", frequency: 130.81, decay: 0.6, noise: 0, brightness: 0.3, impacts: 1 },
    { name: "Low felt", description: "One octave lower · soft felt piano", frequency: 65.405, decay: 0.38, noise: 0, brightness: 0.1, impacts: 1 },
    { name: "Deep velvet", description: "Deeper A1 base · warm, lingering piano", frequency: 55, decay: 0.55, noise: 0, brightness: 0.08, impacts: 1 },
    { name: "Low muted", description: "Low C2 base · short, cushioned piano", frequency: 65.405, decay: 0.2, noise: 0, brightness: 0.06, impacts: 1 },
  ],
  sample: [
    { name: "Dice on walnut", description: "Hard dice, warm wooden surface", frequency: 310, decay: 0.045, noise: 0.65, brightness: 0.5, impacts: 5 },
    { name: "Dice on maple", description: "Crisper impacts on a hard surface", frequency: 480, decay: 0.032, noise: 0.85, brightness: 0.8, impacts: 6 },
    { name: "Heavy resin", description: "Weighty roll with a low body", frequency: 210, decay: 0.06, noise: 0.55, brightness: 0.4, impacts: 4 },
    { name: "Small plastic", description: "Small, dry rattling dice", frequency: 710, decay: 0.022, noise: 0.95, brightness: 0.85, impacts: 8 },
    { name: "Wooden tray", description: "Hollow tray resonance", frequency: 260, decay: 0.09, noise: 0.5, brightness: 0.7, impacts: 5 },
    { name: "Felt-lined tray", description: "Soft landings, subdued rattle", frequency: 240, decay: 0.025, noise: 0.25, brightness: 0.16, impacts: 4 },
    { name: "Two dice", description: "Busy, overlapping collisions", frequency: 390, decay: 0.035, noise: 0.8, brightness: 0.65, impacts: 11 },
    { name: "Single tumble", description: "A compact three-impact roll", frequency: 350, decay: 0.05, noise: 0.7, brightness: 0.5, impacts: 3 },
  ],
};

// C-major pentatonic, C3–C5: a bounded, consonant palette rather than
// arbitrary frequencies from 1/h. The mapping is illustrative sonification.
export const bandwidthNotes = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72] as const;
export function bandwidthFrequency(h: number): number {
  const bounded = Math.max(0.2, Math.min(1.5, Number.isFinite(h) ? h : 0.55));
  const index = Math.round((1.5 - bounded) / 1.3 * (bandwidthNotes.length - 1));
  return 440 * 2 ** ((bandwidthNotes[index] - 69) / 12);
}

// Five broad height bands on the plot (y = 0–8), sharing bandwidth's palette.
export const splitNotes = [48, 50, 52, 55, 57] as const;
export function splitFrequency(height: number, variant = 0): number {
  const bounded = Math.max(0, Math.min(8, Number.isFinite(height) ? height : 0));
  const index = Math.min(splitNotes.length - 1, Math.floor(bounded / 8 * splitNotes.length));
  return 440 * 2 ** ((splitNotes[index] - 69) / 12) * (soundDesigns.split[variant]?.frequency ?? 130.81) / 130.81;
}

// Modal resonances plus a filtered noise transient approximate material impacts.
// Fixed seeds make comparison repeatable. These are synthesized, not recordings.
export function renderSound(sound: Exclude<LabSound, "alpha">, variant: number, sampleRate: number, value?: number): Float32Array {
  const design = soundDesigns[sound][variant] ?? soundDesigns.kernel[0];
  const bandwidth = sound === "bandwidth";
  const count = bandwidth ? 1 : design.impacts;
  const length = sound === "split" ? 2.2 : bandwidth ? 0.8 : 0.65;
  const result = new Float32Array(Math.ceil(sampleRate * length));
  let seed = 1937 + variant * 71;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
  let onset = 0;
  for (let impact = 0; impact < count; impact++) {
    if (impact) onset += (0.02 + random() * 0.045) * (1 - impact / count * 0.4);
    const frequency = bandwidth ? bandwidthFrequency(value ?? 0.55) : sound === "split" && value !== undefined ? splitFrequency(value, variant) : design.frequency * (count > 1 ? 0.8 + random() * 0.4 : 1);
    const decay = design.decay;
    const strength = Math.pow(0.8, impact);
    let lowNoise = 0;
    for (let i = Math.floor(onset * sampleRate); i < result.length; i++) {
      const t = i / sampleRate - onset;
      if (t < 0) continue;
      const raw = random() * 2 - 1;
      lowNoise += 0.22 * (raw - lowNoise);
      const noise = lowNoise * (1 - design.brightness) + (raw - lowNoise) * design.brightness;
      let body = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t / decay)
        + design.brightness * Math.sin(2 * Math.PI * frequency * 2.71 * t) * Math.exp(-t / (decay * 0.45))
        + 0.18 * Math.sin(2 * Math.PI * frequency * 4.13 * t) * Math.exp(-t / (decay * 0.2));
      if (sound === "split") {
        body = 0;
        for (let harmonic = 1; harmonic <= 6; harmonic++) {
          const partial = frequency * harmonic * Math.sqrt(1 + 0.0003 * harmonic * harmonic);
          body += Math.sin(2 * Math.PI * partial * t) * Math.exp(-t * (1 + harmonic * 0.25) / decay) / Math.pow(harmonic, 1.8 - design.brightness);
        }
        if (variant === 4) body += 0.18 * Math.sin(2 * Math.PI * frequency * 1.5 * t) * Math.exp(-t / decay);
      }
      const attack = Math.min(1, t / (bandwidth || sound === "split" ? 0.018 : variant === 2 && sound !== "sample" ? 0.009 : 0.0015));
      const tail = Math.min(1, (result.length - i - 1) / (sampleRate * 0.015));
      result[i] += strength * attack * tail * (body * 0.5 + noise * design.noise * Math.exp(-t / 0.009));
    }
  }
  // Keep headroom and comparable overall energy without normalizing away texture.
  let peak = 0;
  for (const value of result) peak = Math.max(peak, Math.abs(value));
  const scale = 0.75 / Math.max(0.75, peak);
  return result.map((value) => value * scale);
}


// Nine cached choices, deterministic and independent of the optimizer's RNG.
export const kernelRotation = [
  { variant: 2, rate: 1 }, { variant: 7, rate: 0.98 }, { variant: 0, rate: 1.02 },
  { variant: 2, rate: 1.035 }, { variant: 7, rate: 1.015 }, { variant: 0, rate: 0.97 },
  { variant: 2, rate: 0.975 }, { variant: 7, rate: 1.04 }, { variant: 0, rate: 1 },
] as const;
