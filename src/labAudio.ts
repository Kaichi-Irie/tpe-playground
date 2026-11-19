import { AlphaVoice } from "./alphaSynth";
import { renderDice } from "./diceSounds";
import { bandwidthFrequency, kernelNote, renderBandwidth, renderKernel, renderSplit, type LabSound, type SplitDirection } from "./labSoundDesign";

// Values per sound: split = good count, kernel = observation x,
// bandwidth = h, alpha = prior weight.
export class LabAudio {
  private context: AudioContext | undefined;
  private output: GainNode | undefined;
  private voices = new Map<AudioBufferSourceNode, GainNode>();
  private enabled = false;
  private lastSplitCount: number | undefined;
  private splitTimer: ReturnType<typeof setTimeout> | undefined;
  private lastSplitTime = -Infinity;
  private lastSplitInputTime = -Infinity;

  // A γ slider step from one good count to another: one ratchet click whose
  // pitch shows the direction. The caller passes where the divider was, so the
  // first click after enabling sound is directional too.
  adjustSplit(goodCount: number, previousCount: number) {
    clearTimeout(this.splitTimer);
    this.splitTimer = undefined;
    const context = this.context;
    if (!this.enabled || !context || context.state !== "running" || document.hidden) return;
    const continuing = context.currentTime - this.lastSplitInputTime < 0.35;
    this.lastSplitInputTime = context.currentTime;
    if (goodCount === this.lastSplitCount && continuing) return;
    const direction = Math.sign(goodCount - previousCount) as SplitDirection;
    const play = () => {
      this.splitTimer = undefined;
      if (!this.enabled || context.state !== "running" || document.hidden) return;
      this.playSplit(goodCount, direction);
      this.lastSplitTime = context.currentTime;
    };
    // Coalesce fast reversals, retaining the final slider position.
    const delay = Math.max(0, 0.09 - (context.currentTime - this.lastSplitTime));
    if (delay > 0) this.splitTimer = setTimeout(play, delay * 1000);
    else play();
  }
  private alphaVoice: AlphaVoice | undefined;
  private alphaHeld = false;
  private alphaTimer: ReturnType<typeof setTimeout> | undefined;

  beginAlphaGesture() {
    this.alphaHeld = true;
    clearTimeout(this.alphaTimer);
  }

  endAlphaGesture() {
    this.alphaHeld = false;
    this.releaseAlpha();
  }

  auditionAlpha(value: number) {
    this.endAlphaGesture();
    this.play("alpha", value);
    clearTimeout(this.alphaTimer);
    if (this.alphaVoice) this.alphaTimer = setTimeout(() => this.releaseAlpha(), 1600);
  }

  private releaseAlpha(cut = false) {
    clearTimeout(this.alphaTimer);
    this.alphaTimer = undefined;
    this.alphaVoice?.release(cut);
    this.alphaVoice = undefined;
  }

  private buffers = new Map<string, AudioBuffer>();
  private generation = 0;
  private lastPlayed = -Infinity;
  private lastBandwidthKey: string | undefined;

  async enable(): Promise<boolean> {
    const generation = ++this.generation;
    try {
      this.context ??= new AudioContext();
      if (!this.output) {
        this.output = this.context.createGain();
        this.output.connect(this.context.destination);
      }
      const context = this.context;
      await context.resume();
      if (generation !== this.generation || this.context.state !== "running") return false;
      this.enabled = true;
      this.updateOutput();
      return true;
    } catch {
      return false;
    }
  }

  private updateOutput() {
    if (this.context && this.output) {
      // Audible feedback with headroom for overlapping notes and device volume control.
      this.output.gain.setTargetAtTime(this.enabled ? 0.18 : 0, this.context.currentTime, 0.01);
    }
  }

  stop() {
    clearTimeout(this.splitTimer);
    this.splitTimer = undefined;
    this.lastSplitCount = undefined;
    this.lastSplitTime = -Infinity;
    this.lastSplitInputTime = -Infinity;
    this.alphaHeld = false;
    this.releaseAlpha(true);
    for (const [voice, gain] of this.voices) {
      const now = this.context?.currentTime ?? 0;
      gain.gain.setTargetAtTime(0, now, 0.005);
      voice.stop(now + 0.025);
    }
    this.voices.clear();
    this.lastPlayed = -Infinity;
    this.lastBandwidthKey = undefined;
  }

  // Release the audio thread while the Lab is hidden; keep the user's sound choice.
  suspend() {
    this.stop();
    if (this.context?.state === "running") void this.context.suspend().catch(() => {});
  }

  resume() {
    if (this.enabled && this.context?.state === "suspended") void this.context.resume().catch(() => {});
  }

  disable() {
    ++this.generation;
    this.enabled = false;
    this.updateOutput();
    this.stop();
  }

  // A confirming split tap (value = good count) strikes a neutral click.
  play(sound: LabSound, value?: number) {
    const context = this.context;
    if (!this.enabled || !context || !this.output || context.state !== "running" || document.hidden) return;
    if (sound === "alpha") {
      clearTimeout(this.splitTimer);
      this.splitTimer = undefined;
      this.alphaVoice ??= new AlphaVoice(context, this.output);
      this.alphaVoice.update(value ?? 4);
      clearTimeout(this.alphaTimer);
      // Pointer/key gestures sustain until release. AT and button edits settle
      // after inactivity; a new edit extends the same chord, never restarts it.
      if (!this.alphaHeld) this.alphaTimer = setTimeout(() => this.releaseAlpha(), 450);
      return;
    }
    if (sound === "split") {
      clearTimeout(this.splitTimer);
      this.splitTimer = undefined;
      this.playSplit(value ?? 1, 0);
      return;
    }
    const now = context.currentTime;
    if (now - this.lastPlayed < (sound === "bandwidth" ? 0.12 : 0.075)) return;
    let key: string;
    let render: () => Float32Array;
    if (sound === "bandwidth") {
      const h = value ?? 0.55;
      key = `bandwidth:${bandwidthFrequency(h).toFixed(4)}`;
      if (key === this.lastBandwidthKey) return;
      render = () => renderBandwidth(h, context.sampleRate);
    } else if (sound === "kernel") {
      const midi = kernelNote(value ?? 0);
      key = `kernel:${midi}`;
      render = () => renderKernel(midi, context.sampleRate);
    } else {
      key = "sample";
      render = () => renderDice(context.sampleRate);
    }
    this.stop();
    this.lastPlayed = now;
    if (sound === "bandwidth") this.lastBandwidthKey = key;
    this.playBuffer(key, render, sound === "sample" ? 0.8 : 1);
  }

  // Clicks are short, so they never cut other sounds or each other.
  private playSplit(goodCount: number, direction: SplitDirection) {
    const context = this.context!;
    this.lastSplitCount = goodCount;
    this.playBuffer(`split:${direction}`, () => renderSplit(direction, context.sampleRate), 0.5);
  }

  private playBuffer(key: string, render: () => Float32Array, level: number) {
    const context = this.context!;
    let buffer = this.buffers.get(key);
    if (!buffer) {
      const samples = render();
      buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.getChannelData(0).set(samples);
      if (this.buffers.size > 160) this.buffers.clear();
      this.buffers.set(key, buffer);
    }
    const voice = context.createBufferSource();
    voice.buffer = buffer;
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, context.currentTime);
    voice.connect(gain);
    gain.connect(this.output!);
    this.voices.set(voice, gain);
    voice.onended = () => { voice.disconnect(); gain.disconnect(); this.voices.delete(voice); };
    voice.start();
  }

  dispose() {
    this.disable();
    const context = this.context;
    this.context = undefined;
    this.output = undefined;
    this.buffers.clear();
    if (context) void context.close().catch(() => {});
  }
}
