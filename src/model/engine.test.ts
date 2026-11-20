import { describe, expect, it } from "vitest";
import legacy from "./fixtures/legacy-trajectories.json";
import { createDensity, logDensity } from "./density";
import { fitTpe, proposeTpe, restoreModel, validateInput } from "./engine";
import { evaluateField } from "./visualization";
import { buildView1D, config1D, defaults, observations1D, problem1D, runSearch } from "../tpe";
import { buildDemo2D, config2D, emptyPlayback2D, movePlayback2D, observations2D, problem2D, proposeTrial2D } from "../tpe2d";
import type { Observation } from "./types";

const trials: Observation[] = [[-2, -2], [2, 2], [-3, 3], [3, -3]].map(([x1, x2], i) => ({ id: i + 1, params: { x1, x2 }, objectives: [i], constraints: [] }));
const config = { ...config2D(), gamma: 0.5, bandwidth: 0.5, startupTrials: 2 };

describe("shared TPE model", () => {
  it("preserves pre-refactor seeded 1D and joint 2D trajectories", () => {
    const one = runSearch(42, 30, 1).trials;
    const two = movePlayback2D(emptyPlayback2D(), 30).trials;
    one.forEach((t, i) => { expect(t.x).toBeCloseTo(legacy.one[i].x, 12); expect(t.y).toBeCloseTo(legacy.one[i].y, 12); });
    two.forEach((t, i) => { expect(t.x1).toBeCloseTo(legacy.two[i].x1, 12); expect(t.x2).toBeCloseTo(legacy.two[i].x2, 12); });
  });

  it("keeps independent cross peaks and joint paired peaks distinct", () => {
    const joint = fitTpe(problem2D, trials, config);
    const independent = fitTpe(problem2D, trials, { ...config, mode: "univariate" });
    const at = [{ x1: -2, x2: -2 }, { x1: -2, x2: 2 }];
    const j = joint.evaluate(at), u = independent.evaluate(at);
    expect(j[0].logL - j[1].logL).toBeGreaterThan(20);
    expect(u[0].logL).toBeCloseTo(u[1].logL, 12);
    expect(joint.snapshot.groups).toHaveLength(1);
    expect(independent.snapshot.groups).toHaveLength(2);
    for (const model of [joint, independent]) {
      const trace = model.propose(42);
      if (trace.method !== "tpe") throw new Error("Expected TPE.");
      for (const group of trace.groups) {
        const best = group.candidates[group.selectedIndex];
        expect(best.score).toBe(Math.max(...group.candidates.map((c) => c.score)));
        for (const id of group.parameterIds) expect(trace.selected[id]).toBe(best.params[id]);
        for (const c of group.candidates) expect(Object.keys(c.params)).toEqual(group.parameterIds);
      }
    }
  });

  it("round trips immutable snapshots without resampling or changing evaluation", () => {
    const model = fitTpe(problem2D, trials, { ...config, priorWeight: 0.5 });
    const snapshot = JSON.parse(JSON.stringify(model.snapshot));
    const restored = restoreModel(snapshot);
    const points = [{ x1: 0, x2: 1 }];
    expect(restored.evaluate(points)).toEqual(model.evaluate(points));
    expect(restored.propose(42)).toEqual(model.propose(42));
    snapshot.groups[0].good.kernels[0].center.x1 = 500;
    expect(restored.evaluate(points)).toEqual(model.evaluate(points));
    expect(Object.isFrozen(model.snapshot.groups[0].good.kernels[0].center)).toBe(true);
    expect(model.snapshot.groups[0].good.kernels.reduce((sum, k) => sum + k.mixtureWeight, 0)).toBeCloseTo(1, 12);
    expect(model.snapshot.groups[0].good.kernels.at(-1)?.source.kind).toBe("prior");
  });

  it("distinguishes changed outcomes with the same IDs and does not mutate input", () => {
    const before = JSON.stringify(trials);
    const first = fitTpe(problem2D, trials, config);
    const second = fitTpe(problem2D, trials.map((t) => ({ ...t, objectives: [-t.objectives[0]] })), config);
    expect(first.snapshot.historyKey).not.toBe(second.snapshot.historyKey);
    expect(first.snapshot.id).not.toBe(second.snapshot.id);
    expect(JSON.stringify(trials)).toBe(before);
    const maximize = fitTpe({ ...problem2D, directions: ["maximize"] }, trials, config);
    expect(maximize.snapshot.partition.good.map((m) => m.trialId)).toEqual([4, 3]);
  });

  it("rejects unsupported objectives, constraints, duplicate IDs and malformed coordinates", () => {
    expect(() => fitTpe({ ...problem2D, directions: ["minimize", "minimize"] }, trials, config)).toThrow();
    expect(() => fitTpe({ ...problem2D, constraintCount: 1 }, trials, config)).toThrow();
    expect(() => fitTpe(problem2D, [trials[0], trials[0]], config)).toThrow();
    expect(() => fitTpe(problem2D, [{ ...trials[0], params: { x1: 1 } }, trials[1]], config)).toThrow();
    expect(() => fitTpe(problem2D, trials, { ...config, bandwidth: NaN })).toThrow();
    expect(() => proposeTpe(problem2D, [], config, NaN)).toThrow();
  });

  it("separates startup proposals from explanatory fitted densities", () => {
    const settings = config2D();
    expect(proposeTpe(problem2D, trials, settings, 42).method).toBe("random");
    expect(fitTpe(problem2D, trials, settings).snapshot.partition.good.length).toBeGreaterThan(0);
  });
});

describe("visualization contract", () => {
  it("shares scores and membership with the proposal model in both pages", () => {
    const past = runSearch(42, 10, 1).trials;
    const view = buildView1D(past, [0, 1], 1, defaults);
    const core = fitTpe(problem1D, observations1D(past), config1D(defaults, 1));
    expect(view.acquisition).toEqual(core.evaluate([{ x: 0 }, { x: 1 }]).map((v) => v.score));
    for (const mode of ["univariate", "multivariate"] as const) {
      const state = movePlayback2D(emptyPlayback2D(), 12, 42, mode);
      const view2D = buildDemo2D(state.trials, mode);
      const proposal = proposeTrial2D(state.trials, 42, mode);
      expect(proposal.trace.method).toBe("tpe");
      if (proposal.trace.method === "tpe") expect(proposal.trace.modelId).toBe(view2D.fitted!.snapshot.id);
      expect(view2D.evaluate(0, 1).acquisition).toBeCloseTo(view2D.fitted!.evaluate([{ x1: 0, x2: 1 }])[0].score, 12);
      if (mode === "univariate") expect(proposal.candidates).toEqual([]);
    }
  });

  it("distinguishes slices from normalized marginals and marginal density ratios", () => {
    const model = fitTpe(problem2D, trials, config);
    const points = Array.from({ length: 1000 }, (_, i) => ({ x1: -10 + (i + 0.5) * 0.02 }));
    const marginal = evaluateField(model, { field: "good-density", axes: ["x1"], points, projection: { kind: "marginal" } });
    expect(marginal.values.reduce((s, v) => s + v * 0.02, 0)).toBeCloseTo(1, 8);
    const slice = evaluateField(model, { field: "good-density", axes: ["x1"], points, projection: { kind: "slice", fixed: { x2: 0 } } });
    expect(slice.values.reduce((s, v) => s + v * 0.02, 0)).toBeLessThan(0.01);
    const request = { axes: ["x1"], points: [{ x1: 0 }], projection: { kind: "marginal" as const } };
    const l = evaluateField(model, { ...request, field: "good-density" }).values[0];
    const g = evaluateField(model, { ...request, field: "bad-density" }).values[0];
    expect(evaluateField(model, { ...request, field: "log-ratio" }).values[0]).toBeCloseTo(Math.log(l / g), 12);
    expect(() => evaluateField(model, { ...request, field: "log-ratio", projection: { kind: "full" } })).toThrow();
    expect(() => evaluateField(model, { ...request, field: "log-ratio", projection: { kind: "slice", fixed: {} } })).toThrow();
  });

  it("normalizes weighted joint densities, including a prior", () => {
    const density = createDensity(problem2D.parameters, trials.slice(0, 2), 0.5, [2, 0], 0.5);
    const marginal = (x1: number) => Math.exp(logDensity(density, { x1 }, ["x1"]));
    let integral = 0;
    for (let x1 = -100; x1 < 100; x1 += 0.05) integral += marginal(x1 + 0.025) * 0.05;
    expect(integral).toBeCloseTo(1, 8);
  });

  it("retains historical proposal settings when switching modes and branches on rewind", () => {
    const joint = movePlayback2D(emptyPlayback2D(), 12);
    const old = JSON.stringify(joint);
    const next = movePlayback2D(joint, 13, 42, "univariate");
    expect(next.trials.slice(0, 12)).toEqual(joint.trials);
    expect(next.proposals.slice(0, 12)).toEqual(joint.proposals);
    expect(next.proposals[12].trace.config.mode).toBe("univariate");
    expect(next.proposals[11].trace.config.mode).toBe("multivariate");
    expect(JSON.stringify(joint)).toBe(old);
    const back = movePlayback2D(next, 10);
    expect(back.proposals).toHaveLength(10);
    expect(movePlayback2D(back, 12)).toEqual(joint);
  });
});

describe("constrained TPE", () => {
  const problem = { ...problem2D, constraintCount: 2 };
  const infeasible = trials.map((trial) => ({ ...trial, constraints: [-0.5, 1] }));

  it("validates every constraint and rejects EI even during startup", () => {
    expect(() => validateInput(problem, infeasible, config)).not.toThrow();
    for (const constraints of [[], [0], [0, 1, 2], [NaN, 0], [0, Infinity], [-Infinity, 0]]) {
      expect(() => validateInput(problem, [{ ...infeasible[0], constraints }], config)).toThrow("Invalid observations");
    }
    expect(() => validateInput(problem, [], { ...config, weights: "ei" })).toThrow("EI weights");
  });

  it("uses the startup RNG and records the fallback when Good is empty without a prior", () => {
    const settings = { ...config, infeasibleFilling: false };
    const fallback = proposeTpe(problem, infeasible, settings, 42);
    const startup = proposeTpe(problem, infeasible, { ...settings, startupTrials: 10 }, 42);
    expect(startup).toMatchObject({ method: "random", reason: "startup" });
    expect(fallback).toMatchObject({ method: "random", reason: "no-feasible-good", selected: startup.selected });
    expect(() => fitTpe(problem, infeasible, settings)).toThrow("Good density");
  });

  it("fits a prior-only Good density and proposes with TPE when the prior is enabled", () => {
    const settings = { ...config, infeasibleFilling: false, priorWeight: 0.5, bandwidthRule: "scott" } as const;
    const fitted = fitTpe(problem, infeasible, settings);
    expect(fitted.snapshot.partition.good).toEqual([]);
    expect(fitted.snapshot.groups[0].good.kernels).toEqual([{
      source: { kind: "prior" }, center: { x1: 0, x2: 0 }, bandwidths: { x1: 10, x2: 10 },
      observationWeight: 0.5, mixtureWeight: 1,
    }]);
    expect(proposeTpe(problem, infeasible, settings, 42)).toEqual(fitted.propose(42));
    expect(fitted.propose(42).method).toBe("tpe");
  });
});
