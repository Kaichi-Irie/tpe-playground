// Sustained audition voices: alpha changes tone color, never oscillator pitch.
type Layer = { hz: number; low: number; high: number };
export type AlphaDesign = {
  name: string; description: string; family: string;
  layers: readonly Layer[]; noise?: number; cutoff: readonly [number, number];
};
export const alphaDesigns: readonly AlphaDesign[] = [
  { name: "Velvet", family: "Soft", description: "A soft low hum that gently gains warmth", cutoff: [900, 1600], layers: [{ hz: 110, low: 0.8, high: 0.8 }, { hz: 220, low: 0, high: 0.25 }, { hz: 330, low: 0, high: 0.08 }] },
  { name: "Air pad", family: "Soft", description: "A floating tone with a little breath", cutoff: [500, 2200], noise: 0.2, layers: [{ hz: 165, low: 0.5, high: 0.5 }, { hz: 330, low: 0.05, high: 0.2 }] },
  { name: "Breath", family: "Texture", description: "Only filtered air, opening from dark to light; no pitched tone", cutoff: [240, 1500], noise: 1.4, layers: [] },
  { name: "Glass", family: "Resonance", description: "A clear sustained glass resonance with emerging upper tones", cutoff: [1800, 4000], layers: [{ hz: 220, low: 0.55, high: 0.55 }, { hz: 607, low: 0.01, high: 0.16 }, { hz: 902, low: 0, high: 0.06 }] },
  { name: "Singing bowl", family: "Resonance", description: "A deep resonant bowl with a slow natural beating", cutoff: [1200, 2400], layers: [{ hz: 130, low: 0.5, high: 0.5 }, { hz: 132, low: 0.1, high: 0.22 }, { hz: 355, low: 0.02, high: 0.16 }] },
  { name: "Warm reed", family: "Synth", description: "A rounded organ-like tone that becomes fuller", cutoff: [700, 2400], layers: [{ hz: 110, low: 0.65, high: 0.65 }, { hz: 330, low: 0.02, high: 0.25 }, { hz: 550, low: 0, high: 0.12 }, { hz: 770, low: 0, high: 0.05 }] },
  { name: "Silk chorus", family: "Soft", description: "A smooth ensemble that widens as alpha grows", cutoff: [1100, 2200], layers: [{ hz: 164, low: 0.08, high: 0.25 }, { hz: 165, low: 0.5, high: 0.5 }, { hz: 166.2, low: 0.08, high: 0.25 }, { hz: 330, low: 0, high: 0.05 }] },
  { name: "Vowel", family: "Synth", description: "A rounded oo-to-ah color, with one unchanging fundamental", cutoff: [1000, 2600], layers: [{ hz: 110, low: 0.45, high: 0.45 }, { hz: 220, low: 0.25, high: 0.04 }, { hz: 440, low: 0.02, high: 0.2 }, { hz: 660, low: 0, high: 0.15 }, { hz: 880, low: 0, high: 0.06 }] },
  { name: "Ocean", family: "Texture", description: "Low, soft air with a quiet bass undertone", cutoff: [150, 650], noise: 1.2, layers: [{ hz: 73, low: 0.25, high: 0.35 }, { hz: 146, low: 0, high: 0.12 }] },
];

export function alphaAmount(value: number): number {
  return Math.max(0, Math.min(10, Number.isFinite(value) ? value : 0)) / 10;
}

export class AlphaVoice {
  private readonly sources: (OscillatorNode | AudioBufferSourceNode)[] = [];
  private readonly gains: GainNode[] = [];
  private readonly filter: BiquadFilterNode;
  private readonly envelope: GainNode;
  private released = false;
  private readonly design: AlphaDesign;

  constructor(private readonly context: AudioContext, output: AudioNode, readonly variant: number) {
    this.design = alphaDesigns[variant] ?? alphaDesigns[0];
    this.filter = context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.Q.value = 0.55;
    this.envelope = context.createGain();
    this.envelope.gain.setValueAtTime(0, context.currentTime);
    this.envelope.gain.setTargetAtTime(0.65, context.currentTime, 0.06);
    this.filter.connect(this.envelope);
    this.envelope.connect(output);
    for (const layer of this.design.layers) {
      const source = context.createOscillator();
      source.type = "sine";
      source.frequency.value = layer.hz;
      this.addSource(source);
    }
    if (this.design.noise) {
      const source = context.createBufferSource();
      const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const data = buffer.getChannelData(0);
      let seed = 3187;
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        data[i] = (seed >>> 0) / 2147483648 - 1;
      }
      source.buffer = buffer;
      source.loop = true;
      this.addSource(source);
    }
    let remaining = this.sources.length;
    for (const source of this.sources) {
      source.onended = () => {
        source.disconnect();
        if (--remaining === 0) {
          this.gains.forEach((gain) => gain.disconnect());
          this.filter.disconnect();
          this.envelope.disconnect();
        }
      };
      source.start();
    }
  }

  private addSource(source: OscillatorNode | AudioBufferSourceNode) {
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, this.context.currentTime);
    source.connect(gain);
    gain.connect(this.filter);
    this.sources.push(source);
    this.gains.push(gain);
  }

  update(value: number) {
    if (this.released) return;
    const amount = alphaAmount(value);
    const now = this.context.currentTime;
    this.gains.forEach((gain, index) => {
      const layer = this.design.layers[index];
      const target = layer ? layer.low + (layer.high - layer.low) * amount : this.design.noise! * (0.6 + 0.4 * amount);
      gain.gain.setTargetAtTime(target, now, 0.09);
    });
    const [low, high] = this.design.cutoff;
    this.filter.frequency.setTargetAtTime(low * (high / low) ** amount, now, 0.09);
  }

  release() {
    if (this.released) return;
    this.released = true;
    const now = this.context.currentTime;
    this.envelope.gain.setTargetAtTime(0, now, 0.045);
    this.sources.forEach((source) => source.stop(now + 0.3));
  }
}
