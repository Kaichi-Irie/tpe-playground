import { midiToHz } from "./labSoundDesign";

// Prior α: a warm pad chord that builds from C3 as α grows. Voice i fades in
// over α ∈ [(i − 1)/(n − 1), i/(n − 1)] × 10; the root is always present.
export const alphaVoicing = [48, 55, 60, 64, 67] as const;
const voiceWeights = [0.5, 0.34, 0.28, 0.24, 0.2];
const harmonics = [1, 0.18, 0.05];
const attack = 0.08;

export function alphaVoiceLevels(alpha: number): number[] {
  const position = Math.max(0, Math.min(10, Number.isFinite(alpha) ? alpha : 0)) / 10 * (alphaVoicing.length - 1);
  return alphaVoicing.map((_, i) => i === 0 ? 1 : Math.max(0, Math.min(1, position - i + 1)));
}

export class AlphaVoice {
  private readonly oscillators: OscillatorNode[] = [];
  private readonly gains: GainNode[] = [];
  private readonly envelope: GainNode;
  private readonly filter: BiquadFilterNode;
  private released = false;

  constructor(private readonly context: AudioContext, output: AudioNode) {
    this.filter = context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1800;
    this.filter.Q.value = 0.5;
    this.envelope = context.createGain();
    this.envelope.gain.setValueAtTime(0, context.currentTime);
    this.envelope.gain.setTargetAtTime(1, context.currentTime, attack);
    this.filter.connect(this.envelope);
    this.envelope.connect(output);
    const wave = context.createPeriodicWave(new Float32Array(harmonics.length + 1), new Float32Array([0, ...harmonics]));
    for (const midi of alphaVoicing) {
      const oscillator = context.createOscillator();
      oscillator.setPeriodicWave(wave);
      oscillator.frequency.value = midiToHz(midi);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, context.currentTime);
      oscillator.connect(gain);
      gain.connect(this.filter);
      oscillator.start();
      this.oscillators.push(oscillator);
      this.gains.push(gain);
    }
    this.oscillators[0].onended = () => {
      this.oscillators.forEach((oscillator) => oscillator.disconnect());
      this.gains.forEach((gain) => gain.disconnect());
      this.filter.disconnect();
      this.envelope.disconnect();
    };
  }

  update(value: number) {
    if (this.released) return;
    const now = this.context.currentTime;
    alphaVoiceLevels(value).forEach((level, i) => this.gains[i].gain.setTargetAtTime(level * voiceWeights[i], now, attack));
  }

  // A soft release lets the chord fade; a cut (mute, navigation) is near-instant.
  release(cut = false) {
    if (this.released) return;
    this.released = true;
    const now = this.context.currentTime;
    this.envelope.gain.setTargetAtTime(0, now, cut ? 0.01 : 0.15);
    this.oscillators.forEach((oscillator) => oscillator.stop(now + (cut ? 0.05 : 1.2)));
  }
}
