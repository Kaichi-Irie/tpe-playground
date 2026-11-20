import { expect, it } from "vitest";
import { partitionConstrainedSingleObjective } from "./partition";

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
