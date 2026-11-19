import { renderSound } from "./labSoundDesign";
// Lab voices and their audition alternatives. Pitched voices use whole-number
// partials and C-major pitches, so overlapping tails and chords stay consonant;
// some bandwidth studies deliberately glide continuously instead.
// The Lab plays the adopted index of each list; sound-preview.html plays all.

export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

// γ split: good count k = 1, 2, … walks up the C-major scale from C4.
export const splitScale = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84] as const;
export const solfege = ["ド", "レ", "ミ", "ファ", "ソ", "ラ", "シ"] as const;
export function splitStudyNote(goodCount: number): number {
  const index = clamp(Math.round(Number.isFinite(goodCount) ? goodCount : 1) - 1, 0, splitScale.length - 1);
  return splitScale[index];
}

// Kernel: x ∈ [−5, 5] picks a C-major triad tone, low on the left, high on the right.
export const kernelTones = [60, 64, 67, 72, 76] as const;
export function kernelStudyNote(x: number): number {
  const bounded = clamp(Number.isFinite(x) ? x : 0, -5, 5);
  return kernelTones[Math.min(kernelTones.length - 1, Math.floor((bounded + 5) / 10 * kernelTones.length))];
}

export function noteName(midi: number): string {
  const pitchClass = [0, 2, 4, 5, 7, 9, 11].indexOf(((midi % 12) + 12) % 12);
  const letters = "CDEFGAB";
  return `${solfege[pitchClass] ?? "?"} ${letters[pitchClass] ?? "?"}${Math.floor(midi / 12) - 1}`;
}

type Renderer = (hz: number, sampleRate: number) => Float32Array;
export type ToneStudy = { id: string; name: string; description: string; render: Renderer };

function finish(result: Float32Array, sampleRate: number): Float32Array {
  const fade = Math.floor(sampleRate * 0.02);
  for (let i = 0; i < fade; i++) result[result.length - 1 - i] *= i / fade;
  let peak = 0;
  for (const value of result) peak = Math.max(peak, Math.abs(value));
  const scale = peak > 0 ? 0.75 / peak : 1;
  for (let i = 0; i < result.length; i++) result[i] *= scale;
  return result;
}

// Sum of decaying harmonic partials: [multiple, amplitude, decay seconds].
function additive(partials: readonly (readonly [number, number, number])[], length: number, attack: number): Renderer {
  return (hz, sampleRate) => {
    const result = new Float32Array(Math.ceil(sampleRate * length));
    for (let i = 0; i < result.length; i++) {
      const t = i / sampleRate;
      let value = 0;
      for (const [multiple, amplitude, decay] of partials) {
        if (hz * multiple > sampleRate * 0.45) continue;
        value += amplitude * Math.sin(2 * Math.PI * hz * multiple * t) * Math.exp(-t / decay);
      }
      result[i] = value * Math.min(1, t / attack);
    }
    return finish(result, sampleRate);
  };
}

function softPiano(hz: number, sampleRate: number): Float32Array {
  const partials = Array.from({ length: 8 }, (_, index) => {
    const h = index + 1;
    return [h, 1 / h ** 1.7, 1.1 / (1 + 0.45 * index)] as const;
  });
  return additive(partials, 1.8, 0.005)(hz, sampleRate);
}

// Two-operator FM at a 1:1 ratio: a harmonic, tine-like electric piano.
function electricPiano(hz: number, sampleRate: number): Float32Array {
  const result = new Float32Array(Math.ceil(sampleRate * 1.8));
  for (let i = 0; i < result.length; i++) {
    const t = i / sampleRate;
    const index = 1.1 * Math.exp(-t / 0.22) + 0.15;
    const phase = 2 * Math.PI * hz * t;
    result[i] = Math.sin(phase + index * Math.sin(phase)) * Math.exp(-t / 0.85) * Math.min(1, t / 0.003);
  }
  return finish(result, sampleRate);
}

// Karplus–Strong with a fractional delay, so every note lands in tune.
function pluck(hz: number, sampleRate: number): Float32Array {
  const result = new Float32Array(Math.ceil(sampleRate * 0.9));
  const delay = sampleRate / hz - 0.5;
  const whole = Math.floor(delay);
  const fraction = delay - whole;
  let seed = 4111;
  let smooth = 0;
  for (let i = 0; i <= whole + 1 && i < result.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    smooth += 0.45 * ((seed >>> 0) / 2147483648 - 1 - smooth);
    result[i] = smooth;
  }
  for (let i = whole + 2; i < result.length; i++) {
    const read = (offset: number) => result[i - offset];
    const delayed = read(whole) * (1 - fraction) + read(whole + 1) * fraction;
    const previous = read(whole + 1) * (1 - fraction) + read(whole + 2) * fraction;
    result[i] = 0.996 * 0.5 * (delayed + previous);
  }
  return finish(result, sampleRate);
}

// A round "pop": the pitch settles onto the chord tone within ~30 ms.
function bubble(hz: number, sampleRate: number): Float32Array {
  const result = new Float32Array(Math.ceil(sampleRate * 0.5));
  let phase = 0;
  for (let i = 0; i < result.length; i++) {
    const t = i / sampleRate;
    phase += 2 * Math.PI * hz * (1 - 0.22 * Math.exp(-t / 0.012)) / sampleRate;
    result[i] = (Math.sin(phase) + 0.12 * Math.sin(2 * phase)) * Math.exp(-t / 0.11) * Math.min(1, t / 0.0015);
  }
  return finish(result, sampleRate);
}

export const celesta = additive([[1, 1, 0.7], [2, 0.22, 0.25], [4, 0.14, 0.09]], 1.4, 0.0015);

// γ split: each value is the good count k; direction is +1 when the divider
// moves up (more good), −1 down, 0 for a tap that confirms a split.
export type SplitDirection = -1 | 0 | 1;
export type SplitStudy = { id: string; name: string; description: string; level: number;
  /** Long tones crossfade between slider steps; short clicks strike at once. */
  legato?: boolean;
  render: (goodCount: number, direction: SplitDirection, sampleRate: number) => Float32Array };
const scaleTone = (render: Renderer) => (k: number, _direction: SplitDirection, sampleRate: number) => render(midiToHz(splitStudyNote(k)), sampleRate);
export const splitStudies: readonly SplitStudy[] = [
  { id: "S1", legato: true, name: "Soft piano", description: "ドレミ音階のピアノ（比較用）", level: 1, render: scaleTone(softPiano) },
  { id: "S2", legato: true, name: "Electric piano", description: "ドレミ音階のエレピ（比較用）", level: 1, render: scaleTone(electricPiano) },
  { id: "S3", legato: true, name: "Celesta", description: "ドレミ音階のオルゴール寄り（比較用）", level: 1, render: scaleTone(celesta) },
  { id: "S4", name: "Click", description: "小さな「カチッ」。k に関係なく同じ音で、いちばんシンプル", level: 0.5,
    render: (_k, _d, sampleRate) => tick(1900, 0.005, sampleRate, 0.3) },
  { id: "S5", name: "Ratchet", description: "ラチェットの「カチ」。上げると少し高く、下げると少し低い。向きだけが分かる", level: 0.5,
    render: (_k, direction, sampleRate) => tick(direction > 0 ? 2300 : direction < 0 ? 1500 : 1850, 0.005, sampleRate, 0.3) },
  { id: "S6", name: "Wood knock", description: "柔らかい木の「コッ」。低めで落ち着いた音、k に関係なく同じ", level: 0.7,
    render: (_k, _d, sampleRate) => tick(520, 0.03, sampleRate, 0.8) },
  { id: "S7", name: "Rising knock", description: "S6 の「コッ」が、good が増えるほど少しずつ高くなる（音階ではなく連続）", level: 0.7,
    render: (k, _d, sampleRate) => tick(380 * 2 ** (clamp(k - 1, 0, 12) / 12), 0.03, sampleRate, 0.8) },
  { id: "S8", name: "Swish", description: "仕切りが滑る「スッ」。上げると上向き、下げると下向きにかすれる", level: 0.6,
    render: (_k, direction, sampleRate) => swish(direction, sampleRate) },
  { id: "S9", name: "Latch", description: "留め具の「カチャ」。クリックに小さな低音の手応え", level: 0.6,
    render: (_k, _d, sampleRate) => latch(sampleRate) },
];

// A short band-passed noise sweep; the band moves with the divider.
function swish(direction: SplitDirection, sampleRate: number): Float32Array {
  const length = 0.11;
  const result = new Float32Array(Math.ceil(sampleRate * length));
  const random = seeded(2203);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < result.length; i++) {
    const t = i / sampleRate;
    const p = t / length;
    const center = direction > 0 ? 900 * 2 ** (1.4 * p) : direction < 0 ? 2400 * 2 ** (-1.4 * p) : 1500;
    const r = 0.985;
    const c = 2 * r * Math.cos(2 * Math.PI * center / sampleRate);
    const y = random() * (1 - r) * 4 + c * y1 - r * r * y2;
    y2 = y1; y1 = y;
    result[i] = y * Math.sin(Math.PI * p) ** 2;
  }
  return finish(result, sampleRate);
}

// A click with a small, quickly damped low body underneath.
function latch(sampleRate: number): Float32Array {
  const click = tick(2100, 0.004, sampleRate, 0.2);
  const result = new Float32Array(Math.ceil(sampleRate * 0.12));
  for (let i = 0; i < result.length; i++) {
    const t = i / sampleRate;
    const body = Math.sin(2 * Math.PI * 170 * t) * Math.exp(-t / 0.025) * Math.min(1, t / 0.001);
    result[i] = 0.55 * (click[i] ?? 0) + 0.6 * body;
  }
  return finish(result, sampleRate);
}

export const kernelStudies: readonly ToneStudy[] = [
  { id: "K1", name: "Soft marimba", description: "木琴の柔らかい打鍵。倍音は2オクターブ上だけ", render: additive([[1, 1, 0.3], [4, 0.22, 0.05]], 0.75, 0.002) },
  { id: "K2", name: "Pluck", description: "弦をはじいた音。すっと消える", render: pluck },
  { id: "K3", name: "Bubble", description: "ぽこっと置く感じ。短く軽い", render: bubble },
  { id: "K4", name: "Glass bell", description: "小さなベル。きらっと短く", render: additive([[1, 1, 0.45], [2, 0.3, 0.16], [3, 0.12, 0.08]], 0.9, 0.0015) },
];

// Prior α: a chord that builds as α grows. Voice i fades in over
// α ∈ [(i − 1)/(n − 1), i/(n − 1)] × 10; the root is always present.
export const alphaVoicing = [48, 55, 60, 64, 67] as const;
export function alphaVoiceLevels(alpha: number, count = alphaVoicing.length): number[] {
  const position = clamp(Number.isFinite(alpha) ? alpha : 0, 0, 10) / 10 * (count - 1);
  return Array.from({ length: count }, (_, i) => i === 0 ? 1 : clamp(position - i + 1, 0, 1));
}

export type ChordStudy = {
  id: string; name: string; description: string;
  harmonics: readonly number[]; cutoff: number; attack: number; chime: boolean;
};
export const alphaStudies: readonly ChordStudy[] = [
  { id: "A1", name: "Warm pad", description: "柔らかいパッド。αで和音が少しずつ厚くなる", harmonics: [1, 0.18, 0.05], cutoff: 1800, attack: 0.08, chime: false },
  { id: "A2", name: "Soft strings", description: "弦楽合奏寄り。少し温かく、ゆっくり立ち上がる", harmonics: [1, 0.45, 0.25, 0.14, 0.08, 0.05], cutoff: 1100, attack: 0.2, chime: false },
  { id: "A3", name: "Pad + chime", description: "控えめなパッドに、音が加わるたびに小さなチャイム", harmonics: [1, 0.15], cutoff: 1500, attack: 0.08, chime: true },
];
// sample indexes diceSounds in diceSounds.ts (10 = Claves · low · ド→ミ).
export const adoptedVoices = { split: 4, kernel: 2, alpha: 0, bandwidth: 0, sample: 10 } as const;
const voiceWeights = [0.5, 0.34, 0.28, 0.24, 0.2];

export class ChordPad {
  private readonly oscillators: OscillatorNode[] = [];
  private readonly gains: GainNode[] = [];
  private readonly envelope: GainNode;
  private readonly filter: BiquadFilterNode;
  private levels: number[] = [];
  released = false;

  constructor(private readonly context: AudioContext, output: AudioNode, readonly study: ChordStudy, private readonly chime: (midi: number) => void = () => {}) {
    this.filter = context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = study.cutoff;
    this.filter.Q.value = 0.5;
    this.envelope = context.createGain();
    this.envelope.gain.setValueAtTime(0, context.currentTime);
    this.envelope.gain.setTargetAtTime(study.chime ? 0.7 : 1, context.currentTime, study.attack);
    this.filter.connect(this.envelope);
    this.envelope.connect(output);
    const real = new Float32Array(study.harmonics.length + 1);
    const imag = new Float32Array([0, ...study.harmonics]);
    const wave = context.createPeriodicWave(real, imag);
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
  }

  update(alpha: number) {
    if (this.released) return;
    const levels = alphaVoiceLevels(alpha);
    const now = this.context.currentTime;
    levels.forEach((level, i) => {
      this.gains[i].gain.setTargetAtTime(level * voiceWeights[i], now, this.study.attack);
      if (this.study.chime && i > 0 && level >= 0.5 && (this.levels[i] ?? 0) < 0.5) this.chime(alphaVoicing[i] + 12);
    });
    this.levels = levels;
  }

  // A soft release lets the chord fade; a cut (mute, navigation) is near-instant.
  release(cut = false) {
    if (this.released) return;
    this.released = true;
    const now = this.context.currentTime;
    this.envelope.gain.setTargetAtTime(0, now, cut ? 0.01 : 0.15);
    this.oscillators.forEach((oscillator) => oscillator.stop(now + (cut ? 0.05 : 1.2)));
    this.oscillators[0].onended = () => {
      this.oscillators.forEach((oscillator) => oscillator.disconnect());
      this.gains.forEach((gain) => gain.disconnect());
      this.filter.disconnect();
      this.envelope.disconnect();
    };
  }
}

// Bandwidth h ∈ [0.2, 1.5]. The analogy is wavelength: a narrow kernel sounds
// high, short or bright; a wide one low, long or dark. Pitch moves continuously
// (or snaps to C-major triad tones) rather than stepping through a melody.
export function bandwidthAmount(h: number): number {
  return clamp(((Number.isFinite(h) ? h : 0.55) - 0.2) / 1.3, 0, 1);
}
export type BandwidthStudy = { id: string; name: string; description: string; level: number } & (
  | { kind: "tone"; render: (h: number, sampleRate: number) => Float32Array }
  | { kind: "sustain"; voice: "air" | "glide" | "bright" }
);

// Narrow h → high, wide h → low, evenly spaced on a log-frequency scale.
export function widthHz(h: number, high = 1400, low = 220): number {
  return high * (low / high) ** bandwidthAmount(h);
}
const triadTones = Array.from({ length: 37 }, (_, i) => 48 + i).filter((midi) => [0, 4, 7].includes(midi % 12));
export function snapToTriad(hz: number): number {
  const midi = 69 + 12 * Math.log2(hz / 440);
  return midiToHz(triadTones.reduce((best, tone) => Math.abs(tone - midi) < Math.abs(best - midi) ? tone : best));
}

// A Gabor atom: a Gaussian-windowed sine with a fixed number of cycles, so a
// narrow kernel is literally a short, high packet and a wide one a long, low one.
function gaussianBlip(hz: number, sampleRate: number): Float32Array {
  const sigma = 10 / hz;
  const result = new Float32Array(Math.ceil(sampleRate * sigma * 7));
  const center = sigma * 3.5;
  for (let i = 0; i < result.length; i++) {
    const t = i / sampleRate;
    result[i] = Math.sin(2 * Math.PI * hz * (t - center)) * Math.exp(-((t - center) ** 2) / (2 * sigma * sigma));
  }
  return finish(result, sampleRate);
}

// A calmer muted-wood note: harmonic body, a faint wooden partial, no bright
// 4.13× overtone, and a gentler attack than the original bandwidth voice.
function calmWood(hz: number, sampleRate: number): Float32Array {
  const result = new Float32Array(Math.ceil(sampleRate * 0.6));
  for (let i = 0; i < result.length; i++) {
    const t = i / sampleRate;
    result[i] = (Math.sin(2 * Math.PI * hz * t) * Math.exp(-t / 0.11)
      + 0.12 * Math.sin(4 * Math.PI * hz * t) * Math.exp(-t / 0.05)
      + 0.04 * Math.sin(2 * Math.PI * hz * 2.71 * t) * Math.exp(-t / 0.03)) * Math.min(1, t / 0.008);
  }
  return finish(result, sampleRate);
}
// The original pentatonic mapping with its top octave removed: C3–C4.
const lowPentatonic = [48, 50, 52, 55, 57, 60] as const;
function lowPentatonicHz(h: number): number {
  const n = bandwidthAmount(h);
  return midiToHz(lowPentatonic[Math.round((1 - n) * (lowPentatonic.length - 1))]);
}

// A droplet: the pitch rises quickly onto its target, then decays.
function droplet(hz: number, sampleRate: number): Float32Array {
  const result = new Float32Array(Math.ceil(sampleRate * 0.3));
  let phase = 0;
  for (let i = 0; i < result.length; i++) {
    const t = i / sampleRate;
    phase += 2 * Math.PI * hz * (1 - 0.4 * Math.exp(-t / 0.015)) / sampleRate;
    result[i] = Math.sin(phase) * Math.exp(-t / 0.06) * Math.min(1, t / 0.002);
  }
  return finish(result, sampleRate);
}

function seeded(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 2147483648 - 1; };
}

// A noise impulse through a two-pole resonator: a short tick. `soft` (0–1)
// dulls the impulse like a felt mallet, removing the high click.
function tick(center: number, decay: number, sampleRate: number, soft = 0): Float32Array {
  const result = new Float32Array(Math.ceil(sampleRate * Math.max(0.08, decay * 6)));
  const random = seeded(7919);
  const smoothing = 1 - 0.85 * soft;
  const impulse = 0.0012 + 0.002 * soft;
  let excitation = 0;
  const r = Math.exp(-1 / (decay * sampleRate));
  const c = 2 * r * Math.cos(2 * Math.PI * Math.min(center, sampleRate * 0.4) / sampleRate);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < result.length; i++) {
    const t = i / sampleRate;
    excitation += smoothing * (random() - excitation);
    const x = excitation * Math.exp(-t / impulse);
    const y = x + c * y1 - r * r * y2;
    y2 = y1; y1 = y;
    result[i] = y;
  }
  return finish(result, sampleRate);
}

export const bandwidthStudies: readonly BandwidthStudy[] = [
  { id: "B0", name: "Muted wood", description: "h でペンタトニックの音程が変わる木の音（C3〜C5）", level: 1, kind: "tone",
    render: (h, sampleRate) => renderSound("bandwidth", 2, sampleRate, h) },
  { id: "B1", name: "Detent tick", description: "ノブのクリック。h が小さいほど硬く高め、大きいほど柔らかく低め", level: 0.55, kind: "tone",
    render: (h, sampleRate) => { const n = bandwidthAmount(h); return tick(3200 * 0.3 ** n, 0.006 + 0.008 * n, sampleRate); } },
  { id: "B2", name: "Plain tick", description: "h に関係なく同じクリック。いちばんシンプル", level: 0.55, kind: "tone",
    render: (_h, sampleRate) => tick(1800, 0.007, sampleRate) },
  { id: "B3", name: "Bubble length", description: "kernel と同じ「ぽこっ」をソで固定。h が大きいほど長く響く", level: 0.7, kind: "tone",
    render: (h, sampleRate) => {
      const n = bandwidthAmount(h);
      const hz = midiToHz(67);
      const decay = 0.025 + 0.2 * n;
      const result = new Float32Array(Math.ceil(sampleRate * (decay * 5 + 0.03)));
      let phase = 0;
      for (let i = 0; i < result.length; i++) {
        const t = i / sampleRate;
        phase += 2 * Math.PI * hz * (1 - 0.22 * Math.exp(-t / 0.012)) / sampleRate;
        result[i] = (Math.sin(phase) + 0.12 * Math.sin(2 * phase)) * Math.exp(-t / decay) * Math.min(1, t / 0.0015);
      }
      return finish(result, sampleRate);
    } },
  { id: "B4", name: "Air band", description: "ドラッグ中だけ鳴る息の音。h が大きいほど広い帯域でふわっと、小さいほど細く集まる", level: 1, kind: "sustain", voice: "air" },
  { id: "B5", name: "Gaussian blip", description: "カーネルの形そのもの。ガウス窓の波束で、h が小さいほど短く高く、大きいほど長く低い（音程は連続）", level: 0.8, kind: "tone",
    render: (h, sampleRate) => gaussianBlip(widthHz(h), sampleRate) },
  { id: "B6", name: "Gaussian blip · ドミソ", description: "B5 の音程をドミソ（C3〜C6）にそろえたもの。段は粗く、和音から外れない", level: 0.8, kind: "tone",
    render: (h, sampleRate) => gaussianBlip(snapToTriad(widthHz(h)), sampleRate) },
  { id: "B7", name: "Droplet", description: "水滴の「ぷちっ」。h が小さいほど高い（音程は連続）", level: 0.7, kind: "tone",
    render: (h, sampleRate) => droplet(widthHz(h, 1600, 260), sampleRate) },
  { id: "B8", name: "Pitched tick", description: "音程のあるクリック（木の「コッ」）。h が小さいほど高い（音程は連続）", level: 0.6, kind: "tone",
    render: (h, sampleRate) => tick(widthHz(h, 2600, 420), 0.02, sampleRate) },
  { id: "B11", name: "Muted wood · 低め", description: "B0 の音域を C3〜C5 から C3〜C4 に縮めて高い側を下げ、キンとする倍音を除いて立ち上がりを柔らかく", level: 0.9, kind: "tone",
    render: (h, sampleRate) => calmWood(lowPentatonicHz(h), sampleRate) },
  { id: "B12", name: "Muted wood · 連続", description: "B11 の音色で、音程を段なしに連続で変化（330〜120Hz）", level: 0.9, kind: "tone",
    render: (h, sampleRate) => calmWood(widthHz(h, 330, 120), sampleRate) },
  { id: "B13", name: "Pitched tick · 低め", description: "B8 を約1オクターブ半下げ（1100〜220Hz）、打撃を少し柔らかく", level: 0.7, kind: "tone",
    render: (h, sampleRate) => tick(widthHz(h, 1100, 220), 0.025, sampleRate, 0.5) },
  { id: "B14", name: "Pitched tick · 低く柔らか", description: "さらに低く（800〜160Hz）、フェルトで叩いたような丸い「コッ」", level: 0.75, kind: "tone",
    render: (h, sampleRate) => tick(widthHz(h, 800, 160), 0.035, sampleRate, 0.9) },
  { id: "B9", name: "Glide", description: "ドラッグ中だけ鳴る柔らかい持続音。h に合わせて音程がなめらかに上下（テルミン風）", level: 1, kind: "sustain", voice: "glide" },
  { id: "B10", name: "Brightness", description: "ドラッグ中だけ鳴る低いドの持続音。音程は固定で、h が小さいほど明るく、大きいほどこもる", level: 1, kind: "sustain", voice: "bright" },
];

export interface SustainedVoice {
  readonly study: object;
  update(value: number): void;
  release(cut?: boolean): void;
}
export function createBandwidthVoice(context: AudioContext, output: AudioNode, study: BandwidthStudy): SustainedVoice {
  return study.kind === "sustain" && study.voice !== "air" ? new BandwidthDrone(context, output, study) : new NoiseBand(context, output, study);
}

// Oscillator voices: "glide" moves pitch with h; "bright" holds C3 and moves a lowpass.
class BandwidthDrone implements SustainedVoice {
  private readonly oscillator: OscillatorNode;
  private readonly filter: BiquadFilterNode;
  private readonly envelope: GainNode;
  private released = false;
  private started = false;
  private readonly glide: boolean;

  constructor(private readonly context: AudioContext, output: AudioNode, readonly study: BandwidthStudy) {
    this.glide = study.kind === "sustain" && study.voice === "glide";
    const harmonics = this.glide ? [1, 0.12, 0.03] : Array.from({ length: 24 }, (_, i) => 1 / (i + 1));
    this.oscillator = context.createOscillator();
    this.oscillator.setPeriodicWave(context.createPeriodicWave(new Float32Array(harmonics.length + 1), new Float32Array([0, ...harmonics])));
    this.oscillator.frequency.value = this.glide ? 440 : midiToHz(48);
    this.filter = context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = this.glide ? 4000 : 800;
    this.filter.Q.value = this.glide ? 0.5 : 1.2;
    this.envelope = context.createGain();
    this.envelope.gain.setValueAtTime(0, context.currentTime);
    this.envelope.gain.setTargetAtTime(this.glide ? 0.45 : 0.4, context.currentTime, 0.05);
    this.oscillator.connect(this.filter);
    this.filter.connect(this.envelope);
    this.envelope.connect(output);
    this.oscillator.onended = () => { this.oscillator.disconnect(); this.filter.disconnect(); this.envelope.disconnect(); };
    this.oscillator.start();
  }

  update(h: number) {
    if (this.released) return;
    const now = this.context.currentTime;
    // The first value is set directly so the voice does not slide in from 440 Hz.
    const smoothing = this.started ? 0.05 : 0.0001;
    if (this.glide) this.oscillator.frequency.setTargetAtTime(widthHz(h, 880, 165), now, smoothing);
    else this.filter.frequency.setTargetAtTime(widthHz(h, 5000, 280), now, smoothing);
    this.started = true;
  }

  release(cut = false) {
    if (this.released) return;
    this.released = true;
    const now = this.context.currentTime;
    this.envelope.gain.setTargetAtTime(0, now, cut ? 0.01 : 0.1);
    this.oscillator.stop(now + (cut ? 0.05 : 0.8));
  }
}

// Band-passed noise whose bandwidth follows h: the sound's own width is the kernel's.
export class NoiseBand implements SustainedVoice {
  private readonly source: AudioBufferSourceNode;
  private readonly filter: BiquadFilterNode;
  private readonly envelope: GainNode;
  released = false;

  constructor(private readonly context: AudioContext, output: AudioNode, readonly study: BandwidthStudy) {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    const random = seeded(3187);
    for (let i = 0; i < data.length; i++) data[i] = random();
    this.source = context.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    this.filter = context.createBiquadFilter();
    this.filter.type = "bandpass";
    this.filter.frequency.value = 900;
    this.envelope = context.createGain();
    this.envelope.gain.setValueAtTime(0, context.currentTime);
    this.source.connect(this.filter);
    this.filter.connect(this.envelope);
    this.envelope.connect(output);
    this.source.onended = () => { this.source.disconnect(); this.filter.disconnect(); this.envelope.disconnect(); };
    this.source.start();
  }

  update(h: number) {
    if (this.released) return;
    const n = bandwidthAmount(h);
    const q = 6 * 0.1 ** n; // 6 (narrow) → 0.6 (wide)
    const now = this.context.currentTime;
    this.filter.Q.setTargetAtTime(q, now, 0.05);
    // A narrower band passes less energy; compensate so loudness stays even.
    this.envelope.gain.setTargetAtTime(0.8 * Math.sqrt(q / 0.6), now, 0.06);
  }

  release(cut = false) {
    if (this.released) return;
    this.released = true;
    const now = this.context.currentTime;
    this.envelope.gain.setTargetAtTime(0, now, cut ? 0.01 : 0.12);
    this.source.stop(now + (cut ? 0.05 : 0.9));
  }
}
