import { describe, expect, it } from "vitest";
import { acquisitionPlot, completeInitialInputs, buildExplanation, explanationDefaults, explanationGrid, fixedExample, kernelContribution, splitAtThreshold } from "./explanation";

describe("interactive explanation", () => {
  it("keeps the candidate prefix and cannot lower the winning score when M grows", () => {
    const small = buildExplanation(fixedExample, { ...explanationDefaults, candidates: 3 });
    const large = buildExplanation(fixedExample, { ...explanationDefaults, candidates: 40 });
    expect(large.candidates.slice(0, 3)).toEqual(small.candidates);
    expect(large.candidates[large.selectedIndex].score).toBeGreaterThanOrEqual(small.candidates[small.selectedIndex].score);
    expect(buildExplanation(fixedExample, { ...explanationDefaults, seed: 51 }).candidates).not.toEqual(small.candidates);
  });

  it("shows weighted components that sum to the optimizer density, including the prior", () => {
    for (const weights of ["uniform", "recency", "ei"] as const) {
      const data = buildExplanation(fixedExample, { ...explanationDefaults, weights, priorWeight: 4 });
      for (const kind of ["good", "bad"] as const) {
        const kernels = data.group[kind].kernels;
        expect(kernels.reduce((sum, k) => sum + k.mixtureWeight, 0)).toBeCloseTo(1, 12);
        explanationGrid.forEach((x, i) => {
          expect(kernels.reduce((sum, k) => sum + kernelContribution(k, x), 0)).toBeCloseTo((kind === "good" ? data.goodDensity : data.badDensity)[i], 12);
        });
      }
      data.candidates.forEach((candidate) => expect(candidate.score).toBeCloseTo(candidate.logL - candidate.logG, 12));
    }
  });

  it("propagates upstream edits while keeping the example observations unchanged", () => {
    const original = structuredClone(fixedExample);
    const initial = buildExplanation(fixedExample, explanationDefaults);
    const changed = buildExplanation(fixedExample, { ...explanationDefaults, gamma: 0.6, priorWeight: 0, bandwidth: 1.5 });
    expect(initial.partition.good).toHaveLength(3);
    expect(changed.partition.good).toHaveLength(6);
    expect(changed.group.good.kernels.every((k) => k.source.kind === "observation")).toBe(true);
    expect(changed.goodDensity).not.toEqual(initial.goodDensity);
    expect(changed.candidates).not.toEqual(initial.candidates);
    expect(fixedExample).toEqual(original);
  });
});

it("evaluates the chosen candidate and makes it usable in the next decision", async () => {
  const { evaluateExplanation } = await import("./explanation");
  const before = buildExplanation(fixedExample, explanationDefaults);
  const observation = evaluateExplanation(fixedExample, explanationDefaults);
  expect(observation.x).toBe(before.candidates[before.selectedIndex].params.x);
  expect(Number.isFinite(observation.y)).toBe(true);
  expect(observation.id).toBe(11);
  const after = buildExplanation({ ...fixedExample, trials: [...fixedExample.trials, observation] }, explanationDefaults);
  expect([...after.partition.good, ...after.partition.bad].map((trial) => trial.trialId)).toContain(observation.id);
  expect(after.candidates).not.toEqual(before.candidates);
  expect(fixedExample.trials).toHaveLength(10);
});

it("keeps acquisition geometry finite with narrow kernels and no prior", () => {
  const data = buildExplanation(fixedExample, { ...explanationDefaults, gamma: 0.9, bandwidth: 0.2, priorWeight: 0 });
  const plot = acquisitionPlot(data.logRatios, data.candidates.map((candidate) => candidate.score));
  expect(plot.logarithmic).toBe(true);
  for (const value of [...plot.curve, ...plot.candidates]) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  }
  expect(plot.candidates.indexOf(Math.max(...plot.candidates))).toBe(data.selectedIndex);
});


it("preserves user inputs and fills gaps with seven reproducible observations", () => {
  const inputs = [-5, -4.9, 5];
  const trials = completeInitialInputs(inputs, "multimodal");
  expect(trials).toHaveLength(10);
  expect(trials.slice(0, 3).map((trial) => trial.x)).toEqual(inputs);
  expect(new Set(trials.map((trial) => trial.x)).size).toBe(10);
  expect(trials.every((trial) => trial.x >= -5 && trial.x <= 5 && Number.isFinite(trial.y))).toBe(true);
  expect(trials).toEqual(completeInitialInputs(inputs, "multimodal"));
  expect(inputs).toEqual([-5, -4.9, 5]);
  expect(() => completeInitialInputs([NaN], "multimodal")).toThrow();
  expect(() => completeInitialInputs([5.1], "multimodal")).toThrow();
  expect(() => completeInitialInputs(Array(11).fill(0), "multimodal")).toThrow();
});

it("maps tapped heights to the optimizer's good group across repeated rounds", () => {
  for (const length of [2, 10, 11, 25, 50]) {
    const trials = Array.from({ length }, (_, index) => ({ id: index + 1, x: -5 + index / length * 10, y: index }));
    for (let count = 1; count < length; count++) {
      const value = count - 0.5;
      const split = splitAtThreshold(trials, value);
      const model = buildExplanation({ ...fixedExample, trials }, { ...explanationDefaults, gamma: split.gamma });
      expect(model.partition.good).toHaveLength(count);
      expect(split.threshold).toBe(value);
      expect(split.threshold).toBe(model.partition.threshold);
    }
    for (const value of [-100, 100]) {
      const split = splitAtThreshold(trials, value);
      const model = buildExplanation({ ...fixedExample, trials }, { ...explanationDefaults, gamma: split.gamma });
      expect(model.partition.good).toHaveLength(value < 0 ? 1 : length - 1);
      expect(model.partition.bad.length).toBeGreaterThan(0);
    }
  }
});

it("rejects invalid tapped splits", () => {
  expect(() => splitAtThreshold([], 1)).toThrow();
  expect(() => splitAtThreshold(fixedExample.trials, NaN)).toThrow();
  expect(() => splitAtThreshold([{ id: 1, x: 0, y: Infinity }, { id: 2, x: 1, y: 1 }], 1)).toThrow();
});

it("snaps taps to the same boundary used by improvement weights", () => {
  for (const y of [0, 2.4, 2.65, 4, 8]) {
    const split = splitAtThreshold(fixedExample.trials, y);
    const model = buildExplanation(fixedExample, { ...explanationDefaults, gamma: split.gamma, weights: "ei" });
    expect(split.threshold).toBe(model.partition.threshold);
  }
});
