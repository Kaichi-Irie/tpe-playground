import { describe, expect, it } from "vitest";
import { randomSample } from "../numpyRandom";
import type { Observation, Point, Problem } from "../types";
import {
  defaultCmaEsPopulationSize, defaultCmaEsSigma0, fitCmaEs, proposeCmaEs, resolveCmaEsConfig, restoreCmaEsModel,
} from "./engine";
import type { CmaEsConfig, CmaEsProposalTrace } from "./types";

const problem: Problem = {
  id: "test", parameters: [{ id: "x", low: -5, high: 5 }, { id: "y", low: -5, high: 5 }],
  directions: ["minimize"], constraintCount: 0,
};
const quadratic = ({ x, y }: Point) => 0.12 * (x - 1.5) ** 2 + 0.18 * (y + 1) ** 2;

function run(target: number, evaluate = quadratic, search = problem, config: CmaEsConfig = {}, prefix: readonly Observation[] = []) {
  const observations = [...prefix];
  const traces: CmaEsProposalTrace[] = [];
  while (observations.length < target) {
    const trace = proposeCmaEs(search, observations, config, 42);
    traces.push(trace);
    observations.push({ id: observations.length + 1, params: trace.selected, objectives: [evaluate(trace.selected)], constraints: [] });
  }
  return { observations, traces, model: fitCmaEs(search, observations, config) };
}

describe("CMA-ES fitting and proposals", () => {
  it("resolves box defaults in parameter order", () => {
    const asymmetric: Problem = {
      ...problem, parameters: [{ id: "y", low: -7, high: 5 }, { id: "x", low: 2, high: 8 }],
    };
    expect(defaultCmaEsPopulationSize).toBe(6);
    expect(defaultCmaEsSigma0(asymmetric)).toBe(1);
    expect(resolveCmaEsConfig(asymmetric)).toEqual({ sigma0: 1, populationSize: 6, x0: { x: 5, y: -1 } });
    expect(fitCmaEs(asymmetric, []).snapshot.ellipse.center).toEqual([-1, 5]);
  });

  it("reproduces the entire seeded trajectory and snapshot, including after a backward seek", () => {
    const first = run(40);
    const second = run(40);
    expect(second.observations).toStrictEqual(first.observations);
    expect(second.traces).toStrictEqual(first.traces);
    expect(JSON.stringify(second.model.snapshot)).toBe(JSON.stringify(first.model.snapshot));
    const replay = run(40, quadratic, problem, {}, first.observations.slice(0, 18));
    expect(replay.observations).toStrictEqual(first.observations);
    expect(replay.traces).toStrictEqual(first.traces.slice(18));
    expect(replay.model.snapshot).toStrictEqual(first.model.snapshot);
  });

  it("uses only completed batches to update the distribution and records trial IDs in input order", () => {
    const { observations } = run(12, quadratic, problem, { populationSize: 4 });
    const ids = [12, 4, 9, 7, 3, 8, 2, 11, 6, 10, 1, 5];
    const history = observations.map((observation, index) => ({ ...observation, id: ids[index] }));
    const distribution = ({ mean, sigma, covariance, pc, ps, ellipse }: ReturnType<typeof fitCmaEs>["snapshot"]) =>
      ({ mean, sigma, covariance, pc, ps, ellipse });
    for (let length = 0; length <= history.length; length++) {
      const config = { populationSize: 4 };
      const { snapshot } = fitCmaEs(problem, history.slice(0, length), config);
      const generation = Math.floor(length / 4);
      const start = generation * 4;
      expect(snapshot.generation).toBe(generation);
      expect(snapshot.generationProgress).toBe(length % 4);
      expect(snapshot.meanPath).toHaveLength(generation + 1);
      expect(snapshot.meanPath[generation]).toEqual(snapshot.mean);
      expect(snapshot.currentGenerationTrialIds).toEqual(ids.slice(start, length));
      expect(snapshot.lastGenerationTrialIds).toEqual(ids.slice(Math.max(0, start - 4), start));
      const boundary = fitCmaEs(problem, history.slice(0, start), config).snapshot;
      expect(distribution(snapshot)).toEqual(distribution(boundary));
      if (length > 0 && length === start) {
        const previous = fitCmaEs(problem, history.slice(0, start - 1), config).snapshot;
        expect(snapshot.mean).not.toEqual(previous.mean);
        expect(snapshot.sigma).not.toBe(previous.sigma);
        expect(snapshot.covariance).not.toEqual(previous.covariance);
      }
    }
  });

  it("breaks tied objectives by trial ID and includes observation values in provenance", () => {
    const observations = [4, 3, 2, 1].map((id) => ({ id, params: { x: id, y: -id }, objectives: [0], constraints: [] }));
    const config = { populationSize: 4 };
    const { snapshot } = fitCmaEs(problem, observations, config);
    const bestWeight = Math.log(2.5) / (Math.log(2.5) + Math.log(1.25));
    expect(snapshot.mean.x).toBeCloseTo(bestWeight + 2 * (1 - bestWeight), 14);
    const changed = [{ ...observations[0], objectives: [-1] }, ...observations.slice(1)];
    const updated = fitCmaEs(problem, changed, config).snapshot;
    expect(updated.historyKey).not.toBe(snapshot.historyKey);
    expect(updated.id).not.toBe(snapshot.id);
    expect(updated.mean.x).toBeGreaterThan(snapshot.mean.x);
  });

  it("converges on the quadratic and shrinks the step size and covariance ellipse within 120 trials", () => {
    const { observations, model: { snapshot } } = run(120);
    expect(Math.min(...observations.map(({ objectives }) => objectives[0]))).toBeLessThan(1e-3);
    expect(snapshot.sigma).toBeLessThan(snapshot.config.sigma0);
    expect(Math.max(...snapshot.ellipse.radii1Sigma)).toBeLessThan(snapshot.config.sigma0);
  });

  it("aligns the covariance with a rotated ellipsoid's valley", () => {
    const rotated = ({ x, y }: Point) => (x + y) ** 2 + 50 * (x - y) ** 2;
    const { model: { snapshot } } = run(120, rotated);
    const [[xx, xy], [yx, yy]] = snapshot.covariance;
    expect(xy).toBe(yx);
    expect(xy / Math.sqrt(xx * yy)).toBeGreaterThan(0.7);
    const [major] = snapshot.ellipse.eigenvectors;
    expect(Math.abs(major[0] + major[1]) / Math.SQRT2).toBeGreaterThan(0.98);
  });

  it("makes strong progress toward the Rosenbrock optimum within 150 trials", () => {
    const rosenbrock = ({ x, y }: Point) => ((1 - x) ** 2 + 100 * (y - x ** 2) ** 2) / 1000;
    const { observations } = run(150, rosenbrock);
    const best = observations.reduce((a, b) => a.objectives[0] < b.objectives[0] ? a : b);
    const initialBest = Math.min(...observations.slice(0, defaultCmaEsPopulationSize).map(({ objectives }) => objectives[0]));
    expect(best.objectives[0]).toBeLessThan(Math.min(1e-4, initialBest / 100));
    expect(Math.hypot(best.params.x - 1, best.params.y - 1)).toBeLessThan(0.6);
  });

  it("handles maximization", () => {
    const search: Problem = { ...problem, directions: ["maximize"] };
    const { observations, model } = run(120, ({ x, y }) => -((x - 1) ** 2 + (y + 2) ** 2), search);
    expect(Math.max(...observations.map(({ objectives }) => objectives[0]))).toBeGreaterThan(-1e-3);
    const { x, y } = model.snapshot.mean;
    expect(Math.hypot(x - 1, y + 2)).toBeLessThan(0.1);
  });

  it("uses the fixed stride after rejected and clamped proposals, keeping every point in the box", () => {
    const nearBoundary = run(20, quadratic, problem, { x0: { x: 4.99, y: -4.99 } });
    expect(nearBoundary.traces.some((trace) => trace.resampleAttempts > 0 && !trace.clamped)).toBe(true);
    const hugeSigma = run(5, quadratic, problem, { sigma0: 1e10 });
    for (const [index, trace] of hugeSigma.traces.entries()) {
      const offset = index * 202 + 200;
      const radius = Math.sqrt(-2 * Math.log(1 - randomSample(42, offset)));
      const angle = 2 * Math.PI * randomSample(42, offset + 1);
      expect(trace.resampleAttempts).toBe(100);
      expect(trace.clamped).toBe(true);
      expect(trace.selected).toEqual({ x: 5 * Math.sign(radius * Math.cos(angle)), y: 5 * Math.sign(radius * Math.sin(angle)) });
    }
    for (const { selected } of [...nearBoundary.traces, ...hugeSigma.traces]) {
      for (const { id, low, high } of problem.parameters) {
        expect(selected[id]).toBeGreaterThanOrEqual(low);
        expect(selected[id]).toBeLessThanOrEqual(high);
      }
    }
    expect(() => hugeSigma.model.propose(-1)).toThrow("Invalid seed");
  });

  it("evaluates the full multivariate normal log density", () => {
    const initial = fitCmaEs(problem, [], { sigma0: 2, x0: { x: 1, y: -2 } });
    const normalizer = -Math.log(8 * Math.PI);
    expect(initial.logDensity([{ x: 1, y: -2 }, { x: 3, y: -6 }])).toEqual([
      expect.closeTo(normalizer, 14), expect.closeTo(normalizer - 2.5, 14),
    ]);
    const { model } = run(24);
    const { center: [mx, my], eigenvectors, radii1Sigma: radii } = model.snapshot.ellipse;
    const [peak, ...axisDensities] = model.logDensity([
      { x: mx, y: my },
      ...eigenvectors.map(([x, y], i) => ({ x: mx + x * radii[i], y: my + y * radii[i] })),
    ]);
    expect(peak).toBeCloseTo(-Math.log(2 * Math.PI * radii[0] * radii[1]), 14);
    expect(axisDensities).toEqual([expect.closeTo(peak - 0.5, 14), expect.closeTo(peak - 0.5, 14)]);
  });

  it("deep-freezes snapshots and traces and restores a JSON snapshot without aliasing input", () => {
    const { model } = run(17);
    const trace = model.propose(42);
    function expectDeepFrozen(value: object) {
      expect(Object.isFrozen(value)).toBe(true);
      for (const child of Object.values(value)) {
        if (child && typeof child === "object") expectDeepFrozen(child);
      }
    }
    expectDeepFrozen(model.snapshot);
    expectDeepFrozen(trace);
    const input = JSON.parse(JSON.stringify(model.snapshot));
    const restored = restoreCmaEsModel(input);
    expect(restored.snapshot).toStrictEqual(model.snapshot);
    input.ellipse.center[0] = 999;
    input.problem.parameters[0].low = 999;
    expect(restored.propose(42)).toStrictEqual(trace);
    expect(restored.logDensity([trace.selected])).toEqual(model.logDensity([trace.selected]));
    expectDeepFrozen(restored.snapshot);

    const x0 = { x: 0, y: 0 };
    const initial = fitCmaEs(problem, [], { x0 });
    x0.x = 1;
    expect(initial.snapshot.mean.x).toBe(0);
    expect(Object.isFrozen(problem)).toBe(false);
  });

  it("conditions covariance and keeps extreme finite inputs serializable", () => {
    const params = { x: 5, y: 5 };
    const observations = Array.from({ length: 6 }, (_, id) => ({ id, params, objectives: [0], constraints: [] }));
    const { snapshot } = fitCmaEs(problem, observations, { sigma0: Number.MIN_VALUE });
    expect(snapshot.sigma).toBe(1e7);
    const [major, minor] = snapshot.ellipse.eigenvalues;
    expect(major).toBeLessThanOrEqual(1e16);
    expect(major).toBeCloseTo(1e16, -2);
    expect(minor).toBeGreaterThanOrEqual(1e-16);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    const large = fitCmaEs(problem, [], { sigma0: Number.MAX_VALUE });
    expect(restoreCmaEsModel(JSON.parse(JSON.stringify(large.snapshot))).snapshot).toEqual(large.snapshot);
  });
});

describe("CMA-ES input validation", () => {
  it.each([
    [{ ...problem, constraintCount: 1 }, /constrained problems/],
    [{ ...problem, parameters: problem.parameters.slice(1) }, /exactly two/],
    [{ ...problem, parameters: [problem.parameters[0], problem.parameters[0]] }, /search space/],
    [{ ...problem, parameters: [{ id: "x", low: -Number.MAX_VALUE, high: Number.MAX_VALUE }, problem.parameters[1]] }, /search space/],
    [{ ...problem, directions: [] }, /one minimize or maximize objective/],
  ] as const)("rejects an unsupported problem", (search, message) => {
    expect(() => fitCmaEs(search, [])).toThrow(message);
  });

  it.each([
    [{ sigma0: 0 }, /sigma0/],
    [{ sigma0: Infinity }, /sigma0/],
    [{ populationSize: 3 }, /populationSize/],
    [{ populationSize: 4.5 }, /populationSize/],
    [{ populationSize: 1001 }, /populationSize/],
    [{ x0: { x: 1 } }, /x0/],
    [{ x0: { x: 6, y: 0 } }, /x0/],
  ] as const)("rejects invalid configuration %j", (config, message) => {
    expect(() => resolveCmaEsConfig(problem, config)).toThrow(message);
  });

  it("rejects invalid observations even in an incomplete generation", () => {
    const valid: Observation = { id: 0, params: { x: -5, y: 5 }, objectives: [0], constraints: [] };
    expect(() => fitCmaEs(problem, [valid])).not.toThrow();
    for (const invalid of [
      [valid, valid], [{ ...valid, id: -1 }], [{ ...valid, id: 1.5 }], [{ ...valid, objectives: [NaN] }],
      [{ ...valid, objectives: [0, 1] }], [{ ...valid, constraints: [0] }],
      [{ ...valid, params: { x: 5.1, y: 0 } }], [{ ...valid, params: { x: 0, y: NaN } }],
    ]) {
      expect(() => fitCmaEs(problem, invalid)).toThrow("Invalid CMA-ES observations");
    }
  });
});
