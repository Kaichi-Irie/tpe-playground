import { alphaDesigns, alphaAmount } from "./alphaSynth";
import { afterEach, expect, it, vi } from "vitest";
import { renderSound, bandwidthFrequency, soundDesigns, kernelRotation, bandwidthNotes, splitNotes, splitFrequency } from "./labSoundDesign";
import { LabAudio } from "./labAudio";

function setup() {
  const parameter = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() });
  const voices: { stop: ReturnType<typeof vi.fn> }[] = [];
  const context = {
    sampleRate: 8000, currentTime: 1, state: "running", destination: {},
    decodeAudioData: vi.fn(async () => ({ getChannelData: () => new Float32Array(800) })),
    resume: vi.fn(async () => { context.state = "running"; }), suspend: vi.fn(async () => { context.state = "suspended"; }), close: vi.fn(async () => {}),
    createOscillator: vi.fn(() => ({ type: "sine", frequency: parameter(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null })),
    createBiquadFilter: vi.fn(() => ({ type: "lowpass", Q: parameter(), frequency: parameter(), connect: vi.fn(), disconnect: vi.fn() })),
    createGain: vi.fn(() => ({ gain: parameter(), connect: vi.fn(), disconnect: vi.fn() })),
    createBuffer: vi.fn((_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) })),
    createBufferSource: vi.fn(() => {
      const voice = { playbackRate: { value: 1 }, frequency: parameter(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
      voices.push(voice); return voice;
    }),
  };
  vi.stubGlobal("AudioContext", function () { return context; });
  vi.stubGlobal("document", { hidden: false });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  return { audio: new LabAudio(), context, voices };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("stays silent until enabled and suppresses rapid repeats", async () => {
  const { audio, context } = setup();
  audio.play("kernel");
  expect(context.createBufferSource).not.toHaveBeenCalled();
  await audio.enable();
  audio.play("kernel"); audio.play("sample");
  expect(context.createBufferSource).toHaveBeenCalledTimes(1);
  context.currentTime += 0.1;
  audio.play("sample");
  expect(context.createBufferSource).toHaveBeenCalledTimes(2);
});
it("mute stops scheduled notes and prevents further playback", async () => {
  const { audio, context, voices } = setup();
  await audio.enable(); audio.play("sample");
  audio.disable();
  expect(voices.every((voice) => voice.stop.mock.calls.length === 1)).toBe(true);
  context.currentTime += 1; audio.play("kernel");
  expect(context.createBufferSource).toHaveBeenCalledTimes(1);
});
it("does not enable after disposal during a pending resume", async () => {
  const { audio, context } = setup();
  let finish!: () => void;
  context.resume.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const ready = audio.enable(); audio.dispose(); finish();
  expect(await ready).toBe(false);
  expect(context.close).toHaveBeenCalledOnce();
});
it("suspends while hidden and resumes only when sound is on", async () => {
  const { audio, context, voices } = setup();
  await audio.enable(); audio.play("sample");
  audio.suspend();
  expect(voices.every((voice) => voice.stop.mock.calls.length === 1)).toBe(true);
  expect(context.suspend).toHaveBeenCalledOnce();
  await Promise.resolve();
  context.resume.mockClear();
  audio.resume();
  expect(context.resume).toHaveBeenCalledOnce();
  await Promise.resolve();
  audio.disable(); audio.suspend(); await Promise.resolve();
  context.resume.mockClear();
  audio.resume();
  expect(context.resume).not.toHaveBeenCalled();
});
it("handles unavailable audio and hidden pages", async () => {
  const { audio, context } = setup();
  context.resume.mockRejectedValueOnce(new Error("Unavailable"));
  expect(await audio.enable()).toBe(false);
  expect(await audio.enable()).toBe(true);
  vi.stubGlobal("document", { hidden: true });
  audio.play("kernel");
  expect(context.createBufferSource).not.toHaveBeenCalled();
});


it("maps bandwidth monotonically to pentatonic notes within C3–C5", () => {
  const pitches = Array.from({ length: 27 }, (_, i) => bandwidthFrequency(0.2 + i * 0.05));
  const allowed = bandwidthNotes.map((note) => 440 * 2 ** ((note - 69) / 12));
  expect(pitches.every((pitch, index) => allowed.includes(pitch) && (index === 0 || pitch <= pitches[index - 1]))).toBe(true);
  expect(new Set(pitches).size).toBe(11);
  expect(bandwidthFrequency(0)).toBe(allowed[10]);
  expect(bandwidthFrequency(2)).toBe(allowed[0]);
  expect(Number.isFinite(bandwidthFrequency(NaN))).toBe(true);
});
it("does not retrigger bandwidth within one note, but allows a new gesture after stop", async () => {
  const { audio, context } = setup();
  await audio.enable(); audio.play("bandwidth", 0.2);
  context.currentTime += 0.2; audio.play("bandwidth", 0.25);
  expect(context.createBufferSource).toHaveBeenCalledTimes(1);
  context.currentTime += 0.2; audio.play("bandwidth", 0.5);
  expect(context.createBufferSource).toHaveBeenCalledTimes(2);
  audio.stop(); audio.play("bandwidth", 0.5);
  expect(context.createBufferSource).toHaveBeenCalledTimes(3);
});

it("renders distinct, repeatable material studies with headroom and silent boundaries", () => {
  const signatures = new Set<string>();
  for (const sound of ["kernel", "sample", "bandwidth", "split"] as const) {
    for (let index = 0; index < soundDesigns[sound].length; index++) {
      const samples = renderSound(sound, index, 8000);
      expect(samples).toEqual(renderSound(sound, index, 8000));
      expect(samples[0]).toBe(0);
      expect(samples[samples.length - 1]).toBe(0);
      expect(samples.every((value) => Number.isFinite(value) && Math.abs(value) <= 0.751)).toBe(true);
      expect(samples.some((value) => Math.abs(value) > 0.1)).toBe(true);
      signatures.add(samples.slice(0, 200).join(","));
    }
  }
  expect(signatures.size).toBe(28);
});

it("cycles kernel textures and small pitch changes, reusing cached buffers", async () => {
  const { audio, context } = setup();
  await audio.enable();
  for (let index = 0; index < 10; index++) {
    context.currentTime += 1;
    audio.play("kernel");
    expect(context.createBufferSource.mock.results[index].value.playbackRate.value).toBe(kernelRotation[index % 9].rate);
  }
  expect(context.createBuffer).toHaveBeenCalledTimes(3);
});
it("uses Claves low by default without fetching or decoding audio", async () => {
  const { audio, context } = setup();
  await audio.enable(); audio.play("sample");
  expect(fetch).not.toHaveBeenCalled();
  expect(context.decodeAudioData).not.toHaveBeenCalled();
  const buffer = context.createBuffer.mock.results[0].value;
  expect(buffer.getChannelData).toBeDefined();
  expect(context.createBufferSource.mock.results[0].value.start).toHaveBeenCalledOnce();
  expect(context.createGain.mock.results.at(-1)?.value.gain.setValueAtTime).toHaveBeenCalledWith(0.8, 1);
  audio.stop(); audio.play("sample", 0.55, 6);
  expect(context.createBuffer).toHaveBeenCalledOnce();
});


it("maps split height upward through just five piano notes from C3 to A3", () => {
  const allowed = splitNotes.map((note) => 440 * 2 ** ((note - 69) / 12));
  const pitches = Array.from({ length: 81 }, (_, i) => splitFrequency(i / 10));
  expect(new Set(pitches)).toEqual(new Set(allowed));
  expect(pitches.every((pitch, i) => i === 0 || pitch >= pitches[i - 1])).toBe(true);
  expect(splitFrequency(-1)).toBe(allowed[0]);
  expect(splitFrequency(9)).toBe(allowed[4]);
  expect(splitFrequency(NaN)).toBe(allowed[0]);
  expect(renderSound("split", 0, 8000, 0)).toEqual(renderSound("split", 0, 8000, 1));
  expect(renderSound("split", 0, 8000, 0)).not.toEqual(renderSound("split", 0, 8000, 8));
});
it("reuses split buffers within each pitch band and retriggers confirmed splits", async () => {
  const { audio, context } = setup();
  await audio.enable();
  for (const height of [0, 1, 2, 3, 4, 5, 6, 7, 8, 0]) {
    context.currentTime += 1;
    audio.play("split", height);
  }
  expect(context.createBuffer).toHaveBeenCalledTimes(5);
  expect(context.createBufferSource).toHaveBeenCalledTimes(10);
});

it("offers lower split candidates across the full height range", () => {
  for (const variant of [5, 6, 7]) {
    for (const height of [0, 2, 4, 6, 8]) {
      expect(splitFrequency(height, variant)).toBeLessThan(splitFrequency(height));
    }
    expect(renderSound("split", variant, 8000, 4)).not.toEqual(renderSound("split", 0, 8000, 4));
  }
});
it("sustains one alpha voice across rapid edits and stationary holds, then fades on release", async () => {
  vi.useFakeTimers();
  const { audio, context } = setup();
  await audio.enable();
  audio.beginAlphaGesture();
  for (const value of [0, 4, 4.25, 8, 10, 0]) audio.play("alpha", value);
  expect(context.createOscillator).toHaveBeenCalledTimes(alphaDesigns[0].layers.length);
  const sources = context.createOscillator.mock.results.map(({ value }) => value);
  vi.advanceTimersByTime(5000);
  expect(sources.every((source) => source.stop.mock.calls.length === 0)).toBe(true);
  expect(sources.map((source) => source.frequency.value)).toEqual(alphaDesigns[0].layers.map((layer) => layer.hz));
  expect(context.createBiquadFilter.mock.results[0].value.frequency.setTargetAtTime).toHaveBeenLastCalledWith(900, 1, 0.09);
  audio.endAlphaGesture();
  expect(sources.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
});

it("extends alpha feedback for AT edits and cancels it on mute or stop", async () => {
  vi.useFakeTimers();
  const { audio, context } = setup();
  await audio.enable();
  audio.play("alpha", 2);
  const source = context.createOscillator.mock.results[0].value;
  vi.advanceTimersByTime(300);
  audio.play("alpha", 8);
  vi.advanceTimersByTime(300);
  expect(source.stop).not.toHaveBeenCalled();
  vi.advanceTimersByTime(200);
  expect(source.stop).toHaveBeenCalledOnce();
  audio.beginAlphaGesture(); audio.play("alpha", 4);
  const next = context.createOscillator.mock.results.at(-1)!.value;
  audio.disable(); audio.play("alpha", 5);
  expect(next.stop).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("supports every alpha direction with bounded smoothed controls and cleans up all nodes", async () => {
  vi.useFakeTimers();
  expect(alphaAmount(NaN)).toBe(0);
  expect(alphaAmount(-1)).toBe(0);
  expect(alphaAmount(20)).toBe(1);
  for (let variant = 0; variant < alphaDesigns.length; variant++) {
    const { audio, context } = setup();
    await audio.enable();
    audio.beginAlphaGesture();
    for (const value of [0, 0.25, 5, 10, NaN]) audio.play("alpha", value, variant);
    expect(context.createOscillator).toHaveBeenCalledTimes(alphaDesigns[variant].layers.length);
    expect(context.createBufferSource).toHaveBeenCalledTimes(alphaDesigns[variant].noise ? 1 : 0);
    for (const { value: gain } of context.createGain.mock.results) {
      expect(gain.gain.setTargetAtTime.mock.calls.every(([target]: [number]) => Number.isFinite(target) && target >= 0 && target <= 1.4)).toBe(true);
    }
    audio.stop();
    for (const { value: source } of [...context.createOscillator.mock.results, ...context.createBufferSource.mock.results]) {
      expect(source.stop).toHaveBeenCalledOnce();
      (source.onended as (() => void) | null)?.();
      expect(source.disconnect).toHaveBeenCalledOnce();
    }
    expect(context.createBiquadFilter.mock.results[0].value.disconnect).toHaveBeenCalledOnce();
  }
});

it("crossfades candidate changes and cancels previews on navigation/stop", async () => {
  vi.useFakeTimers();
  const { audio, context } = setup();
  await audio.enable();
  audio.auditionAlpha(4, 0);
  const first = context.createOscillator.mock.results[0].value;
  audio.play("alpha", 4, 1);
  expect(first.stop).toHaveBeenCalledOnce();
  audio.stop();
  expect(vi.getTimerCount()).toBe(0);
  const count = context.createOscillator.mock.calls.length;
  vi.stubGlobal("document", { hidden: true });
  audio.play("alpha", 8);
  expect(context.createOscillator).toHaveBeenCalledTimes(count);
});

it("blends split slider notes without retriggering within a pitch band", async () => {
  const { audio, context } = setup();
  await audio.enable();
  audio.adjustSplit(0);
  const first = context.createBufferSource.mock.results[0].value;
  audio.adjustSplit(1);
  expect(context.createBufferSource).toHaveBeenCalledOnce();
  context.currentTime += 0.15;
  audio.adjustSplit(4);
  expect(context.createBufferSource).toHaveBeenCalledTimes(2);
  expect(first.stop).toHaveBeenCalledWith(context.currentTime + 0.4);
  const latestGain = context.createGain.mock.results.at(-1)!.value.gain;
  expect(latestGain.setValueAtTime).toHaveBeenCalledWith(0, context.currentTime);
  expect(latestGain.setTargetAtTime).toHaveBeenCalledWith(0.85, context.currentTime, 0.035);
  // Explicit confirmation always strikes, even in the same pitch band.
  audio.play("split", 4);
  expect(context.createBufferSource).toHaveBeenCalledTimes(3);
});

it("coalesces fast split changes to the final value and cancels pending notes on stop", async () => {
  vi.useFakeTimers();
  const { audio, context } = setup();
  await audio.enable();
  audio.adjustSplit(0);
  context.currentTime += 0.02;
  audio.adjustSplit(2); audio.adjustSplit(4); audio.adjustSplit(8);
  expect(context.createBufferSource).toHaveBeenCalledOnce();
  context.currentTime += 0.1;
  vi.advanceTimersByTime(100);
  expect(context.createBufferSource).toHaveBeenCalledTimes(2);
  audio.adjustSplit(8);
  expect(context.createBufferSource).toHaveBeenCalledTimes(2);
  audio.adjustSplit(0);
  audio.stop();
  vi.advanceTimersByTime(1000);
  expect(context.createBufferSource).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
