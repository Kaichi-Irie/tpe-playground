import { expect, it } from "vitest";
import { diceNotes, renderDice } from "./diceSounds";

it("renders a deterministic dice sound with silent boundaries and headroom", () => {
  const samples = renderDice(24000);
  expect(samples).toEqual(renderDice(24000));
  expect(samples[0]).toBe(0);
  expect(samples.at(-1)).toBe(0);
  expect(samples.every((value) => Number.isFinite(value) && Math.abs(value) < 0.651)).toBe(true);
  expect(samples.some((value) => Math.abs(value) > 0.1)).toBe(true);
});

it("plays C4 → E4, a just major third in the Lab's C major", () => {
  const midi = diceNotes.map((hz) => 69 + 12 * Math.log2(hz / 440));
  expect(midi.map(Math.round)).toEqual([60, 64]);
  // The just third sits about 14 cents below equal temperament.
  expect(midi.every((value) => Math.abs(value - Math.round(value)) < 0.15)).toBe(true);
});
