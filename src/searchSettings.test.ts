import { describe, expect, it } from "vitest";
import { constrainSettings, type ModelSettings } from "./searchSettings";

describe("constrainSettings", () => {
  it.each([
    ["ei", "uniform"], ["uniform", "uniform"], ["recency", "recency"],
  ] as const)("maps %s weights to %s and preserves other settings", (weights, expected) => {
    const settings: ModelSettings = {
      bandwidthRule: "constant", bandwidth: 0.65, gamma: 0.25, weights,
      priorWeight: 1, startupTrials: 10, candidates: 24, infeasibleFilling: false,
    };
    const constrained = constrainSettings(settings);
    expect(constrained).toStrictEqual({ ...settings, weights: expected });
    expect(settings.weights).toBe(weights);
    if (weights === expected) expect(constrained).toBe(settings);
  });
});
