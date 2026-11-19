import { expect, it } from "vitest";
import { diceSounds, renderDice } from "./diceSounds";

it("renders twelve distinct, deterministic candidates with silent boundaries and headroom", () => {
  const signatures = new Set<string>();
  diceSounds.forEach((_, index) => {
    const samples = renderDice(index, 24000);
    expect(samples).toEqual(renderDice(index, 24000));
    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBe(0);
    expect(samples.every((value) => Number.isFinite(value) && Math.abs(value) < 0.651)).toBe(true);
    expect(samples.some((value) => Math.abs(value) > 0.1)).toBe(true);
    signatures.add(samples.slice(0, 4000).join(","));
  });
  expect(signatures.size).toBe(12);
});


it("keeps the original phrase across timbre studies and transposes only Claves · low", () => {
  for (const preset of diceSounds.slice(0, 9)) {
    expect(preset.frequency).toBe(220);
    expect(preset.notes).toEqual([1, 1.25]);
  }
  const claves = diceSounds[6];
  for (const preset of diceSounds.slice(9)) {
    expect(preset.spacing).toBe(0.075);
    expect([preset.ratios, preset.levels, preset.decay, preset.attack]).toEqual([claves.ratios, claves.levels, claves.decay, claves.attack]);
    // Both notes land within 20 cents of a C-major pitch (just thirds sit 14–16 cents off equal temperament).
    for (const ratio of preset.notes) {
      const midi = 69 + 12 * Math.log2(preset.frequency * ratio / 440);
      expect(Math.abs(midi - Math.round(midi))).toBeLessThan(0.2);
      expect([0, 2, 4, 5, 7, 9, 11]).toContain(Math.round(midi) % 12);
    }
  }
});
