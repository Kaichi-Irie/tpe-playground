import { describe, expect, it } from "vitest";
import type { Observation, Point, Problem } from "../types";
import { historyKeyFor } from "../provenance";
import { sampleUniformPoint } from "../validation";
import { defaultGpLengthScale, fitGp, proposeGp, resolveGpConfig, restoreGpModel } from "./engine";
import { buildKernelMatrix, euclideanDistance, kernelValue } from "./kernels";
import type { GpSnapshot } from "./types";

const box: Problem = {
  id: "quadratic-1d",
  parameters: [{ id: "x", low: -5, high: 5 }],
  directions: ["minimize"],
  constraintCount: 0,
};
const box2D: Problem = {
  ...box,
  id: "quadratic-2d",
  parameters: [{ id: "x", low: -5, high: 5 }, { id: "y", low: -3, high: 3 }],
};
const observation = (id: number, x: number, value: number): Observation =>
  ({ id, params: { x }, objectives: [value], constraints: [] });

describe("GP configuration and inputs", () => {
  it("resolves defaults in original coordinate units", () => {
    expect(defaultGpLengthScale(box)).toBe(2);
    expect(defaultGpLengthScale(box2D)).toBe(1.2);
    expect(resolveGpConfig(box)).toEqual({
      kernel: "matern52", acquisition: "ucb", lengthScaleRule: "auto", lengthScale: 2,
      beta: 2, xi: 0.01, noise: 0.01, startupTrials: 10,
    });
    expect(fitGp(box2D, [], { lengthScale: 3 }).snapshot.resolvedLengthScale).toBe(1.2);
    expect(fitGp(box2D, [], { lengthScaleRule: "manual", lengthScale: 3 }).snapshot.resolvedLengthScale).toBe(3);
  });

  it("requires a continuous 1D or 2D box and a single unconstrained objective", () => {
    expect(() => fitGp({ ...box, parameters: [] }, [])).toThrow(/one or two parameters/i);
    expect(() => fitGp({ ...box2D, parameters: [...box2D.parameters, { id: "z", low: 0, high: 1 }] }, []))
      .toThrow(/one or two parameters/i);
    expect(() => fitGp({ ...box, constraintCount: 1 }, [])).toThrow(/constraints/i);
    expect(() => fitGp({ ...box, directions: [] }, [])).toThrow(/one objective/i);
    expect(() => fitGp({ ...box, directions: ["minimize", "maximize"] }, [])).toThrow(/one objective/i);
    expect(() => fitGp({ ...box, parameters: [{ id: "x", low: 1, high: 0 }] }, [])).toThrow(/search space/i);
  });

  it.each([
    ["lengthScale", 0], ["lengthScale", Infinity], ["noise", -1], ["beta", NaN],
    ["xi", -0.01], ["startupTrials", 0], ["startupTrials", 1.5], ["startupTrials", 10001],
    ["kernel", "other"], ["acquisition", "other"], ["lengthScaleRule", "other"],
  ])("rejects invalid %s (%s)", (name, value) => {
    expect(() => fitGp(box, [], { [name]: value })).toThrow(new RegExp(String(name), "i"));
  });

  it("rejects invalid completed observations and seeds before startup", () => {
    for (const input of [
      [observation(0, 6, 2)], [observation(0, 0, Infinity)],
      [observation(0, 0, 2), observation(0, 1, 3)],
      [{ ...observation(0, 0, 1), params: { y: 0 } }],
      [{ ...observation(0, 0, 1), constraints: [0] }],
    ]) {
      expect(() => fitGp(box, input)).toThrow(/Invalid observations/);
      expect(() => proposeGp(box, input, {}, 42)).toThrow(/Invalid observations/);
    }
    const prior = fitGp(box, []);
    expect(() => proposeGp(box, [], {}, -1)).toThrow(/seed/i);
    expect(() => prior.propose(0x100000000)).toThrow(/seed/i);
    expect(() => prior.samplePosterior([], 1, NaN)).toThrow(/seed/i);
    expect(() => prior.samplePosterior([], -1, 42)).toThrow(/count/i);
    expect(() => prior.predict([{ x: NaN }])).toThrow(/prediction point/i);
  });
});

describe("GP kernels and posterior", () => {
  it("uses unit signal variance and Euclidean distance in coordinate units", () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBe(5);
    expect(kernelValue("rbf", 2, 2)).toBeCloseTo(Math.exp(-0.5), 14);
    const s = Math.sqrt(5);
    const matern = (1 + s + s * s / 3) * Math.exp(-s);
    expect(kernelValue("matern52", 2, 2)).toBeCloseTo(matern, 14);
    expect(kernelValue("matern52", 1e308, 1e-308)).toBe(0);
    expect(buildKernelMatrix([[3, 4], [3, 6]], "matern52", 2, 0.5))
      .toEqual(Float64Array.of(1.25, matern, matern, 1.25));
  });

  it("uses the prior when empty and the observed location with one trial", () => {
    const point = { x: 1 };
    const prior = fitGp(box, [], { acquisition: "ei" });
    expect(prior.snapshot).toMatchObject({ yMean: 0, yStd: 1, bestValue: null, logMarginalLikelihood: null });
    expect(prior.predict([point])).toEqual([{ mean: 0, std: 1, acquisition: 1 }]);
    const model = fitGp(box, [observation(3, 1, 4)], { noise: 0 });
    expect(model.snapshot).toMatchObject({ yMean: 4, yStd: 1, bestValue: 4, resolvedLengthScale: 2 });
    expect(model.snapshot.logMarginalLikelihood).toBeCloseTo(-0.5 * Math.log(2 * Math.PI), 14);
    expect(model.predict([point])).toEqual([{ mean: 4, std: 0, acquisition: -4 }]);
  });

  it.each(["matern52", "rbf"] as const)("interpolates noiseless data with %s and grows uncertain in the gaps", (kernel) => {
    const input = [observation(4, -1, 4), observation(8, 1, 2)];
    const model = fitGp(box, input, { kernel, noise: 0, lengthScaleRule: "manual", lengthScale: 1 });
    expect(model.snapshot).toMatchObject({ yMean: 3, yStd: 1, bestValue: 2 });
    const [first, second, far] = model.predict([{ x: -1 }, { x: 1 }, { x: 5 }]);
    expect(first.mean).toBeCloseTo(4, 12);
    expect(second.mean).toBeCloseTo(2, 12);
    expect(first.std).toBeLessThan(1e-7);
    expect(second.std).toBeLessThan(1e-7);
    expect(far.std).toBeGreaterThan(0.95);
  });

  it("handles repeated noiseless observations and constant targets", () => {
    const input = [observation(0, 1, 4), observation(1, 1, 4)];
    const model = fitGp(box, input, { noise: 0 });
    expect(model.snapshot.yStd).toBe(1e-6);
    expect(Number.isFinite(model.snapshot.logMarginalLikelihood)).toBe(true);
    expect(model.predict([{ x: 1 }])[0].mean).toBe(4);
  });

  it("keeps snapshot diagnostics finite for large objective values and noise", () => {
    const input = [observation(0, -1, -1e308), observation(1, 1, 1e308)];
    const model = fitGp(box, input, { noise: 1e200 });
    expect(model.snapshot.yMean).toBe(0);
    expect(model.snapshot.yStd).toBe(1e308);
    expect(Number.isFinite(model.snapshot.logMarginalLikelihood)).toBe(true);
    expect(JSON.parse(JSON.stringify(model.snapshot))).toEqual(model.snapshot);
  });

  it.each(["matern52", "rbf"] as const)("adapts the scale by marginal likelihood with %s", (kernel) => {
    const xs = Array.from({ length: 15 }, (_, i) => -5 + 10 * i / 14);
    const quadratic = xs.map((x, i) => observation(i, x, x * x));
    const oscillatory = xs.map((x, i) => observation(i, x, Math.sin(3 * x)));
    const smooth = fitGp(box, quadratic, { kernel }).snapshot;
    const rough = fitGp(box, oscillatory, { kernel }).snapshot;
    expect(smooth.resolvedLengthScale).toBeGreaterThan(2 * rough.resolvedLengthScale);
    expect(rough.resolvedLengthScale).toBeGreaterThanOrEqual(0.5);
    expect(smooth.resolvedLengthScale).toBeLessThanOrEqual(15);
    const manual = fitGp(box, quadratic, { kernel, lengthScaleRule: "manual" }).snapshot;
    expect(smooth.logMarginalLikelihood!).toBeGreaterThan(manual.logMarginalLikelihood!);
    expect(fitGp(box, quadratic, {
      kernel, lengthScaleRule: "manual", lengthScale: smooth.resolvedLengthScale,
    }).snapshot.logMarginalLikelihood).toBe(smooth.logMarginalLikelihood);
  });
});

describe("GP acquisitions and posterior draws", () => {
  const training = [observation(0, 0, -1), observation(1, 1, 2)];

  it("uses beta to trade off exploitation and exploration", () => {
    const [near, far] = [{ x: 0 }, { x: -5 }];
    const exploit = fitGp(box, training, { beta: 0, noise: 0 });
    const explore = fitGp(box, training, { beta: 8, noise: 0 });
    const [atBest, away] = exploit.predict([near, far]);
    expect(atBest.acquisition).toBe(-atBest.mean);
    expect(atBest.acquisition).toBeGreaterThan(away.acquisition);
    const [lowUncertainty, highUncertainty] = explore.predict([near, far]);
    expect(highUncertainty.std).toBeGreaterThan(lowUncertainty.std);
    expect(highUncertainty.acquisition).toBeGreaterThan(lowUncertainty.acquisition);
  });

  it("computes positive EI away from pinned points and applies xi in standardized units", () => {
    const options = { acquisition: "ei", noise: 0, lengthScaleRule: "manual" } as const;
    const points = [{ x: 0 }, { x: 1 }, { x: -2 }];
    const [atBest, atWorse, promising] = fitGp(box, training, options).predict(points);
    expect(atBest.acquisition).toBe(0);
    expect(atWorse.acquisition).toBe(0);
    expect(promising.acquisition).toBeGreaterThan(0);
    expect(fitGp(box, training, { ...options, xi: 0.2 }).predict(points)[2].acquisition)
      .toBeLessThan(promising.acquisition);

    const scaled = training.map(({ id, params, objectives }) => observation(id, params.x, 10 * objectives[0] + 40));
    expect(fitGp(box, scaled, options).predict(points)[2].acquisition).toBeCloseTo(10 * promising.acquisition, 12);
  });

  it.each(["ucb", "ei"] as const)("handles maximization and returns the original objective units with %s", (acquisition) => {
    const maximizingBox: Problem = { ...box, directions: ["maximize"] };
    const mirrored = training.map(({ id, params, objectives }) => observation(id, params.x, -objectives[0]));
    const minimize = fitGp(box, training, { acquisition });
    const maximize = fitGp(maximizingBox, mirrored, { acquisition });
    const points = [{ x: -1 }, { x: 0 }, { x: 2 }];
    expect(maximize.snapshot.bestValue).toBe(-1);
    expect(maximize.predict(points)).toEqual(minimize.predict(points).map((p) => ({ ...p, mean: -p.mean })));
    expect(maximize.propose(42).selected).toEqual(minimize.propose(42).selected);
  });

  it("draws smooth pinned functions and keeps the seeded draws stable as length scale changes", () => {
    const input = [observation(0, -1, 1), observation(1, 0, 0), observation(2, 1, 1)];
    const points = Array.from({ length: 81 }, (_, i) => ({ x: -2 + i / 20 }));
    const config = { noise: 0, lengthScaleRule: "manual", lengthScale: 1.5 } as const;
    const fitted = fitGp(box, input, config);
    const draws = fitted.samplePosterior(points, 3, 42);
    expect(draws).toEqual(fitted.samplePosterior(points, 3, 42));
    expect(draws).not.toEqual(fitted.samplePosterior(points, 3, 43));
    expect(draws[0]).not.toEqual(draws[1]);
    expect(fitted.samplePosterior([], 2, 42)).toEqual([[], []]);
    expect(fitted.samplePosterior(points, 0, 42)).toEqual([]);
    const adjusted = fitGp(box, input, { ...config, lengthScale: 1.50001 }).samplePosterior(points, 3, 42);
    for (const [drawIndex, draw] of draws.entries()) {
      expect(draw).toHaveLength(points.length);
      for (const [i, value] of draw.entries()) {
        expect(Math.abs(value - adjusted[drawIndex][i])).toBeLessThan(1e-3);
        if (i > 0) expect(Math.abs(value - draw[i - 1])).toBeLessThan(0.15);
      }
      for (const [index, y] of [[20, 1], [40, 0], [60, 1]]) {
        expect(draw[index]).toBeCloseTo(y, 2);
      }
    }
  });
});

describe("GP proposals and snapshots", () => {
  it("uses the uniform startup stream and immediately switches to GP at the threshold", () => {
    const config = { startupTrials: 2 };
    const seed = 42;
    const input: Observation[] = [];
    for (let i = 0; i < config.startupTrials; i++) {
      const trace = proposeGp(box2D, input, config, seed);
      expect(trace).toMatchObject({
        method: "random", reason: "startup", seed, selected: sampleUniformPoint(box2D, seed, i),
        inputTrialIds: input.map(({ id }) => id), historyKey: historyKeyFor(box2D, input),
      });
      expect(Object.isFrozen(trace.selected)).toBe(true);
      input.push({ id: i, params: trace.selected, objectives: [i], constraints: [] });
    }
    const model = fitGp(box2D, input, config);
    const trace = proposeGp(box2D, input, config, seed);
    expect(trace).toMatchObject({
      method: "gp", modelId: model.snapshot.id, resolvedLengthScale: model.snapshot.resolvedLengthScale,
      prediction: model.predict([trace.selected])[0],
    });
    expect(trace).toEqual(model.propose(seed));
    expect(trace).toEqual(proposeGp(box2D, input, config, seed));
  });

  it("copies and freezes inputs and exactly replays a serialized auto-fit snapshot", () => {
    const parameters = [{ id: "y", low: -3, high: 3 }, { id: "x", low: -5, high: 5 }];
    const problem = { ...box2D, parameters };
    const input = [
      { id: 5, params: { x: -1, y: 0 }, objectives: [3], constraints: [] },
      { id: 6, params: { x: 1, y: 2 }, objectives: [1], constraints: [] },
    ];
    const config = { kernel: "rbf", acquisition: "ei" } as const;
    const points = [{ x: 0.4, y: 1 }, { x: 4, y: -1 }];
    const fitted = fitGp(problem, input, config);
    const { snapshot } = fitted;
    const restoredInput: GpSnapshot = JSON.parse(JSON.stringify(snapshot));
    const restored = restoreGpModel(restoredInput);
    expect(restored.snapshot).toEqual(snapshot);
    expect(restored.snapshot).not.toBe(restoredInput);
    expect(Object.isFrozen(restoredInput.observations[0].coords)).toBe(false);
    expect(Object.isFrozen(snapshot.observations[0].coords)).toBe(true);
    expect(Object.isFrozen(snapshot.problem.parameters[0])).toBe(true);
    expect(Object.isFrozen(snapshot.config)).toBe(true);
    expect(snapshot.observations[1].coords).toEqual([2, 1]);
    const predictions = fitted.predict(points);
    const proposal = fitted.propose(42);
    const draws = fitted.samplePosterior(points, 2, 42);
    expect(Object.isFrozen(proposal.inputTrialIds)).toBe(true);
    expect(proposal.method === "gp" && Object.isFrozen(proposal.prediction)).toBe(true);

    input[0].params.x = 0;
    input[1].objectives[0] = 5;
    expect(fitGp(problem, input, config).snapshot.id).not.toBe(snapshot.id);
    parameters[0].low = -10;
    expect(restored.predict(points)).toEqual(predictions);
    expect(restored.propose(42)).toEqual(proposal);
    expect(restored.samplePosterior(points, 2, 42)).toEqual(draws);
    expect(fitted.predict(points)).toEqual(predictions);
    expect(() => restoreGpModel({ ...snapshot, version: 2 as 1 })).toThrow(/snapshot version/i);
  });

  it("finds a box boundary when the acquisition peaks there", () => {
    const model = fitGp(box, [observation(0, 2, 0), observation(1, 4, -3)], {
      beta: 0, noise: 0, lengthScaleRule: "manual", lengthScale: 5,
    });
    expect(model.propose(42).selected).toEqual({ x: 5 });
  });

  it.each([box, box2D])("converges on $id within 20 trials", (problem) => {
    const input: Observation[] = [];
    const objective = (point: Point) => (point.x - 1.2) ** 2 + (problem === box2D ? (point.y + 0.8) ** 2 : 0);
    for (let id = 0; id < 20; id++) {
      const { selected } = proposeGp(problem, input, undefined, 42);
      input.push({ id, params: selected, objectives: [objective(selected)], constraints: [] });
    }
    const best = Math.min(...input.map(({ objectives }) => objectives[0]));
    expect(best).toBeLessThan(0.02);
  });
});
