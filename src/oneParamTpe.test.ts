import { expect, it } from "vitest";
import { getObjective } from "./objectives";
import { buildOneParamView, defaults, fitOneParamModel, proposeTrial, runSearch, splitTrials } from "./oneParamTpe";

const { evaluate: objective } = getObjective();

it("switches from startup to sequential TPE with reproducible prefixes", () => {
  const search = runSearch(42);
  expect(search).toEqual(runSearch(42));
  expect(search).not.toEqual(runSearch(43));
  expect(search.proposals.slice(0, 10).every((p) => p.method === "random" && p.candidates.length === 0)).toBe(true);
  expect(search.proposals.slice(10).every((p) => p.method === "tpe" && p.candidates.length === 24)).toBe(true);
  for (let i = 0; i < 50; i++) {
    const past = search.trials.slice(0, i);
    expect(proposeTrial(past, 42)).toEqual(search.proposals[i]);
    expect(search.trials[i]).toEqual({ id: i + 1, x: search.proposals[i].x, y: objective(search.proposals[i].x) });
  }
  expect(runSearch(42, 17).trials).toEqual(search.trials.slice(0, 17));
  expect(runSearch(42, 0)).toEqual({ trials: [], proposals: [] });
  for (const count of [-1, 1.5, NaN, Infinity, 10001]) expect(() => runSearch(42, count)).toThrow();
  expect(() => runSearch(NaN)).toThrow();
  for (const weight of [-1, NaN, Infinity]) expect(() => runSearch(42, 0, weight)).toThrow();
  expect(() => proposeTrial([{ id: 1, x: 6, y: 0 }], 42)).toThrow();
});

it("selects the highest density ratio from bounded candidates", () => {
  const search = runSearch(42);
  for (let i = 10; i < 50; i++) {
    const proposal = search.proposals[i];
    const grid = proposal.candidates.map(({ x }) => x);
    const view = buildOneParamView(search.trials.slice(0, i), grid, 0, defaults);
    expect(view.acquisition[grid.indexOf(proposal.x)]).toBe(Math.max(...view.acquisition));
    for (const [index, candidate] of proposal.candidates.entries()) {
      expect(candidate.x).toBeGreaterThanOrEqual(-5);
      expect(candidate.x).toBeLessThanOrEqual(5);
      expect(candidate.logRatio).toBeCloseTo(Math.log(view.goodDensity[index] / view.badDensity[index]), 9);
      expect(view.acquisition[index]).toBe(candidate.logRatio);
    }
  }
});

it("handles repeated boundary observations and widely separated densities", () => {
  for (const edge of [-5, 5]) {
    const trials = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, x: i < 2 ? edge : -edge, y: i }));
    const copy = trials.map((t) => ({ ...t }));
    const proposal = proposeTrial(trials, 0);
    expect(proposal.candidates).toHaveLength(24);
    expect(proposal.candidates.every((c) => c.x >= -5 && c.x <= 5 && Number.isFinite(c.logRatio))).toBe(true);
    expect(trials).toEqual(copy);
  }
});

it("splits the Lab history by rank and breaks ties by observation ID", () => {
  const history = [{ id: 2, x: 1, y: 0 }, { id: 1, x: 0, y: 0 }, { id: 3, x: -1, y: 2 }];
  const before = structuredClone(history);
  const { good, bad } = splitTrials(history, 0.5);
  expect(good.map(({ id }) => id)).toEqual([1, 2]);
  expect(bad.map(({ id }) => id)).toEqual([3]);
  expect(splitTrials(history, 0.001).good).toHaveLength(1);
  expect(splitTrials(history, 0.999).bad).toHaveLength(1);
  expect(() => splitTrials(history, 0)).toThrow();
  expect(history).toEqual(before);
});

it("uses the prior consistently in densities, acquisition and sequential proposals", () => {
  const on = runSearch(42, 50, 1), off = runSearch(42, 50, 0);
  expect(on).toEqual(runSearch(42, 50, 1));
  expect(on.trials.slice(0, 10)).toEqual(off.trials.slice(0, 10));
  expect(on.trials.slice(10)).not.toEqual(off.trials.slice(10));
  expect(runSearch(42, 17, 1).trials).toEqual(on.trials.slice(0, 17));
  for (let i = 10; i < 50; i++) {
    const history = on.trials.slice(0, i);
    const model = fitOneParamModel(history, 1);
    const proposal = on.proposals[i];
    expect(proposal).toEqual(proposeTrial(history, 42, 1));
    for (const candidate of proposal.candidates) {
      expect(candidate.x).toBeGreaterThanOrEqual(-5);
      expect(candidate.x).toBeLessThanOrEqual(5);
      const [atCandidate, atSelected] = model.evaluate([{ x: candidate.x }, { x: proposal.x }]);
      expect(candidate.logRatio).toBe(atCandidate.score);
      expect(atSelected.score).toBeGreaterThanOrEqual(candidate.logRatio);
    }
  }
});

it("samples remote candidates from the prior when observations are concentrated", () => {
  const trials = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, x: 0, y: i }));
  const remote = (weight: number) => Array.from({ length: 100 }, (_, seed) => proposeTrial(trials, seed, weight).candidates)
    .flat().filter((candidate) => Math.abs(candidate.x) > 2).length;
  expect(remote(0)).toBe(0);
  expect(remote(1)).toBeGreaterThan(100);
});

it("applies slider settings consistently to densities and sequential proposals", () => {
  for (const config of [{ gamma: 0.05, bandwidth: 0.1 }, { gamma: 0.5, bandwidth: 1.2 }]) {
    for (const priorWeight of [0, 1]) {
      const search = runSearch(42, 15, priorWeight, config);
      expect(search).toEqual(runSearch(42, 15, priorWeight, config));
      expect(search.trials.slice(0, 10)).toEqual(runSearch(42, 10, priorWeight).trials);
      expect(search.trials.slice(10)).not.toEqual(runSearch(42, 15, priorWeight).trials.slice(10));
      for (let i = 10; i < 15; i++) {
        const history = search.trials.slice(0, i);
        const model = fitOneParamModel(history, priorWeight, config);
        const proposal = search.proposals[i];
        expect(proposal.trace).toEqual(model.propose(42));
      }
    }
  }
  for (const config of [{ gamma: 0, bandwidth: 0.4 }, { gamma: 1, bandwidth: 0.4 }, { gamma: NaN, bandwidth: 0.4 }, { gamma: 0.2, bandwidth: 0 }, { gamma: 0.2, bandwidth: Infinity }]) {
    expect(() => runSearch(42, 0, 0, config)).toThrow();
    expect(() => fitOneParamModel([{ id: 1, x: -1, y: 0 }, { id: 2, x: 1, y: 1 }], 0, config)).toThrow();
  }
});

it("weights improvements in the good group and handles ties without changing bad weights", () => {
  const trials = [0, 2, 4, 6].map((y, index) => ({ id: index + 1, x: index - 2, y }));
  const config = { gamma: 0.5, bandwidth: 0.4, weights: "ei" } as const;
  const view = buildOneParamView(trials, [0], 0, config);
  expect(view.threshold).toBe(3);
  expect(view.goodWeights).toEqual([1.5, 0.5]);
  expect(view.badWeights).toEqual([1, 1]);
  const tied = trials.map((trial) => ({ ...trial, y: 2 }));
  expect(buildOneParamView(tied, [0], 0, config).goodWeights).toEqual([1, 1]);
  expect(() => runSearch(42, 0, 0, { gamma: 0.2, bandwidth: 0.4, weights: "invalid" as "uniform" })).toThrow();
});

it("uses every weighting strategy consistently through sequential search", () => {
  for (const weights of ["uniform", "recency", "ei"] as const) {
    for (const priorWeight of [0, 1]) {
      const config = { gamma: 0.4, bandwidth: 0.4, weights };
      const search = runSearch(42, 25, priorWeight, config);
      expect(search).toEqual(runSearch(42, 25, priorWeight, config));
      expect(runSearch(42, 17, priorWeight, config).trials).toEqual(search.trials.slice(0, 17));
      expect(search.trials.slice(0, 10)).toEqual(runSearch(42, 10).trials);
      if (weights !== "uniform") expect(search.trials.slice(10)).not.toEqual(runSearch(42, 25, priorWeight, { ...config, weights: "uniform" }).trials.slice(10));
      for (let step = 10; step < 25; step++) {
        const history = search.trials.slice(0, step);
        const model = fitOneParamModel(history, priorWeight, config);
        expect(search.proposals[step].trace).toEqual(model.propose(42));
      }
    }
  }
});

it("samples candidates in proportion to EI improvement weights", () => {
  const trials = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, x: index === 0 ? -3 : 3, y: index === 0 ? 0 : 2 }));
  const config = { gamma: 0.2, bandwidth: 0.1, weights: "ei" as const };
  // The second good observation ties the threshold and has zero EI weight.
  const candidates = Array.from({ length: 20 }, (_, seed) => proposeTrial(trials, seed, 0, config).candidates).flat();
  expect(candidates.every((candidate) => candidate.x < 0)).toBe(true);
  const uniform = proposeTrial(trials, 42, 0, { ...config, weights: "uniform" });
  expect(uniform.candidates.some((candidate) => candidate.x > 0)).toBe(true);
});

it("uses configurable startup counts and candidate counts reproducibly", () => {
  for (const startupTrials of [2, 10, 50]) {
    for (const candidates of [1, 4, 128]) {
      const config = { gamma: 0.2, bandwidth: 0.4, startupTrials, candidates };
      const search = runSearch(42, 50, 0.5, config);
      expect(search).toEqual(runSearch(42, 50, 0.5, config));
      expect(search.proposals.slice(0, startupTrials).every((p) => p.method === "random")).toBe(true);
      for (const proposal of search.proposals.slice(startupTrials)) {
        expect(proposal.method).toBe("tpe");
        expect(proposal.candidates).toHaveLength(candidates);
        expect(proposal.x).toBe(proposal.candidates.reduce((a, b) => b.logRatio > a.logRatio ? b : a).x);
        expect(proposal.candidates.every((c) => c.x >= -5 && c.x <= 5 && Number.isFinite(c.logRatio))).toBe(true);
      }
      expect(runSearch(42, 17, 0.5, config).trials).toEqual(search.trials.slice(0, 17));
    }
  }
});

it("rejects invalid search settings even for an empty search", () => {
  for (const startupTrials of [0, 1, -1, 2.5, NaN, Infinity, 10001]) {
    const config = { gamma: 0.2, bandwidth: 0.4, startupTrials };
    expect(() => runSearch(42, 0, 1, config)).toThrow();
    expect(() => proposeTrial([], 42, 1, config)).toThrow();
  }
  for (const candidates of [0, -1, 1.5, NaN, Infinity, 10001]) {
    const config = { gamma: 0.2, bandwidth: 0.4, candidates };
    expect(() => runSearch(42, 0, 1, config)).toThrow();
    expect(() => proposeTrial([], 42, 1, config)).toThrow();
  }
});
