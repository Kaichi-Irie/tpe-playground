// Instrument-inspired synthesis, not recordings of these instruments.
// Hold the original pizzicato phrase constant across timbre comparisons:
// 220 Hz → 275 Hz (a just major third), with 75 ms between attacks.
const phrase = { frequency: 220, notes: [1, 1.25], spacing: 0.075 } as const;
export const diceSounds = [
  { ...phrase, name: "Pizzicato · original", hint: "Reference · soft string", ratios: [1, 2, 3, 4, 5], levels: [1, 0.4, 0.2, 0.08, 0.04], decay: 0.095, attack: 0.004 },
  { ...phrase, name: "Pizzicato · velvet", hint: "Softer attack · rounder body", ratios: [1, 2, 3, 4, 5], levels: [1, 0.24, 0.09, 0.035, 0.01], decay: 0.115, attack: 0.008 },
  { ...phrase, name: "Pizzicato · dry", hint: "Shorter · close pluck", ratios: [1, 2, 3, 4, 5], levels: [1, 0.46, 0.23, 0.1, 0.045], decay: 0.065, attack: 0.003 },
  { ...phrase, name: "Woodblock · hollow", hint: "Low hollow knock", ratios: [1, 1.63, 2.9], levels: [1, 0.4, 0.12], decay: 0.045, attack: 0.002 },
  { ...phrase, name: "Woodblock · soft", hint: "Padded strike · warm wood", ratios: [1, 1.63, 2.9], levels: [1, 0.22, 0.055], decay: 0.075, attack: 0.006 },
  { ...phrase, name: "Woodblock · string", hint: "Wooden knock + plucked body", ratios: [1, 1.63, 2, 3, 4], levels: [1, 0.18, 0.26, 0.12, 0.035], decay: 0.085, attack: 0.004 },
  { ...phrase, name: "Claves · low", hint: "Low crisp tap", ratios: [1, 2.4, 4.6], levels: [1, 0.25, 0.08], decay: 0.027, attack: 0.0015 },
  { ...phrase, name: "Claves · rounded", hint: "Gentler edge · longer body", ratios: [1, 2.4, 4.6], levels: [1, 0.13, 0.025], decay: 0.05, attack: 0.004 },
  { ...phrase, name: "Claves · string", hint: "Crisp contact + warm string", ratios: [1, 2, 2.4, 3, 4.6], levels: [1, 0.3, 0.13, 0.12, 0.035], decay: 0.07, attack: 0.003 },
] as const;

export function renderDice(variant: number, sampleRate: number): Float32Array {
  const preset = diceSounds[variant] ?? diceSounds[0];
  const samples = new Float32Array(Math.ceil(sampleRate * 0.75));
  for (let note = 0; note < preset.notes.length; note++) {
    const onset = note * preset.spacing;
    for (let i = Math.ceil(onset * sampleRate); i < samples.length; i++) {
      const t = i / sampleRate - onset;
      let value = 0;
      for (let partial = 0; partial < preset.ratios.length; partial++) {
        const frequency = preset.frequency * preset.notes[note] * preset.ratios[partial];
        value += preset.levels[partial] * Math.sin(2 * Math.PI * frequency * t)
          * Math.exp(-t * (1 + partial * 0.5) / preset.decay);
      }
      const envelope = Math.min(1, t / preset.attack) * Math.min(1, (samples.length - i - 1) / (sampleRate * 0.025));
      samples[i] += value * envelope * Math.pow(0.76, note);
    }
  }
  let energy = 0, peak = 0;
  for (const value of samples) { energy += value * value; peak = Math.max(peak, Math.abs(value)); }
  // Similar audition energy, with a peak ceiling; perceived loudness still needs listening.
  const scale = Math.min(0.085 / Math.sqrt(energy / samples.length), 0.65 / peak);
  return samples.map((value) => value * scale);
}
