import { expect, it } from "vitest";
import { alphaStudies, alphaVoiceLevels, bandwidthAmount, bandwidthStudies, snapToTriad, widthHz, kernelStudies, kernelStudyNote, midiToHz, noteName, splitStudies, splitStudyNote } from "./labVoices";


it("walks the C-major scale one step per good count, from C4", () => {
  const notes = Array.from({ length: 9 }, (_, i) => splitStudyNote(i + 1));
  expect(notes).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 74]);
  expect(notes.map(noteName).slice(0, 3)).toEqual(["ド C4", "レ D4", "ミ E4"]);
  expect(splitStudyNote(0)).toBe(60);
  expect(splitStudyNote(99)).toBe(84);
  expect(splitStudyNote(NaN)).toBe(60);
});

it("maps kernel x positions monotonically onto C-major triad tones", () => {
  const notes = Array.from({ length: 101 }, (_, i) => kernelStudyNote(-5 + i / 10));
  expect(notes.every((note, i) => [0, 4, 7].includes(note % 12) && (i === 0 || note >= notes[i - 1]))).toBe(true);
  expect(notes[0]).toBe(60);
  expect(notes[100]).toBe(76);
});

it("builds the prior chord from the root as alpha grows", () => {
  expect(alphaVoiceLevels(0)).toEqual([1, 0, 0, 0, 0]);
  expect(alphaVoiceLevels(10)).toEqual([1, 1, 1, 1, 1]);
  const counts = Array.from({ length: 41 }, (_, i) => alphaVoiceLevels(i / 4).reduce((sum, level) => sum + level, 0));
  expect(counts.every((count, i) => i === 0 || count >= counts[i - 1])).toBe(true);
  expect(alphaStudies.every((study) => study.harmonics.length > 0)).toBe(true);
});

it("renders bounded, finite tones for every candidate", () => {
  const check = (samples: Float32Array) => {
    let peak = 0;
    for (const value of samples) { expect(Number.isFinite(value)).toBe(true); peak = Math.max(peak, Math.abs(value)); }
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(0.75 + 1e-6);
  };
  for (const study of kernelStudies) for (const midi of [60, 76]) check(study.render(midiToHz(midi), 8000));
  for (const study of splitStudies) for (const k of [1, 9]) for (const direction of [-1, 0, 1] as const) check(study.render(k, direction, 16000));
});

it("lets direction-aware split studies tell up from down", () => {
  for (const id of ["S5", "S8"]) {
    const study = splitStudies.find((entry) => entry.id === id)!;
    expect(study.render(3, 1, 16000)).not.toEqual(study.render(3, -1, 16000));
  }
  const click = splitStudies.find((entry) => entry.id === "S4")!;
  expect(click.render(1, 0, 16000)).toEqual(click.render(9, 1, 16000));
});

it("renders every bandwidth tone across h without pitch melody inputs failing", () => {
  for (const study of bandwidthStudies) {
    if (study.kind !== "tone") continue;
    for (const h of [0.2, 0.85, 1.5, NaN]) {
      const samples = study.render(h, 8000);
      expect(samples.every((value) => Number.isFinite(value) && Math.abs(value) <= 0.751)).toBe(true);
      expect(samples.some((value) => Math.abs(value) > 0.1)).toBe(true);
    }
  }
  expect(bandwidthAmount(0.2)).toBe(0);
  expect(bandwidthAmount(1.5)).toBe(1);
  expect(bandwidthAmount(NaN)).toBeCloseTo(0.27, 2);
});

it("maps narrow kernels high and wide kernels low, optionally on triad tones", () => {
  const pitches = Array.from({ length: 27 }, (_, i) => widthHz(0.2 + i * 0.05));
  expect(pitches.every((pitch, i) => i === 0 || pitch < pitches[i - 1])).toBe(true);
  expect(pitches[0]).toBeCloseTo(1400);
  expect(pitches[26]).toBeCloseTo(220);
  for (const pitch of pitches) {
    const midi = Math.round(69 + 12 * Math.log2(snapToTriad(pitch) / 440));
    expect([0, 4, 7]).toContain(midi % 12);
  }
});
