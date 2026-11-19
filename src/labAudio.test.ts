import { alphaVoiceLevels, alphaVoicing } from "./alphaSynth";
import { afterEach, expect, it, vi } from "vitest";
import { bandwidthFrequency, bandwidthNotes, kernelNote, kernelTones, midiToHz, renderBandwidth, renderKernel, renderSplit } from "./labSoundDesign";
import { LabAudio } from "./labAudio";

function setup() {
  const parameter = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() });
  const voices: { stop: ReturnType<typeof vi.fn> }[] = [];
  const context = {
    sampleRate: 8000, currentTime: 1, state: "running", destination: {},
    decodeAudioData: vi.fn(async () => ({ getChannelData: () => new Float32Array(800) })),
    resume: vi.fn(async () => { context.state = "running"; }), suspend: vi.fn(async () => { context.state = "suspended"; }), close: vi.fn(async () => {}),
    createPeriodicWave: vi.fn(() => ({})),
    createOscillator: vi.fn(() => ({ type: "sine", frequency: parameter(), setPeriodicWave: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null })),
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

it("renders repeatable sounds with headroom that end in silence", () => {
  const sounds = [renderSplit(-1, 8000), renderSplit(0, 8000), renderSplit(1, 8000), renderKernel(60, 8000), renderKernel(76, 8000), renderBandwidth(0.2, 8000), renderBandwidth(1.5, 8000)];
  for (const samples of sounds) {
    // Clicks start on their impulse; every sound fades to silence.
    expect(Math.abs(samples[samples.length - 1])).toBe(0);
    expect(samples.every((value) => Number.isFinite(value) && Math.abs(value) <= 0.751)).toBe(true);
    expect(samples.some((value) => Math.abs(value) > 0.1)).toBe(true);
  }
  expect(renderSplit(1, 8000)).toEqual(renderSplit(1, 8000));
  expect(new Set(sounds.slice(0, 3).map((samples) => samples.join(","))).size).toBe(3);
});

it("maps kernel x positions monotonically onto C-major triad tones", () => {
  const notes = Array.from({ length: 101 }, (_, i) => kernelNote(-5 + i / 10));
  expect(notes.every((note, i) => [0, 4, 7].includes(note % 12) && (i === 0 || note >= notes[i - 1]))).toBe(true);
  expect([notes[0], notes[100], kernelNote(NaN)]).toEqual([kernelTones[0], kernelTones[4], 67]);
});
it("plays kernels by x, reusing one cached buffer per tone", async () => {
  const { audio, context } = setup();
  await audio.enable();
  for (const x of [-4.4, 4.2, -4.4, 4.2]) {
    context.currentTime += 1;
    audio.play("kernel", x);
  }
  expect(context.createBufferSource).toHaveBeenCalledTimes(4);
  expect(context.createBuffer).toHaveBeenCalledTimes(2);
});
it("uses the synthesized dice without fetching or decoding audio", async () => {
  const { audio, context } = setup();
  await audio.enable(); audio.play("sample");
  expect(fetch).not.toHaveBeenCalled();
  expect(context.decodeAudioData).not.toHaveBeenCalled();
  expect(context.createBufferSource.mock.results[0].value.start).toHaveBeenCalledOnce();
  expect(context.createGain.mock.results.at(-1)?.value.gain.setValueAtTime).toHaveBeenCalledWith(0.8, 1);
  audio.stop(); audio.play("sample");
  expect(context.createBuffer).toHaveBeenCalledOnce();
});

it("clicks once per split step, by direction, without cutting other sounds", async () => {
  const { audio, context, voices } = setup();
  await audio.enable();
  audio.play("bandwidth", 0.5);
  audio.play("split", 3);
  context.currentTime += 0.2; audio.adjustSplit(4, 3);
  context.currentTime += 0.2; audio.adjustSplit(3, 4);
  context.currentTime += 0.2; audio.adjustSplit(4, 3);
  // Neutral tap, up and down: three cached click buffers after the bandwidth note.
  expect(context.createBuffer).toHaveBeenCalledTimes(4);
  expect(context.createBufferSource).toHaveBeenCalledTimes(5);
  expect(voices[0].stop).not.toHaveBeenCalled();
});
it("makes the first audible step directional, even with no click before it", async () => {
  const { audio, context } = setup();
  await audio.enable();
  audio.adjustSplit(5, 4);
  expect(context.createBuffer).toHaveBeenCalledOnce();
  const up = context.createBuffer.mock.calls.length;
  audio.stop();
  audio.adjustSplit(4, 5);
  expect(context.createBuffer).toHaveBeenCalledTimes(up + 1);
});
it("does not repeat a split click for the same good count, however many observations", async () => {
  const { audio, context } = setup();
  await audio.enable();
  audio.adjustSplit(15, 14);
  context.currentTime += 0.1; audio.adjustSplit(16, 15);
  context.currentTime += 0.1; audio.adjustSplit(16, 16);
  expect(context.createBufferSource).toHaveBeenCalledTimes(2);
  // An explicit confirmation always strikes.
  audio.play("split", 16);
  expect(context.createBufferSource).toHaveBeenCalledTimes(3);
});
it("coalesces fast split changes to the final value and cancels pending clicks on stop", async () => {
  vi.useFakeTimers();
  const { audio, context } = setup();
  await audio.enable();
  audio.adjustSplit(1, 2);
  context.currentTime += 0.02;
  audio.adjustSplit(2, 1); audio.adjustSplit(3, 2); audio.adjustSplit(5, 3);
  expect(context.createBufferSource).toHaveBeenCalledOnce();
  context.currentTime += 0.1;
  vi.advanceTimersByTime(100);
  expect(context.createBufferSource).toHaveBeenCalledTimes(2);
  audio.adjustSplit(5, 5);
  expect(context.createBufferSource).toHaveBeenCalledTimes(2);
  audio.adjustSplit(1, 5);
  audio.stop();
  vi.advanceTimersByTime(1000);
  expect(context.createBufferSource).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it("builds the prior chord from the root as alpha grows", () => {
  expect(alphaVoiceLevels(0)).toEqual([1, 0, 0, 0, 0]);
  expect(alphaVoiceLevels(10)).toEqual([1, 1, 1, 1, 1]);
  expect(alphaVoiceLevels(NaN)).toEqual([1, 0, 0, 0, 0]);
  const totals = Array.from({ length: 41 }, (_, i) => alphaVoiceLevels(i / 4).reduce((sum, level) => sum + level, 0));
  expect(totals.every((total, i) => i === 0 || total >= totals[i - 1])).toBe(true);
});
it("sustains one alpha chord across rapid edits and stationary holds, then fades on release", async () => {
  vi.useFakeTimers();
  const { audio, context } = setup();
  await audio.enable();
  audio.beginAlphaGesture();
  for (const value of [0, 4, 4.25, 8, 10, 0]) audio.play("alpha", value);
  expect(context.createOscillator).toHaveBeenCalledTimes(alphaVoicing.length);
  const sources = context.createOscillator.mock.results.map(({ value }) => value);
  expect(sources.map((source) => source.frequency.value)).toEqual(alphaVoicing.map(midiToHz));
  // α = 0 leaves only the root sounding.
  const levels = context.createGain.mock.results.slice(-alphaVoicing.length).map(({ value }) => value.gain.setTargetAtTime.mock.lastCall[0]);
  expect(levels[0]).toBeGreaterThan(0);
  expect(levels.slice(1)).toEqual([0, 0, 0, 0]);
  vi.advanceTimersByTime(5000);
  expect(sources.every((source) => source.stop.mock.calls.length === 0)).toBe(true);
  audio.endAlphaGesture();
  expect(sources.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
  sources[0].onended();
  expect(sources.every((source) => source.disconnect.mock.calls.length === 1)).toBe(true);
  expect(context.createBiquadFilter.mock.results[0].value.disconnect).toHaveBeenCalledOnce();
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
  audio.auditionAlpha(4);
  const next = context.createOscillator.mock.results.at(-1)!.value;
  audio.disable(); audio.play("alpha", 5);
  expect(next.stop).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  vi.stubGlobal("document", { hidden: true });
  const count = context.createOscillator.mock.calls.length;
  await audio.enable(); audio.play("alpha", 8);
  expect(context.createOscillator).toHaveBeenCalledTimes(count);
});
