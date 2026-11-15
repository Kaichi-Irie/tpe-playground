import { expect, it } from "vitest";
import { observationWeights, splitModel, createModelDensity, createAcquisition, createKde, generateTrials, objective, splitTrials, proposeTrial, runSearch } from "./tpe";

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
  expect(() => proposeTrial([{ id: 1, x: 6, y: 0 }], 42)).toThrow();
});

it("selects the highest density ratio from bounded candidates", () => {
  const search = runSearch(42);
  for (let i = 10; i < 50; i++) {
    const { good, bad } = splitTrials(search.trials.slice(0, i), 0.2);
    const density = (trials: typeof good) => createKde(trials.map((t) => t.x), { bandwidth: 0.4, weights: trials.map(() => 1) });
    const l = density(good), g = density(bad);
    const proposal = search.proposals[i];
    for (const candidate of proposal.candidates) {
      expect(candidate.x).toBeGreaterThanOrEqual(-5);
      expect(candidate.x).toBeLessThanOrEqual(5);
      expect(candidate.logRatio).toBeCloseTo(Math.log(l(candidate.x)) - Math.log(g(candidate.x)), 9);
      expect(l(proposal.x) / g(proposal.x)).toBeGreaterThanOrEqual(l(candidate.x) / g(candidate.x) * (1 - 1e-12));
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

it("generates reproducible, bounded, noise-free observations", () => {
  const trials = generateTrials(42);
  expect(trials).toHaveLength(50);
  expect(trials).toEqual(generateTrials(42));
  expect(trials).not.toEqual(generateTrials(43));
  expect(trials.every((t) => t.x >= -5 && t.x <= 5 && t.y === objective(t.x))).toBe(true);
});
it("splits by objective rank without mutating the input", () => {
  const trials = generateTrials(42), copy = [...trials];
  const { good, bad, threshold } = splitTrials(trials, 0.2);
  expect(good).toHaveLength(10); expect(bad).toHaveLength(40);
  expect(Math.max(...good.map((t) => t.y))).toBeLessThan(threshold);
  expect(Math.min(...bad.map((t) => t.y))).toBeGreaterThan(threshold);
  expect(trials).toEqual(copy);
  expect(splitTrials(trials, 0.001).good).toHaveLength(1);
  expect(splitTrials(trials, 0.999).bad).toHaveLength(1);
  expect(() => splitTrials(trials, 0)).toThrow();
  expect(() => splitTrials([], 0.2)).toThrow();
  const ties = [{ id: 2, x: 1, y: 0 }, { id: 1, x: 0, y: 0 }];
  expect(splitTrials(ties, 0.5).good[0].id).toBe(1);
});
it("evaluates normalized Gaussian mixtures with explicit weights", () => {
  const kde = createKde([0], { bandwidth: 1, weights: [1] });
  expect(kde(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 12);
  expect(kde(-1)).toBe(kde(1));
  const weighted = createKde([0, 2], { bandwidth: 1, weights: [2, 0] });
  expect(weighted(1)).toBeCloseTo(kde(1), 12);
  const mixture = createKde([-1, 1], { bandwidth: 0.4, weights: [1, 3] });
  const integral = Array.from({ length: 2000 }, (_, i) => mixture(-10 + (i + 0.5) * 0.01) * 0.01).reduce((a, b) => a + b, 0);
  expect(integral).toBeCloseTo(1, 8);
  expect(() => createKde([0], { bandwidth: 0, weights: [1] })).toThrow();
  expect(() => createKde([0], { bandwidth: 1, weights: [0] })).toThrow();
  expect(() => createKde([0], { bandwidth: 1, weights: [-1] })).toThrow();
  expect(() => createKde([0], { bandwidth: 1, weights: [] })).toThrow();
});

it("keeps a reproducible history and builds finite densities at every split step", () => {
  const history = generateTrials(42);
  for (let step = 2; step <= 50; step++) {
    const observed = history.slice(0, step);
    expect(generateTrials(42, step)).toEqual(observed);
    const { good, bad } = splitTrials(observed, 0.2);
    expect(good.length + bad.length).toBe(step);
    expect([...good, ...bad].every((t) => t.id <= step)).toBe(true);
    for (const group of [good, bad]) {
      const kde = createKde(group.map((t) => t.x), { bandwidth: 0.4, weights: group.map(() => 1) });
      for (const x of [-5, 0, 5]) {
        expect(Number.isFinite(kde(x))).toBe(true);
        expect(kde(x)).toBeGreaterThanOrEqual(0);
      }
    }
  }
});

it("normalizes a broad prior with observation-equivalent weight", () => {
  const samples = [{ id: 1, x: 1, y: 0 }, { id: 2, x: -1, y: 0 }];
  const density = createModelDensity(samples, 1);
  const observed = createKde([1, -1], { bandwidth: 0.4, weights: [1, 1] });
  const broad = createKde([0], { bandwidth: 10, weights: [1] });
  for (const x of [-5, -1, 0, 1, 5]) {
    expect(density(x)).toBeCloseTo((2 * observed(x) + broad(x)) / 3, 12);
    expect(createModelDensity(samples, 0)(x)).toBeCloseTo(observed(x), 12);
    expect(createModelDensity([], 1)(x)).toBeCloseTo(broad(x), 12);
  }
  let integral = 0;
  for (let x = -100; x < 100; x += 0.01) integral += density(x + 0.005) * 0.01;
  expect(integral).toBeCloseTo(1, 8);
  for (const weight of [-1, NaN, Infinity]) {
    expect(() => createModelDensity(samples, weight)).toThrow();
    expect(() => runSearch(42, 0, weight)).toThrow();
  }
  expect(() => createModelDensity([], 0)).toThrow();
});

it("uses the prior consistently in densities, acquisition and sequential proposals", () => {
  const on = runSearch(42, 50, 1), off = runSearch(42, 50, 0);
  expect(on).toEqual(runSearch(42, 50, 1));
  expect(on.trials.slice(0, 10)).toEqual(off.trials.slice(0, 10));
  expect(on.trials.slice(10)).not.toEqual(off.trials.slice(10));
  expect(runSearch(42, 17, 1).trials).toEqual(on.trials.slice(0, 17));
  for (let i = 10; i < 50; i++) {
    const history = on.trials.slice(0, i);
    const { good, bad } = splitTrials(history, 0.2);
    const l = createModelDensity(good, 1), g = createModelDensity(bad, 1);
    const acquisition = createAcquisition(history, 1);
    const proposal = on.proposals[i];
    expect(proposal).toEqual(proposeTrial(history, 42, 1));
    for (const candidate of proposal.candidates) {
      expect(candidate.x).toBeGreaterThanOrEqual(-5);
      expect(candidate.x).toBeLessThanOrEqual(5);
      expect(candidate.logRatio).toBeCloseTo(Math.log(l(candidate.x) / g(candidate.x)), 10);
      expect(acquisition(candidate.x)).toBe(candidate.logRatio);
      expect(acquisition(proposal.x)).toBeGreaterThanOrEqual(candidate.logRatio);
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
        const { good, bad } = splitTrials(history, config.gamma);
        const l = createModelDensity(good, priorWeight, config.bandwidth);
        const g = createModelDensity(bad, priorWeight, config.bandwidth);
        const acquisition = createAcquisition(history, priorWeight, config);
        const proposal = search.proposals[i];
        expect(proposal).toEqual(proposeTrial(history, 42, priorWeight, config));
        for (const candidate of proposal.candidates) {
          expect(candidate.x).toBeGreaterThanOrEqual(-5);
          expect(candidate.x).toBeLessThanOrEqual(5);
          expect(candidate.logRatio).toBeCloseTo(Math.log(l(candidate.x)) - Math.log(g(candidate.x)), 9);
          expect(acquisition(proposal.x)).toBeGreaterThanOrEqual(candidate.logRatio);
        }
      }
      const density = createModelDensity(search.trials.slice(0, 2), priorWeight, config.bandwidth);
      let integral = 0;
      for (let x = -100; x < 100; x += 0.01) integral += density(x + 0.005) * 0.01;
      expect(integral).toBeCloseTo(1, 8);
    }
  }
  for (const config of [{ gamma: 0, bandwidth: 0.4 }, { gamma: 1, bandwidth: 0.4 }, { gamma: NaN, bandwidth: 0.4 }, { gamma: 0.2, bandwidth: 0 }, { gamma: 0.2, bandwidth: Infinity }]) {
    expect(() => runSearch(42, 0, 0, config)).toThrow();
    expect(() => createAcquisition(generateTrials(42), 0, config)).toThrow();
  }
  expect(() => createModelDensity(generateTrials(42), 0, -1)).toThrow();
});


it("weights improvements in the good group and handles ties without changing bad weights", () => {
  const trials = [0, 2, 4, 6].map((y, index) => ({ id: index + 1, x: index - 2, y }));
  const model = splitModel(trials, { gamma: 0.5, bandwidth: 0.4, weights: "ei" });
  expect(model.threshold).toBe(3);
  expect(model.goodWeights).toEqual([1.5, 0.5]);
  expect(model.badWeights).toEqual([1, 1]);
  expect(observationWeights(trials, "recency")).toEqual([0.4, 0.8, 1.2, 1.6]);
  expect(observationWeights([...trials].reverse(), "recency")).toEqual([1.6, 1.2, 0.8, 0.4]);
  expect(observationWeights(trials, "ei", 0)).toEqual([1, 1, 1, 1]);
  const tied = trials.map((trial) => ({ ...trial, y: 2 }));
  expect(splitModel(tied, { gamma: 0.5, bandwidth: 0.4, weights: "ei" }).goodWeights).toEqual([1, 1]);
  expect(observationWeights(trials, "ei", 2)).toEqual([4, 0, 0, 0]);
  expect(() => observationWeights(trials, "ei")).toThrow();
  expect(() => observationWeights(trials, "ei", Infinity)).toThrow();
  expect(() => runSearch(42, 0, 0, { gamma: 0.2, bandwidth: 0.4, weights: "invalid" as "uniform" })).toThrow();
});

it("normalizes weighted model densities and rejects invalid weights", () => {
  const samples = [{ id: 1, x: -1, y: 0 }, { id: 2, x: 1, y: 1 }];
  const observed = createKde([-1, 1], { bandwidth: 0.4, weights: [1.5, 0.5] });
  const broad = createKde([0], { bandwidth: 10, weights: [1] });
  const density = createModelDensity(samples, 1, 0.4, [1.5, 0.5]);
  for (const x of [-5, -1, 0, 1, 5]) expect(density(x)).toBeCloseTo((2 * observed(x) + broad(x)) / 3, 12);
  let integral = 0;
  for (let x = -100; x < 100; x += 0.01) integral += density(x + 0.005) * 0.01;
  expect(integral).toBeCloseTo(1, 8);
  for (const weights of [[], [0, 0], [-1, 2], [NaN, 1], [Infinity, 1]]) {
    expect(() => createModelDensity(samples, 0, 0.4, weights)).toThrow();
  }
  expect(createModelDensity(samples, 0, 0.4, [1, 0])(1)).toBeCloseTo(createKde([-1], { bandwidth: 0.4, weights: [1] })(1), 12);
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
        const model = splitModel(history, config);
        const l = createModelDensity(model.good, priorWeight, config.bandwidth, model.goodWeights);
        const g = createModelDensity(model.bad, priorWeight, config.bandwidth, model.badWeights);
        const proposal = search.proposals[step];
        for (const candidate of proposal.candidates) {
          expect(candidate.x).toBeGreaterThanOrEqual(-5);
          expect(candidate.x).toBeLessThanOrEqual(5);
          expect(candidate.logRatio).toBeCloseTo(Math.log(l(candidate.x)) - Math.log(g(candidate.x)), 9);
          expect(createAcquisition(history, priorWeight, config)(proposal.x)).toBeGreaterThanOrEqual(candidate.logRatio);
        }
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

it("normalizes fractional and larger prior weights", () => {
  const samples = generateTrials(42, 2);
  const observed = createModelDensity(samples, 0);
  const broad = createModelDensity([], 1);
  for (const weight of [0, 0.1, 0.5, 5]) {
    const density = createModelDensity(samples, weight);
    for (const x of [-5, 0, 5]) expect(density(x)).toBeCloseTo((2 * observed(x) + weight * broad(x)) / (2 + weight), 12);
    let integral = 0;
    for (let x = -100; x < 100; x += 0.01) integral += density(x + 0.005) * 0.01;
    expect(integral).toBeCloseTo(1, 8);
  }
});
