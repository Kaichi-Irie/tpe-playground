import { describe, expect, it } from "vitest";
import trajectories from "../fixtures/trajectories.json";
import { createDensity, logDensity } from "./density";
import { fitTpe, proposeTpe, restoreModel, validateInput } from "./engine";
import { evaluateField } from "./visualization";
import { emptyPlayback, movePlayback } from "../../playback";
import { buildOneParamView, defaults, proposeTrial } from "../../oneParamTpe";
import { buildTwoParamView, twoParamConfig, emptyTwoParamPlayback, moveTwoParamPlayback, twoParamProblem, proposeTwoParamTrial } from "../../twoParamTpe";
import type { Observation } from "../types";

const trials: Observation[] = [[-2, -2], [2, 2], [-3, 3], [3, -3]].map(([x1, x2], i) => ({ id: i + 1, params: { x1, x2 }, objectives: [i], constraints: [] }));
const config = { ...twoParamConfig(), gamma: 0.5, bandwidth: 0.5, startupTrials: 2 };

describe("shared TPE model", () => {
  // The fixture records NumPy-stream draws for the truncated-kernel model with seed 42.
  it("reproduces seeded one-parameter and joint two-parameter truncated-kernel trajectories", () => {
    const one = movePlayback(emptyPlayback(), trajectories.one.length, 42, 1, defaults).trials;
    const two = moveTwoParamPlayback(emptyTwoParamPlayback(), trajectories.two.length, 42, "multivariate", { priorWeight: 0 }).trials;
    expect(one).toHaveLength(30);
    expect(two).toHaveLength(30);
    one.forEach((t, i) => { expect(t.x).toBeCloseTo(trajectories.one[i].x, 12); expect(t.y).toBeCloseTo(trajectories.one[i].y, 12); });
    two.forEach((t, i) => { expect(t.x1).toBeCloseTo(trajectories.two[i].x1, 12); expect(t.x2).toBeCloseTo(trajectories.two[i].x2, 12); });
  });

  it("keeps independent cross peaks and joint paired peaks distinct", () => {
    const settings = { ...config, priorWeight: 0 };
    const joint = fitTpe(twoParamProblem, trials, settings);
    const independent = fitTpe(twoParamProblem, trials, { ...settings, mode: "univariate" });
    const at = [{ x1: -2, x2: -2 }, { x1: -2, x2: 2 }];
    const j = joint.evaluate(at), u = independent.evaluate(at);
    expect(j[0].logL - j[1].logL).toBeGreaterThan(20);
    expect(u[0].logL).toBeCloseTo(u[1].logL, 12);
    expect(joint.snapshot.groups).toHaveLength(1);
    expect(independent.snapshot.groups).toHaveLength(2);
    for (const model of [joint, independent]) {
      const trace = model.propose(42);
      expect(trace.version).toBe(2);
      if (trace.method !== "tpe") throw new Error("Expected TPE.");
      for (const group of trace.groups) {
        const best = group.candidates[group.selectedIndex];
        expect(best.score).toBe(Math.max(...group.candidates.map((c) => c.score)));
        for (const id of group.parameterIds) expect(trace.selected[id]).toBe(best.params[id]);
        for (const candidate of group.candidates) {
          expect(Object.keys(candidate.params)).toEqual(group.parameterIds);
          expect(Object.values(candidate.params).every((value) => value >= -5 && value <= 5)).toBe(true);
        }
      }
    }
  });

  it("round trips immutable snapshots without resampling or changing evaluation", () => {
    const model = fitTpe(twoParamProblem, trials, { ...config, priorWeight: 0.5 });
    expect(model.snapshot.version).toBe(2);
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
    const first = fitTpe(twoParamProblem, trials, config);
    const second = fitTpe(twoParamProblem, trials.map((t) => ({ ...t, objectives: [-t.objectives[0]] })), config);
    expect(first.snapshot.historyKey).not.toBe(second.snapshot.historyKey);
    expect(first.snapshot.id).not.toBe(second.snapshot.id);
    expect(JSON.stringify(trials)).toBe(before);
    const maximize = fitTpe({ ...twoParamProblem, directions: ["maximize"] }, trials, config);
    expect(maximize.snapshot.partition.good.map((m) => m.trialId)).toEqual([4, 3]);
  });

  it("rejects unsupported objectives, constraints, duplicate IDs and malformed coordinates", () => {
    expect(() => fitTpe({ ...twoParamProblem, directions: ["minimize", "minimize"] }, trials, config)).toThrow();
    expect(() => fitTpe({ ...twoParamProblem, constraintCount: 1 }, trials, config)).toThrow();
    expect(() => fitTpe(twoParamProblem, [trials[0], trials[0]], config)).toThrow();
    expect(() => fitTpe(twoParamProblem, [{ ...trials[0], params: { x1: 1 } }, trials[1]], config)).toThrow();
    expect(() => fitTpe(twoParamProblem, trials, { ...config, bandwidth: NaN })).toThrow();
  });

  it("accepts only unsigned 32-bit integer seeds in both proposal paths", () => {
    const fitted = fitTpe(twoParamProblem, trials, config);
    for (const seed of [NaN, Infinity, -1, 0.5, 2 ** 32]) {
      expect(() => proposeTpe(twoParamProblem, [], config, seed)).toThrow("Invalid seed");
      expect(() => proposeTpe(twoParamProblem, trials, config, seed)).toThrow("Invalid seed");
      expect(() => fitted.propose(seed)).toThrow("Invalid seed");
    }
    expect(proposeTpe(twoParamProblem, [], config, 0).seed).toBe(0);
    expect(fitted.propose(2 ** 32 - 1).seed).toBe(2 ** 32 - 1);
  });

  it("separates startup proposals from explanatory fitted densities", () => {
    const settings = twoParamConfig();
    expect(proposeTpe(twoParamProblem, trials, settings, 42)).toMatchObject({ method: "random", version: 2 });
    expect(fitTpe(twoParamProblem, trials, settings).snapshot.partition.good.length).toBeGreaterThan(0);
  });
});

describe("visualization contract", () => {
  it("shares scores and membership with the proposal model in both pages", () => {
    const past = movePlayback(emptyPlayback(), 10, 42, 1, defaults).trials;
    const view = buildOneParamView(past, [0, 1], 1, defaults);
    const oneParamProposal = proposeTrial(past, 42, 1, defaults);
    expect(view.fitted!.propose(42)).toEqual(oneParamProposal.trace);
    expect(view.acquisition).toEqual(view.fitted!.evaluate([{ x: 0 }, { x: 1 }]).map((v) => v.score));
    for (const mode of ["univariate", "multivariate"] as const) {
      const state = moveTwoParamPlayback(emptyTwoParamPlayback(), 12, 42, mode);
      const twoParamView = buildTwoParamView(state.trials, mode);
      const proposal = proposeTwoParamTrial(state.trials, 42, mode);
      expect(proposal.trace.method).toBe("tpe");
      if (proposal.trace.method === "tpe") expect(proposal.trace.modelId).toBe(twoParamView.fitted!.snapshot.id);
      expect(twoParamView.evaluate(0, 1).acquisition).toBeCloseTo(twoParamView.fitted!.evaluate([{ x1: 0, x2: 1 }])[0].score, 12);
      if (mode === "univariate") expect(proposal.candidates).toEqual([]);
    }
  });

  it("distinguishes slices from normalized marginals and marginal density ratios", () => {
    const model = fitTpe(twoParamProblem, trials, { ...config, priorWeight: 0 });
    const points = Array.from({ length: 2000 }, (_, i) => ({ x1: -5 + (i + 0.5) * 0.005 }));
    const marginal = evaluateField(model, { field: "good-density", axes: ["x1"], points, projection: { kind: "marginal" } });
    expect(marginal.values.reduce((s, v) => s + v * 0.005, 0)).toBeCloseTo(1, 8);
    const slice = evaluateField(model, { field: "good-density", axes: ["x1"], points, projection: { kind: "slice", fixed: { x2: 0 } } });
    expect(slice.values.reduce((s, v) => s + v * 0.005, 0)).toBeLessThan(0.01);
    const request = { axes: ["x1"], points: [{ x1: 0 }], projection: { kind: "marginal" as const } };
    const l = evaluateField(model, { ...request, field: "good-density" }).values[0];
    const g = evaluateField(model, { ...request, field: "bad-density" }).values[0];
    expect(evaluateField(model, { ...request, field: "log-ratio" }).values[0]).toBeCloseTo(Math.log(l / g), 12);
    expect(() => evaluateField(model, { ...request, field: "log-ratio", projection: { kind: "full" } })).toThrow();
    expect(() => evaluateField(model, { ...request, field: "log-ratio", projection: { kind: "slice", fixed: {} } })).toThrow();
  });

  it("normalizes weighted joint densities, including a prior", () => {
    const density = createDensity(twoParamProblem.parameters, trials.slice(0, 2), 0.5, [2, 0], 0.5);
    const marginal = (x1: number) => Math.exp(logDensity(density, { x1 }, ["x1"]));
    let integral = 0;
    for (let i = 0; i < 2000; i++) integral += marginal(-5 + (i + 0.5) * 0.005) * 0.005;
    expect(integral).toBeCloseTo(1, 8);
  });

  it("retains historical proposal settings when switching modes and branches on rewind", () => {
    const joint = moveTwoParamPlayback(emptyTwoParamPlayback(), 12);
    const old = JSON.stringify(joint);
    const next = moveTwoParamPlayback(joint, 13, 42, "univariate");
    expect(next.trials.slice(0, 12)).toEqual(joint.trials);
    expect(next.proposals.slice(0, 12)).toEqual(joint.proposals);
    expect(next.proposals[12].trace.config.mode).toBe("univariate");
    expect(next.proposals[11].trace.config.mode).toBe("multivariate");
    expect(JSON.stringify(joint)).toBe(old);
    const back = moveTwoParamPlayback(next, 10);
    expect(back.proposals).toHaveLength(10);
    expect(moveTwoParamPlayback(back, 12)).toEqual(joint);
  });
});

describe("constrained TPE", () => {
  const problem = { ...twoParamProblem, constraintCount: 2 };
  const infeasible = trials.map((trial) => ({ ...trial, constraints: [-0.5, 1] }));

  it("validates every constraint and rejects EI even during startup", () => {
    expect(() => validateInput(problem, infeasible, config)).not.toThrow();
    for (const constraints of [[], [0], [0, 1, 2], [NaN, 0], [0, Infinity], [-Infinity, 0]]) {
      expect(() => validateInput(problem, [{ ...infeasible[0], constraints }], config)).toThrow("Invalid observations");
    }
    expect(() => validateInput(problem, [], { ...config, weights: "ei" })).toThrow("EI weights");
  });

  it("uses the startup RNG and records the fallback when Good is empty without a prior", () => {
    const settings = { ...config, infeasibleFilling: false, priorWeight: 0 };
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
