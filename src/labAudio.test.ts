import { afterEach, expect, it, vi } from "vitest";
import { renderSound, bandwidthFrequency, soundDesigns, bandwidthNotes } from "./labSoundDesign";
import { adoptedVoices, alphaStudies, alphaVoicing, bandwidthStudies, midiToHz, splitStudies } from "./labVoices";
import { LabAudio } from "./labAudio";

function setup() {
  const parameter = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() });
  const voices: { stop: ReturnType<typeof vi.fn> }[] = [];
  const context = {
    sampleRate: 8000, currentTime: 1, state: "running", destination: {},
    decodeAudioData: vi.fn(async () => ({ getChannelData: () => new Float32Array(800) })),
    resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
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
  for (const sound of ["sample", "bandwidth"] as const) {
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
  expect(signatures.size).toBe(12);
});

it("plays kernels on C-major triad tones by x, reusing cached buffers", async () => {
  const { audio, context } = setup();
  await audio.enable();
  for (const x of [-4.4, 4.2, -4.4, 4.2]) {
    context.currentTime += 1;
    audio.play("kernel", x);
  }
  expect(context.createBufferSource).toHaveBeenCalledTimes(4);
  expect(context.createBuffer).toHaveBeenCalledTimes(2);
});
it("uses the adopted synthesized dice voice without fetching or decoding audio", async () => {
  const { audio, context } = setup();
  await audio.enable(); audio.play("sample");
  expect(fetch).not.toHaveBeenCalled();
  expect(context.decodeAudioData).not.toHaveBeenCalled();
  const buffer = context.createBuffer.mock.results[0].value;
  expect(buffer.getChannelData).toBeDefined();
  expect(context.createBufferSource.mock.results[0].value.start).toHaveBeenCalledOnce();
  expect(context.createGain.mock.results.at(-1)?.value.gain.setValueAtTime).toHaveBeenCalledWith(0.8, 1);
  audio.stop(); audio.play("sample", 0.55, adoptedVoices.sample);
  expect(context.createBuffer).toHaveBeenCalledOnce();
});


it("strikes one cached buffer per scale note for confirmed splits", async () => {
  const { audio, context } = setup();
  await audio.enable();
  for (const goodCount of [1, 2, 3, 4, 5, 6, 7, 8, 9, 1]) {
    context.currentTime += 1;
    audio.play("split", goodCount);
  }
  expect(context.createBuffer).toHaveBeenCalledTimes(9);
  expect(context.createBufferSource).toHaveBeenCalledTimes(10);
});

it("sustains one alpha chord across rapid edits and stationary holds, then fades on release", async () => {
  vi.useFakeTimers();
  const { audio, context } = setup();
  await audio.enable();
  audio.beginAlphaGesture();
  for (const value of [0, 4, 4.25, 8, 10, 0]) audio.play("alpha", value);
  expect(context.createOscillator).toHaveBeenCalledTimes(alphaVoicing.length);
  const sources = context.createOscillator.mock.results.map(({ value }) => value);
  vi.advanceTimersByTime(5000);
  expect(sources.every((source) => source.stop.mock.calls.length === 0)).toBe(true);
  expect(sources.map((source) => source.frequency.value)).toEqual(alphaVoicing.map(midiToHz));
  // α = 0 leaves only the root sounding.
  const levels = context.createGain.mock.results.slice(-alphaVoicing.length).map(({ value }) => value.gain.setTargetAtTime.mock.lastCall[0]);
  expect(levels[0]).toBeGreaterThan(0);
  expect(levels.slice(1)).toEqual([0, 0, 0, 0]);
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
  for (let variant = 0; variant < alphaStudies.length; variant++) {
    const { audio, context } = setup();
    await audio.enable();
    audio.beginAlphaGesture();
    for (const value of [0, 0.25, 5, 10, NaN]) audio.play("alpha", value, variant);
    expect(context.createOscillator).toHaveBeenCalledTimes(alphaVoicing.length);
    // Only the chime study adds struck notes as voices join.
    expect(context.createBufferSource.mock.calls.length > 0).toBe(alphaStudies[variant].chime);
    for (const { value: gain } of context.createGain.mock.results) {
      expect(gain.gain.setTargetAtTime.mock.calls.every(([target]: [number]) => Number.isFinite(target) && target >= 0 && target <= 1.4)).toBe(true);
    }
    audio.stop();
    const sources = [...context.createOscillator.mock.results, ...context.createBufferSource.mock.results].map(({ value }) => value);
    for (const source of sources) {
      expect(source.stop).toHaveBeenCalledOnce();
      (source.onended as (() => void) | null)?.();
    }
    for (const source of sources) expect(source.disconnect).toHaveBeenCalledOnce();
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

it("crossfades long split tones without retriggering the same note", async () => {
  const { audio, context } = setup();
  await audio.enable();
  const piano = splitStudies.findIndex((study) => study.legato);
  audio.adjustSplit(0, piano);
  const first = context.createBufferSource.mock.results[0].value;
  // Counts below one clamp to the lowest note, C4.
  audio.adjustSplit(1, piano);
  expect(context.createBufferSource).toHaveBeenCalledOnce();
  context.currentTime += 0.15;
  audio.adjustSplit(4, piano);
  expect(context.createBufferSource).toHaveBeenCalledTimes(2);
  expect(first.stop).toHaveBeenCalledWith(context.currentTime + 0.4);
  const latestGain = context.createGain.mock.results.at(-1)!.value.gain;
  expect(latestGain.setValueAtTime).toHaveBeenCalledWith(0, context.currentTime);
  expect(latestGain.setTargetAtTime).toHaveBeenCalledWith(0.85, context.currentTime, 0.035);
  // Explicit confirmation always strikes, even on the same note.
  audio.play("split", 4, piano);
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

it("lets bandwidth ticks overlap, one per slider step", async () => {
  const { audio, context, voices } = setup();
  await audio.enable();
  const tick = bandwidthStudies.findIndex((study) => study.id === "B1");
  audio.play("bandwidth", 0.5, tick);
  context.currentTime += 0.01; audio.play("bandwidth", 0.55, tick);
  expect(context.createBufferSource).toHaveBeenCalledOnce();
  context.currentTime += 0.05; audio.play("bandwidth", 0.55, tick);
  context.currentTime += 0.05; audio.play("bandwidth", 0.55, tick);
  expect(context.createBufferSource).toHaveBeenCalledTimes(2);
  context.currentTime += 0.05; audio.play("bandwidth", 0.6, tick);
  expect(context.createBufferSource).toHaveBeenCalledTimes(3);
  expect(voices[0].stop).not.toHaveBeenCalled();
});

it("sustains the bandwidth air band while held and releases it after", async () => {
  vi.useFakeTimers();
  const { audio, context } = setup();
  await audio.enable();
  const air = bandwidthStudies.findIndex((study) => study.kind === "sustain");
  audio.beginAlphaGesture();
  for (const h of [0.2, 0.7, 1.5]) audio.play("bandwidth", h, air);
  expect(context.createBufferSource).toHaveBeenCalledOnce();
  const source = context.createBufferSource.mock.results[0].value;
  vi.advanceTimersByTime(3000);
  expect(source.stop).not.toHaveBeenCalled();
  audio.endAlphaGesture();
  expect(source.stop).toHaveBeenCalledOnce();
});

it("holds every sustained bandwidth voice while dragging and cleans it up", async () => {
  vi.useFakeTimers();
  for (const study of bandwidthStudies.filter((entry) => entry.kind === "sustain")) {
    const { audio, context } = setup();
    await audio.enable();
    audio.beginAlphaGesture();
    for (const h of [0.2, 0.9, 1.5, NaN]) audio.play("bandwidth", h, bandwidthStudies.indexOf(study));
    const sources = [...context.createOscillator.mock.results, ...context.createBufferSource.mock.results].map(({ value }) => value);
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    expect(sources[0].stop).not.toHaveBeenCalled();
    audio.endAlphaGesture();
    expect(sources[0].stop).toHaveBeenCalledOnce();
    (sources[0].onended as () => void)();
    expect(context.createBiquadFilter.mock.results[0].value.disconnect).toHaveBeenCalledOnce();
  }
});

it("strikes split clicks at once and tells slider direction apart from a confirming tap", async () => {
  const { audio, context } = setup();
  await audio.enable();
  const ratchet = splitStudies.findIndex((study) => study.id === "S5");
  audio.play("split", 3, ratchet);
  context.currentTime += 0.2; audio.adjustSplit(4, ratchet);
  context.currentTime += 0.2; audio.adjustSplit(3, ratchet);
  // Neutral tap, then up, then down: three distinct buffers.
  expect(context.createBuffer).toHaveBeenCalledTimes(3);
  const gains = context.createGain.mock.results.slice(-3).map(({ value }) => value.gain);
  expect(gains.every((gain) => gain.setValueAtTime.mock.calls[0][0] === splitStudies[ratchet].level)).toBe(true);
  // No fade-in: only the next step's crossfade ever lowers a click.
  expect(gains.at(-1).setTargetAtTime).not.toHaveBeenCalled();
});
