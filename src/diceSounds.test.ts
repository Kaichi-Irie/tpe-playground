import { expect, it } from "vitest";
import { diceSounds, renderDice } from "./diceSounds";

it("renders nine distinct, deterministic candidates with silent boundaries and headroom", () => {
  const signatures = new Set<string>();
  diceSounds.forEach((_, index) => {
    const samples = renderDice(index, 24000);
    expect(samples).toEqual(renderDice(index, 24000));
    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBe(0);
    expect(samples.every((value) => Number.isFinite(value) && Math.abs(value) < 0.651)).toBe(true);
    expect(samples.some((value) => Math.abs(value) > 0.1)).toBe(true);
    signatures.add(samples.slice(0, 240).join(","));
  });
  expect(signatures.size).toBe(9);
});


it("keeps the original pizzicato pitch and rhythm identical across candidates", () => {
  for (const preset of diceSounds) {
    expect(preset.frequency).toBe(220);
    expect(preset.notes).toEqual([1, 1.25]);
    expect(preset.spacing).toBe(0.075);
  }
});
