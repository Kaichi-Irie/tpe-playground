import { expect, it } from "vitest";
import { createDensity } from "./density";
import { partitionConstrainedSingleObjective, weightsFor } from "./partition";

const samples = [0, 2, 4, 6].map((y, index) => ({ id: index + 1, y }));
const sampleValue = ({ y }: (typeof samples)[number]) => y;

it("assigns recency weights by trial ID in the original input order", () => {
  expect(weightsFor(samples, sampleValue, "recency")).toEqual([0.4, 0.8, 1.2, 1.6]);
  expect(weightsFor([...samples].reverse(), sampleValue, "recency")).toEqual([1.6, 1.2, 0.8, 0.4]);
});

it("weights positive improvements and falls back to uniform weights when none improve", () => {
  expect(weightsFor(samples, sampleValue, "ei", 0)).toEqual([1, 1, 1, 1]);
  expect(weightsFor(samples, sampleValue, "ei", 2)).toEqual([4, 0, 0, 0]);
});

it("requires a finite threshold for EI weights", () => {
  expect(() => weightsFor(samples, sampleValue, "ei")).toThrow("EI weights need a finite split threshold");
  expect(() => weightsFor(samples, sampleValue, "ei", Infinity)).toThrow("EI weights need a finite split threshold");
});

const trial = (id: number, value: number, constraints: number[]) => ({ id, params: {}, objectives: [value], constraints });
const trials = [
  trial(8, -8, [1, 2]),
  trial(7, -10, [2, -8]),
  trial(6, 3, [-1, 0]),
  trial(5, 7, [0, 0]),
  trial(4, 3, [-2, 0]),
  trial(3, -100, [1, 1]),
  trial(2, 10, [0, 1]),
  trial(1, -9, [2, 3]),
];

it("ranks feasible trials by objective and uses all trials to size Good", () => {
  const result = partitionConstrainedSingleObjective(trials, 0.25, "uniform", "minimize");
  expect(result.nBelow).toBe(2);
  expect(result.feasibleTrialIds).toEqual([4, 6, 5]);
  expect(result.good.map(({ trialId }) => trialId)).toEqual([4, 6]);
  expect(result.filledTrialIds).toEqual([]);
  expect(partitionConstrainedSingleObjective(trials, 0.25, "uniform", "maximize").good.map(({ trialId }) => trialId)).toEqual([5, 4]);
});

it("fills Good by summed positive violations and breaks violation ties by id", () => {
  const result = partitionConstrainedSingleObjective(trials, 0.75, "uniform", "minimize");
  expect(result.nBelow).toBe(6);
  expect(result.violations).toEqual({ 1: 5, 2: 1, 3: 2, 4: 0, 5: 0, 6: 0, 7: 2, 8: 3 });
  expect(result.filledTrialIds).toEqual([2, 3, 7]);
  expect(result.good.map(({ trialId }) => trialId)).toEqual([4, 6, 5, 2, 3, 7]);
  expect(result.bad.map(({ trialId }) => trialId)).toEqual([8, 1]);
});

it("allows fewer Good members with filling off and applies recency within each group", () => {
  const result = partitionConstrainedSingleObjective(trials, 0.75, "recency", "minimize", false);
  expect(result.nBelow).toBe(6);
  expect(result.filledTrialIds).toEqual([]);
  expect(result.good).toEqual([{ trialId: 4, weight: 0.5 }, { trialId: 6, weight: 1.5 }, { trialId: 5, weight: 1 }]);
  expect(result.bad).toHaveLength(5);
  expect(() => partitionConstrainedSingleObjective(trials, 0.75, "ei", "minimize")).toThrow("EI weights");
});

it.each([
  { n: 24, ramp: [] },
  { n: 25, ramp: [] },
  { n: 26, ramp: [1 / 26] },
  { n: 30, ramp: [1 / 30, 33 / 120, 31 / 60, 91 / 120, 1] },
])("matches Optuna's raw weights and prior share for n=$n", ({ n, ramp }) => {
  const ordered = Array.from({ length: n }, (_, index) => ({ id: index * 2 + 1, y: -index, params: { x: 0 } }));
  const reversed = [...ordered].reverse();
  const expected = [...ramp, ...Array(n - ramp.length).fill(1)];
  const weights = weightsFor(reversed, sampleValue, "optuna");
  weights.forEach((weight, index) => expect(weight).toBeCloseTo(expected[n - 1 - index], 14));

  const total = expected.reduce((sum, weight) => sum + weight, 0);
  const density = createDensity([{ id: "x", low: -5, high: 5 }], reversed, 1, weights, 1);
  expect(density.kernels.at(-1)?.mixtureWeight).toBeCloseTo(1 / (total + 1), 14);
});

it("uses trial order for Optuna weights after filling Good with infeasible trials", () => {
  const result = partitionConstrainedSingleObjective(trials, 0.75, "optuna", "minimize");
  expect(result.filledTrialIds).toEqual([2, 3, 7]);
  expect(result.good.map(({ trialId }) => trialId)).toEqual([2, 3, 4, 5, 6, 7]);
});
