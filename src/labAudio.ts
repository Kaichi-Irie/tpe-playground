import { AlphaVoice } from "./alphaSynth";
import { renderDice } from "./diceSounds";
import { bandwidthFrequency, splitFrequency, kernelRotation, renderSound, type LabSound } from "./labSoundDesign";

export class LabAudio {
  private context: AudioContext | undefined;
  private output: GainNode | undefined;
  private voices = new Map<AudioBufferSourceNode, GainNode>();
  private enabled = false;
  private lastSplitKey: string | undefined;
  private splitTimer: ReturnType<typeof setTimeout> | undefined;
  private lastSplitTime = -Infinity;
  private lastSplitInputTime = -Infinity;
  private fadingVoices = new Set<AudioBufferSourceNode>();

  adjustSplit(height: number, variant = this.variants.split) {
    clearTimeout(this.splitTimer);
    this.splitTimer = undefined;
    const context = this.context;
    if (!this.enabled || !context || context.state !== "running" || document.hidden) return;
    const key = `${variant}:${splitFrequency(height, variant).toFixed(4)}`;
    const continuing = context.currentTime - this.lastSplitInputTime < 0.35;
    this.lastSplitInputTime = context.currentTime;
    if (key === this.lastSplitKey && continuing) return;
    const play = () => {
      this.splitTimer = undefined;
      if (!this.enabled || context.state !== "running" || document.hidden) return;
      this.play("split", height, variant, true);
      this.lastSplitKey = key;
      this.lastSplitTime = context.currentTime;
    };
    // Coalesce fast reversals, retaining the final slider position.
    const delay = Math.max(0, 0.09 - (context.currentTime - this.lastSplitTime));
    if (delay > 0) this.splitTimer = setTimeout(play, delay * 1000);
    else play();
  }
  private variants = { kernel: 2, sample: 6, bandwidth: 2, split: 0, alpha: 0 };
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

  auditionAlpha(value: number, variant: number) {
    this.endAlphaGesture();
    this.play("alpha", value, variant);
    clearTimeout(this.alphaTimer);
    if (this.alphaVoice) this.alphaTimer = setTimeout(() => this.releaseAlpha(), 1600);
  }

  private releaseAlpha() {
    clearTimeout(this.alphaTimer);
    this.alphaTimer = undefined;
    this.alphaVoice?.release();
    this.alphaVoice = undefined;
  }

  private kernelStep = 0;
  private buffers = new Map<string, AudioBuffer>();

  select(sound: LabSound, variant: number) { this.variants[sound] = variant; }
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
    this.lastSplitKey = undefined;
    this.lastSplitTime = -Infinity;
    this.lastSplitInputTime = -Infinity;
    this.fadingVoices.clear();
    this.endAlphaGesture();
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

  play(sound: LabSound, value?: number, previewVariant?: number, legato = false) {
    const context = this.context;
    if (!this.enabled || !context || !this.output || context.state !== "running" || document.hidden) return;
    if (sound === "alpha") {
      clearTimeout(this.splitTimer);
      this.splitTimer = undefined;
      const variant = previewVariant ?? this.variants.alpha;
      if (!this.alphaVoice || this.alphaVoice.variant !== variant) {
        this.releaseAlpha();
        this.alphaVoice = new AlphaVoice(context, this.output, variant);
      }
      this.alphaVoice.update(value ?? 4);
      clearTimeout(this.alphaTimer);
      // Pointer/key gestures sustain until release. AT and button edits settle
      // after inactivity; a new edit extends the same voice, never restarts it.
      if (!this.alphaHeld) this.alphaTimer = setTimeout(() => this.releaseAlpha(), 450);
      return;
    }
    const now = context.currentTime;
    if (now - this.lastPlayed < (sound === "bandwidth" ? 0.12 : sound === "split" ? 0 : 0.075)) return;
    const rotation = sound === "kernel" && previewVariant === undefined ? kernelRotation[this.kernelStep++ % kernelRotation.length] : undefined;
    const variant = previewVariant ?? rotation?.variant ?? this.variants[sound];
    const key = `${sound}:${variant}:${sound === "bandwidth" ? bandwidthFrequency(value ?? 0.55).toFixed(4) : sound === "split" && value !== undefined ? splitFrequency(value, variant).toFixed(4) : ""}`;
    if (sound === "bandwidth" && key === this.lastBandwidthKey) return;
    if (legato) {
      this.endAlphaGesture();
      // Preserve a short piano tail while the new note gently enters.
      for (const [source, previousGain] of this.voices) {
        if (this.fadingVoices.has(source)) continue;
        previousGain.gain.setTargetAtTime(0, now, 0.085);
        source.stop(now + 0.4);
        this.fadingVoices.add(source);
      }
    } else this.stop();
    this.lastPlayed = now;
    if (sound === "bandwidth") this.lastBandwidthKey = key;
    let buffer = this.buffers.get(key);
    if (!buffer) {
      const samples = sound === "sample" ? renderDice(variant, context.sampleRate) : renderSound(sound, variant, context.sampleRate, value);
      buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.getChannelData(0).set(samples);
      if (this.buffers.size > 160) this.buffers.clear();
      this.buffers.set(key, buffer);
    }
    const voice = context.createBufferSource();
    voice.buffer = buffer;
    voice.playbackRate.value = rotation?.rate ?? 1;
    const gain = context.createGain();
    gain.gain.setValueAtTime(legato ? 0 : sound === "sample" ? 0.8 : 1, now);
    if (legato) gain.gain.setTargetAtTime(0.85, now, 0.035);
    voice.connect(gain);
    gain.connect(this.output);
    this.voices.set(voice, gain);
    voice.onended = () => { voice.disconnect(); gain.disconnect(); this.voices.delete(voice); this.fadingVoices.delete(voice); };
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
