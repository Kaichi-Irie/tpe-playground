import { expect, it } from "vitest";
import katex from "katex";
import { twoParamConstraintPresets } from "./twoParamConstraints";
import { twoParamObjectivePresets } from "./twoParamTpe";
import { findObjectiveMinimum, getObjective, objectivePresets, type ObjectivePreset } from "./objectives";
import { defaults, fitOneParamModel, proposeTrial, runSearch } from "./oneParamTpe";
import { emptyPlayback, movePlayback } from "./playback";

const presets = Object.keys(objectivePresets) as ObjectivePreset[];

it("typesets every objective and constraint formula with KaTeX", () => {
  const formulas = [
    ...presets.map((preset) => getObjective(preset).formula),
    ...Object.values(twoParamObjectivePresets).map(({ formula }) => formula),
    ...Object.values(twoParamConstraintPresets).map(({ formula }) => formula).filter(Boolean),
  ];
  for (const tex of formulas) {
    expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true })).not.toThrow();
  }
});

it("shows each preset formula without a long numeric offset", () => {
  for (const preset of presets) {
    expect(getObjective(preset).formula).not.toMatch(/\d{7,}/);
  }
});

it("keeps every objective finite and within the shared plot axes, including boundaries", () => {
  for (const preset of presets) {
    const evaluate = getObjective(preset).evaluate;
    for (let i = 0; i <= 2000; i++) {
      const y = evaluate(-5 + i / 200);
      expect(Number.isFinite(y)).toBe(true);
      expect(y).toBeGreaterThanOrEqual(1 - 1e-14);
      expect(y).toBeLessThanOrEqual(8);
    }
  }
  expect(getObjective("quadratic").evaluate(1.5)).toBe(1);
  expect(getObjective("boundary").evaluate(-5)).toBe(1);
  const narrow = getObjective("narrow").evaluate;
  expect(narrow(2)).toBeLessThan(narrow(-2));
  expect(narrow(2.5)).toBeGreaterThan(narrow(-2));
  expect(() => getObjective("unknown" as ObjectivePreset)).toThrow("Unknown objective preset");
  expect(() => getObjective("toString" as ObjectivePreset)).toThrow();
});

it("uses the chosen objective consistently in sequential search, replay, and startup sampling", () => {
  const original = runSearch(42, 20, 1);
  for (const objectivePreset of presets) {
    const config = { ...defaults, objectivePreset };
    const result = runSearch(42, 20, 1, config);
    expect(result).toEqual(runSearch(42, 20, 1, config));
    expect(result.trials.map((trial) => trial.y)).toEqual(result.trials.map((trial) => getObjective(objectivePreset).evaluate(trial.x)));
    expect(result.trials.slice(0, 10).map((trial) => trial.x)).toEqual(original.trials.slice(0, 10).map((trial) => trial.x));
    const playback = movePlayback(emptyPlayback(), 20, 42, 1, config);
    expect(playback.trials).toEqual(result.trials);
    expect(playback.proposals).toEqual(result.proposals);
    const previous = movePlayback(playback, 12, 42, 1, config);
    expect(movePlayback(previous, 20, 42, 1, config)).toEqual(playback);
  }
  expect(() => runSearch(42, 0, 1, { ...defaults, objectivePreset: "invalid" as ObjectivePreset })).toThrow();
});


it("finds display-only minima including a boundary and the narrow global valley", () => {
  expect(findObjectiveMinimum("quadratic").y).toBe(1);
  expect(findObjectiveMinimum("quadratic").x).toBeCloseTo(1.5, 7);
  expect(findObjectiveMinimum("boundary")).toEqual({ x: -5, y: 1 });
  expect(findObjectiveMinimum("multimodal").y).toBe(1);
  expect(findObjectiveMinimum("narrow").x).toBeCloseTo(2, 4);
  expect(findObjectiveMinimum("narrow").y).toBe(1);
  for (const preset of presets) {
    const minimum = findObjectiveMinimum(preset);
    expect(minimum.y).toBe(getObjective(preset).evaluate(minimum.x));
    const samples = runSearch(42, 50, 1, { ...defaults, objectivePreset: preset }).trials;
    expect(samples.every((trial) => trial.y >= minimum.y - 1e-14)).toBe(true);
  }
});


it("adds only constants and preserves rankings and TPE proposals for every weighting strategy", () => {
  const raw: Record<ObjectivePreset, (x: number) => number> = {
    multimodal: (x) => 0.18 * (x - 0.6) ** 2 + Math.sin(1.8 * x) + 0.35 * Math.cos(3 * x) + 1.5,
    quadratic: (x) => 0.12 * (x - 1.5) ** 2,
    narrow: (x) => 3 - 2.5 * Math.exp(-(((x - 2) / 0.25) ** 2)) - 1.5 * Math.exp(-(((x + 2) / 1.2) ** 2)),
    boundary: (x) => 0.06 * (x + 5) ** 2,
  };
  for (const objectivePreset of presets) {
    const evaluate = getObjective(objectivePreset).evaluate;
    const offset = evaluate(0) - raw[objectivePreset](0);
    const before = Array.from({ length: 30 }, (_, i) => {
      const x = -5 + (i + 0.5) / 3;
      expect(evaluate(x) - raw[objectivePreset](x)).toBeCloseTo(offset, 13);
      return { id: i + 1, x, y: raw[objectivePreset](x) };
    });
    const after = before.map((trial) => ({ ...trial, y: evaluate(trial.x) }));
    for (const weights of ["uniform", "recency", "ei"] as const) {
      const config = { ...defaults, weights, objectivePreset };
      expect(fitOneParamModel(after, 1, config).snapshot.partition.good.map((member) => member.trialId))
        .toEqual(fitOneParamModel(before, 1, config).snapshot.partition.good.map((member) => member.trialId));
      const oldProposal = proposeTrial(before, 50, 1, config);
      const shiftedProposal = proposeTrial(after, 50, 1, config);
      expect(shiftedProposal.x).toBeCloseTo(oldProposal.x, 11);
      shiftedProposal.candidates.forEach((candidate, i) => {
        expect(candidate.x).toBeCloseTo(oldProposal.candidates[i].x, 11);
        expect(candidate.logRatio).toBeCloseTo(oldProposal.candidates[i].logRatio, 10);
      });
    }
  }
});
