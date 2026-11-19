// Instrument-inspired synthesis, not a recording: a low claves tap played as
// C4 → E4 (a just major third, in the Lab's C major), 75 ms between attacks.
const dice = { frequency: 261.63, notes: [1, 1.25], spacing: 0.075, ratios: [1, 2.4, 4.6], levels: [1, 0.25, 0.08], decay: 0.027, attack: 0.0015 } as const;
export const diceNotes = dice.notes.map((ratio) => dice.frequency * ratio);

export function renderDice(sampleRate: number): Float32Array {
  const preset = dice;
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
