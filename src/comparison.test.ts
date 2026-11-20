import { expect, it } from "vitest";
import { bestSoFar, comparisonTrialAxis, comparisonAxis, comparisonFloor, relativeBestSoFar, averageRegret } from "./comparison";
import { emptyPlayback, keepObservations, movePlayback } from "./playback";
import { objectivePresets, type ObjectivePreset } from "./objectives";
import { defaults, runSearch } from "./tpe";

it("tracks cumulative minima, including ties and negative values, without changing observations", () => {
  const trials = [3, 4, 1, 1, -2, 0].map((y, i) => ({ id: i + 1, x: 0, y }));
  const snapshot = structuredClone(trials);
  expect(bestSoFar(trials)).toEqual([3, 3, 1, 1, -2, -2]);
  expect(trials).toEqual(snapshot);
  expect(bestSoFar([])).toEqual([]);
  expect(bestSoFar(trials.slice(0, 1))).toEqual([3]);
  for (const y of [NaN, Infinity, -Infinity]) {
    expect(() => bestSoFar([{ id: 1, x: 0, y }])).toThrow("finite");
  }
});

it("shares startup observations with a reproducible random baseline for every objective", () => {
  for (const objectivePreset of Object.keys(objectivePresets) as ObjectivePreset[]) {
    const config = { ...defaults, objectivePreset };
    const random = runSearch(42, 50, 0, { ...config, startupTrials: 50 });
    const tpe = runSearch(42, 50, 1, config);
    expect(tpe.trials.slice(0, 10)).toEqual(random.trials.slice(0, 10));
    expect(random.proposals.every((proposal) => proposal.method === "random")).toBe(true);
    // Proposal provenance records different settings even when startup draws agree.
    expect(random.trials).toEqual(runSearch(42, 50, 5, { ...config, gamma: 0.4, bandwidth: 1.2, weights: "ei", candidates: 1, startupTrials: 50 }).trials);
    expect(random.trials).not.toEqual(runSearch(43, 50, 0, { ...config, startupTrials: 50 }).trials);
    const randomOnly = runSearch(42, 50, 1, { ...config, startupTrials: 50 });
    expect(bestSoFar(randomOnly.trials)).toEqual(bestSoFar(random.trials));
  }
});

it("compares only the displayed history after stepping back and branching with edited settings", () => {
  const full = movePlayback(emptyPlayback(), 50, 42, 1, defaults);
  const back = movePlayback(full, 12, 42, 1, defaults);
  expect(bestSoFar(back.trials)).toEqual(bestSoFar(full.trials).slice(0, 12));
  const edited = movePlayback(keepObservations(back), 13, 42, 0, { ...defaults, bandwidth: 1.2 });
  expect(bestSoFar(edited.trials).slice(0, 12)).toEqual(bestSoFar(back.trials));
  expect(bestSoFar(movePlayback(edited, 0, 42, 1, defaults).trials)).toEqual([]);
});


it("computes the relative best-so-far and average regret from observed trials", () => {
  const trials = [6, 8, 3, 2].map((y, index) => ({ id: index + 1, x: 0, y }));
  expect(relativeBestSoFar(trials, 2)).toEqual([2, 2, 0.5, 0]);
  expect(() => relativeBestSoFar(trials, 0)).toThrow();
  expect(averageRegret(trials, 2)).toEqual([4, 5, 11 / 3, 11 / 4]);
  expect(averageRegret(trials, 0)).toEqual([6, 7, 17 / 3, 19 / 4]);
  expect(relativeBestSoFar([], 1)).toEqual([]);
  expect(averageRegret([], 1)).toEqual([]);
  expect(averageRegret(trials.slice(0, 2), 2)).toEqual([4, 5]);
  expect(relativeBestSoFar(trials.slice(0, 2), 2)).toEqual([2, 2]);
  for (const minimum of [NaN, Infinity]) {
    expect(() => relativeBestSoFar(trials, minimum)).toThrow();
    expect(() => averageRegret(trials, minimum)).toThrow();
  }
  expect(() => averageRegret([{ id: 1, x: 0, y: NaN }], 0)).toThrow();
  expect(relativeBestSoFar([{ id: 1, x: 0, y: 2 - 1e-16 }], 2)).toEqual([0]);
});

it("keeps log coordinates finite for zero, tiny values, and increasing regret", () => {
  for (const upper of [0, 1e-16, 1e-12, 0.0001, 0.5, 8, 1600]) {
    const axis = comparisonAxis(upper);
    for (const value of [0, upper / 2, upper]) {
      expect(Number.isFinite(axis.normalize(value))).toBe(true);
      expect(axis.normalize(value)).toBeGreaterThanOrEqual(0);
      expect(axis.normalize(value)).toBeLessThanOrEqual(1);
    }
    expect(axis.ticks.every(Number.isFinite)).toBe(true);
    expect(axis.ticks[0]).toBe(comparisonFloor);
  }
  const axis = comparisonAxis(1);
  expect(axis.normalize(0)).toBe(axis.normalize(comparisonFloor));
  expect(axis.normalize(1e-3) - axis.normalize(1e-6)).toBeCloseTo(axis.normalize(1e-6) - axis.normalize(1e-9));
  const regretAxis = comparisonAxis(1000, 0.1);
  expect(regretAxis.ticks[0]).toBe(0.1);
  expect(regretAxis.normalize(1000)).toBe(1);
  for (const invalid of [-1, NaN, Infinity]) expect(() => comparisonAxis(invalid)).toThrow();
  for (const floor of [0, -1, NaN, Infinity]) expect(() => comparisonAxis(1, floor)).toThrow();
});

it("expands the evaluation axis in blocks of ten and caps it at the trial limit", () => {
  for (const [count, upper] of [[0, 10], [1, 10], [10, 10], [11, 20], [20, 20], [21, 30], [56, 60], [191, 200], [200, 200]]) {
    const axis = comparisonTrialAxis(count);
    expect(axis.upper).toBe(upper);
    expect(axis.ticks[0]).toBe(1);
    expect(axis.ticks.at(-1)).toBe(upper);
    expect(axis.ticks.length).toBeLessThanOrEqual(7);
    expect(new Set(axis.ticks).size).toBe(axis.ticks.length);
  }
  // Replay back across a boundary immediately restores the smaller range.
  expect(comparisonTrialAxis(10).upper).toBe(10);
});
