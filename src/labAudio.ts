import { renderDice } from "./diceSounds";
import { bandwidthFrequency, type LabSound } from "./labSoundDesign";
import { type SustainedVoice, adoptedVoices, alphaStudies, bandwidthStudies, ChordPad, createBandwidthVoice, celesta, kernelStudies, kernelStudyNote, midiToHz, type SplitDirection, splitStudies, splitStudyNote } from "./labVoices";

// Values per sound: split = good count k, kernel = observation x,
// bandwidth = h, alpha = prior weight. A variant selects an audition voice.
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
  // One sustained voice at a time: the α chord or the bandwidth air band.
  private sustained: SustainedVoice | undefined;
  private alphaHeld = false;
  private alphaTimer: ReturnType<typeof setTimeout> | undefined;
  private buffers = new Map<string, AudioBuffer>();
  private generation = 0;
  private lastPlayed = -Infinity;
  private lastBandwidthKey: string | undefined;
  private lastBandwidthTime = -Infinity;
  private lastSplitCount: number | undefined;

  adjustSplit(goodCount: number, variant: number = adoptedVoices.split) {
    clearTimeout(this.splitTimer);
    this.splitTimer = undefined;
    const context = this.context;
    if (!this.enabled || !context || context.state !== "running" || document.hidden) return;
    const key = `${variant}:${splitStudyNote(goodCount)}`;
    const continuing = context.currentTime - this.lastSplitInputTime < 0.35;
    this.lastSplitInputTime = context.currentTime;
    if (key === this.lastSplitKey && continuing) return;
    const play = () => {
      this.splitTimer = undefined;
      if (!this.enabled || context.state !== "running" || document.hidden) return;
      this.play("split", goodCount, variant, true);
      this.lastSplitKey = key;
      this.lastSplitTime = context.currentTime;
    };
    // Coalesce fast reversals, retaining the final slider position.
    const delay = Math.max(0, 0.09 - (context.currentTime - this.lastSplitTime));
    if (delay > 0) this.splitTimer = setTimeout(play, delay * 1000);
    else play();
  }

  beginAlphaGesture() {
    this.alphaHeld = true;
    clearTimeout(this.alphaTimer);
  }

  endAlphaGesture() {
    this.alphaHeld = false;
    this.releaseAlpha();
  }

  auditionAlpha(value: number, variant: number = adoptedVoices.alpha) {
    this.endAlphaGesture();
    this.play("alpha", value, variant);
    clearTimeout(this.alphaTimer);
    if (this.sustained) this.alphaTimer = setTimeout(() => this.releaseAlpha(), 1600);
  }

  private releaseAlpha(cut = false) {
    clearTimeout(this.alphaTimer);
    this.alphaTimer = undefined;
    this.sustained?.release(cut);
    this.sustained = undefined;
  }

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
    this.lastBandwidthTime = -Infinity;
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
      const study = alphaStudies[previewVariant ?? adoptedVoices.alpha] ?? alphaStudies[adoptedVoices.alpha];
      if (this.sustained?.study !== study) {
        this.releaseAlpha();
        this.sustained = new ChordPad(context, this.output, study, (midi) => this.playTone(`chime:${midi}`, () => celesta(midiToHz(midi), context.sampleRate), 1));
      }
      this.sustained.update(value ?? 4);
      this.settleSustained();
      return;
    }
    if (sound === "bandwidth") {
      this.playBandwidth(value ?? 0.55, previewVariant ?? adoptedVoices.bandwidth);
      return;
    }
    const now = context.currentTime;
    if (now - this.lastPlayed < (sound === "split" ? 0 : 0.075)) return;
    let key: string;
    let render: () => Float32Array;
    let level = sound === "sample" ? 0.8 : 1;
    let crossfade = legato;
    if (sound === "split") {
      const study = splitStudies[previewVariant ?? adoptedVoices.split] ?? splitStudies[adoptedVoices.split];
      const goodCount = Math.round(value ?? 1);
      // Slider moves carry a direction; a confirming tap is neutral.
      const direction: SplitDirection = legato && this.lastSplitCount !== undefined ? Math.sign(goodCount - this.lastSplitCount) as SplitDirection : 0;
      this.lastSplitCount = goodCount;
      level = study.level;
      crossfade = legato && Boolean(study.legato);
      key = `split:${study.id}:${goodCount}:${direction}`;
      render = () => study.render(goodCount, direction, context.sampleRate);
    } else if (sound === "kernel") {
      const study = kernelStudies[previewVariant ?? adoptedVoices.kernel] ?? kernelStudies[adoptedVoices.kernel];
      const midi = kernelStudyNote(value ?? 0);
      key = `kernel:${study.id}:${midi}`;
      render = () => study.render(midiToHz(midi), context.sampleRate);
    } else {
      const variant = previewVariant ?? adoptedVoices.sample;
      key = `sample:${variant}`;
      render = () => renderDice(variant, context.sampleRate);
    }
    if (legato) {
      this.endAlphaGesture();
      // Preserve a short tail while the new note gently enters.
      for (const [source, previousGain] of this.voices) {
        if (this.fadingVoices.has(source)) continue;
        previousGain.gain.setTargetAtTime(0, now, 0.085);
        source.stop(now + 0.4);
        this.fadingVoices.add(source);
      }
    } else this.stop();
    this.lastPlayed = now;
    const gain = this.playTone(key, render, crossfade ? 0 : level);
    if (crossfade) gain?.gain.setTargetAtTime(0.85 * level, now, 0.035);
  }

  // Pointer/key gestures sustain until release. AT and button edits settle
  // after inactivity; a new edit extends the same voice, never restarts it.
  private settleSustained() {
    clearTimeout(this.alphaTimer);
    if (!this.alphaHeld) this.alphaTimer = setTimeout(() => this.releaseAlpha(), 450);
  }

  private playBandwidth(h: number, variant: number) {
    const context = this.context!;
    const study = bandwidthStudies[variant] ?? bandwidthStudies[adoptedVoices.bandwidth];
    if (study.kind === "sustain") {
      if (this.sustained?.study !== study) {
        this.releaseAlpha();
        this.sustained = createBandwidthVoice(context, this.output!, study);
      }
      this.sustained.update(h);
      this.settleSustained();
      return;
    }
    const now = context.currentTime;
    const original = study.id === "B0";
    // The original pitched voice changes per note; the ticks change per slider step.
    const key = `${study.id}:${original ? bandwidthFrequency(h).toFixed(4) : h.toFixed(2)}`;
    if (key === this.lastBandwidthKey || now - this.lastBandwidthTime < (original ? 0.12 : 0.03)) return;
    if (original) this.stop();
    this.lastBandwidthKey = key;
    this.lastBandwidthTime = now;
    const bufferKey = `bandwidth:${study.id}:${study.id === "B2" ? "" : h.toFixed(2)}`;
    this.playTone(bufferKey, () => study.render(h, context.sampleRate), study.level);
  }

  private playTone(key: string, render: () => Float32Array, level: number): GainNode | undefined {
    const context = this.context;
    if (!context || !this.output) return;
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
    gain.connect(this.output);
    this.voices.set(voice, gain);
    voice.onended = () => { voice.disconnect(); gain.disconnect(); this.voices.delete(voice); this.fadingVoices.delete(voice); };
    voice.start();
    return gain;
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
