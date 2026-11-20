import { expect, it } from "vitest";
import { renderDice } from "./diceSounds";

it("renders a deterministic dice sound with silent boundaries and headroom", () => {
  const samples = renderDice(24000);
  expect(samples).toEqual(renderDice(24000));
  expect(samples[0]).toBe(0);
  expect(samples.at(-1)).toBe(0);
  expect(samples.every((value) => Number.isFinite(value) && Math.abs(value) < 0.651)).toBe(true);
  expect(samples.some((value) => Math.abs(value) > 0.1)).toBe(true);
});
