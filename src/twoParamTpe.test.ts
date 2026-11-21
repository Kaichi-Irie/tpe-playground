import { describe, expect, it } from "vitest";
import { buildTwoParamView, emptyTwoParamPlayback, moveTwoParamPlayback, proposeTwoParamTrial, twoParamSettings, getTwoParamObjective, twoParamObjectivePresets } from "./twoParamTpe";

const sample = (x1: number, x2: number) => ({ id: 1, x1, x2, value: 0, constraints: [], violation: 0 });

const { evaluate: twoParamObjective } = getTwoParamObjective();

describe("Sequential two-parameter search", () => {
  it("supplies finite surfaces with shared density scales", () => {
    const trials = moveTwoParamPlayback(emptyTwoParamPlayback(), 200).trials;
    const model = buildTwoParamView(trials);
    expect(model.goodIds.size).toBe(50);
    expect(model.scales.good).toEqual(model.scales.bad);
    for (const row of model.grid) for (const point of row) {
      expect(Object.values(point).every(Number.isFinite)).toBe(true);
      expect(point.acquisition).toBeCloseTo(Math.log(point.good / point.bad), 10);
    }
  });

  it("starts empty and keeps early surfaces finite until a split is possible", () => {
    for (const trials of [[], [sample(0, 0)]]) {
      const model = buildTwoParamView(trials);
      expect(model.hasDensities).toBe(false);
      expect(model.goodIds.size).toBe(0);
      for (const row of model.grid) for (const point of row) expect(Object.values(point).every(Number.isFinite)).toBe(true);
      for (const [low, high] of Object.values(model.scales)) expect(high).toBeGreaterThan(low);
    }
    const model = buildTwoParamView([sample(0, 0), { ...sample(1, 1), id: 2 }]);
    expect(model.hasDensities).toBe(true);
    expect(model.goodIds.size).toBe(1);
  });

  it("leaves observations unpartitioned when there are no feasible trials, filling, or prior", () => {
    const settings = { constraintPreset: "disk", startupTrials: 2, priorWeight: 0, infeasibleFilling: false } as const;
    const { trials } = moveTwoParamPlayback(emptyTwoParamPlayback(), 2, 50, "multivariate", settings);
    const model = buildTwoParamView(trials, "multivariate", settings);
    expect(model.feasibleIds.size).toBe(0);
    expect(model.fitted).toBeNull();
    expect(model.hasPartition).toBe(false);
    expect(model.hasDensities).toBe(false);
    expect(proposeTwoParamTrial(trials, 50, "multivariate", settings).trace).toMatchObject({
      method: "random", reason: "no-feasible-good",
    });
  });

  it("uses earlier observations to choose the highest scoring joint candidate", () => {
    const initial = moveTwoParamPlayback(emptyTwoParamPlayback(), twoParamSettings.startupTrials);
    expect(proposeTwoParamTrial(initial.trials.slice(0, -1)).method).toBe("random");
    const proposal = proposeTwoParamTrial(initial.trials);
    expect(proposal.method).toBe("tpe");
    expect(proposal.candidates).toHaveLength(twoParamSettings.candidates);
    const model = buildTwoParamView(initial.trials);
    for (const candidate of proposal.candidates) {
      expect(candidate.logRatio).toBeCloseTo(model.evaluate(candidate.x1, candidate.x2).acquisition, 12);
    }
    const best = proposal.candidates.reduce((a, b) => b.logRatio > a.logRatio ? b : a);
    expect([proposal.x1, proposal.x2]).toEqual([best.x1, best.x2]);
    const next = moveTwoParamPlayback(initial, initial.trials.length + 1);
    expect(next.trials.slice(0, -1)).toEqual(initial.trials);
    expect(next.trials[next.trials.length - 1].value).toBe(twoParamObjective(proposal.x1, proposal.x2));
  });

  it("replays deterministically, truncates history, and respects search boundaries", () => {
    const empty = emptyTwoParamPlayback();
    const full = moveTwoParamPlayback(empty, 300);
    expect(full.trials).toHaveLength(twoParamSettings.count);
    expect(empty.trials).toEqual([]);
    expect(full).toEqual(moveTwoParamPlayback(empty, 300));
    expect(full).not.toEqual(moveTwoParamPlayback(empty, 300, 43));
    for (const trial of full.trials) {
      expect(Math.abs(trial.x1)).toBeLessThanOrEqual(5);
      expect(Math.abs(trial.x2)).toBeLessThanOrEqual(5);
      expect(trial.value).toBe(twoParamObjective(trial.x1, trial.x2));
    }
    const back = moveTwoParamPlayback(full, 9);
    expect(back.trials).toEqual(full.trials.slice(0, 9));
    expect(moveTwoParamPlayback(back, 300)).toEqual(full);
    expect(moveTwoParamPlayback(full, -1)).toEqual(empty);
    expect(() => moveTwoParamPlayback(empty, NaN)).toThrow();
    expect(() => proposeTwoParamTrial([], NaN)).toThrow();
    expect(() => proposeTwoParamTrial([sample(6, 0)])).toThrow();
  });
});

describe("adjustable two-parameter search", () => {
  it("branches from unchanged observations and uses the new settings in previews and evaluations", () => {
    const past = moveTwoParamPlayback(emptyTwoParamPlayback(), 10);
    for (const mode of ["univariate", "multivariate"] as const) {
      const settings = { gamma: 0.5, bandwidth: 0.1, weights: "recency" as const, priorWeight: 1, startupTrials: 2, candidates: 4 };
      const model = buildTwoParamView(past.trials, mode, settings);
      expect(model.goodIds.size).toBe(5);
      expect(model.fitted!.snapshot.config).toMatchObject(settings);
      const preview = proposeTwoParamTrial(past.trials, 42, mode, settings);
      expect(preview.trace).toEqual(model.fitted!.propose(42));
      if (preview.trace.method !== "tpe") throw new Error("Expected TPE proposal");
      expect(preview.trace.groups).toHaveLength(mode === "univariate" ? 2 : 1);
      expect(preview.trace.groups.every((group) => group.candidates.length === 4)).toBe(true);
      const next = moveTwoParamPlayback(past, 11, 42, mode, settings);
      expect(next.trials.slice(0, 10)).toEqual(past.trials);
      expect(next.proposals[10]).toEqual(preview);
      expect(next).toEqual(moveTwoParamPlayback(past, 11, 42, mode, settings));
      expect(model.evaluate(0, 0).acquisition).toBeCloseTo(Math.log(model.evaluate(0, 0).good / model.evaluate(0, 0).bad), 10);
    }
  });

  it("respects random-only mode and rejects invalid settings even before startup", () => {
    const random = moveTwoParamPlayback(emptyTwoParamPlayback(), 64, 42, "multivariate", { startupTrials: 64 });
    expect(random.proposals.every((proposal) => proposal.method === "random")).toBe(true);
    for (const settings of [{ gamma: 0 }, { gamma: 1 }, { bandwidth: 0 }, { priorWeight: -1 }, { startupTrials: 1 }, { candidates: 0 }]) {
      expect(() => proposeTwoParamTrial([], 42, "multivariate", settings)).toThrow();
    }
  });
});


describe("two-parameter objective presets", () => {
  it("uses the selected objective consistently in playback and the landscape", () => {
    for (const objectivePreset of Object.keys(twoParamObjectivePresets) as (keyof typeof twoParamObjectivePresets)[]) {
      const settings = { objectivePreset, startupTrials: 2, bandwidth: 1.2, gamma: 0.05 };
      const state = moveTwoParamPlayback(emptyTwoParamPlayback(), 12, 42, "multivariate", settings);
      expect(state).toEqual(moveTwoParamPlayback(emptyTwoParamPlayback(), 12, 42, "multivariate", settings));
      const model = buildTwoParamView(state.trials, "multivariate", settings);
      for (const trial of state.trials) {
        expect(trial.value).toBe(getTwoParamObjective(objectivePreset).evaluate(trial.x1, trial.x2));
        expect(model.evaluate(trial.x1, trial.x2).objective).toBe(trial.value);
      }
      for (const row of model.grid) for (const point of row) expect(Object.values(point).every(Number.isFinite)).toBe(true);
    }
    expect(getTwoParamObjective("quadratic").evaluate(1.5, -1)).toBe(0);
    expect(getTwoParamObjective("rosenbrock").evaluate(1, 1)).toBe(0);
  });
});

it("replays adaptive two-parameter searches deterministically and branches without rewriting observations", () => {
  for (const mode of ["multivariate", "univariate"] as const) for (const bandwidthRule of ["scott", "silverman"] as const) {
    const settings = { bandwidthRule, startupTrials: 2 };
    const initial = moveTwoParamPlayback(emptyTwoParamPlayback(), 12, 42, mode, settings);
    expect(initial).toEqual(moveTwoParamPlayback(emptyTwoParamPlayback(), 12, 42, mode, settings));
    const back = moveTwoParamPlayback(initial, 5, 42, mode, settings);
    expect(moveTwoParamPlayback(back, 12, 42, mode, settings)).toEqual(initial);
    const changed = moveTwoParamPlayback(initial, 13, 42, mode, { ...settings, gamma: 0.4 });
    expect(changed.trials.slice(0, 12)).toEqual(initial.trials);
    expect(changed.trials.every((t) => Number.isFinite(t.value) && Math.abs(t.x1) <= 5 && Math.abs(t.x2) <= 5)).toBe(true);
  }
});

describe("two-parameter constraints", () => {
  it("exposes feasibility and filling membership for a hand-built disk history", () => {
    const trials = [[3, 3], [0, 0], [3.8, 3], [4, 3]].map(([x1, x2], index) => {
      const constraint = Math.hypot(x1 - 3, x2 - 3) - 0.7;
      return { id: index + 1, x1, x2, value: twoParamObjective(x1, x2), constraints: [constraint], violation: Math.max(0, constraint) };
    });
    const settings = { constraintPreset: "disk", gamma: 0.5 } as const;
    const view = buildTwoParamView(trials, "multivariate", settings);
    expect([...view.feasibleIds]).toEqual([1]);
    expect([...view.filledIds]).toEqual([3]);
    expect([...view.goodIds]).toEqual([1, 3]);
    expect([...buildTwoParamView(trials, "multivariate", { ...settings, infeasibleFilling: false }).goodIds]).toEqual([1]);
  });

  it("records raw constraints and summed violations in a reproducible seeded run", () => {
    const settings = { constraintPreset: "band" } as const;
    const state = moveTwoParamPlayback(emptyTwoParamPlayback(), 30, 42, "multivariate", settings);
    expect(state).toEqual(moveTwoParamPlayback(emptyTwoParamPlayback(), 30, 42, "multivariate", settings));
    for (const { x1, x2, constraints, violation } of state.trials) {
      expect(constraints).toEqual([(x1 + x2 - 3.2) / Math.SQRT2, (2.8 - x1 - x2) / Math.SQRT2]);
      expect(violation).toBe(constraints.reduce((sum, value) => sum + Math.max(0, value), 0));
    }
  });

  it("reproduces first feasible disk trials with seed 42 and prior weight 0", () => {
    const run = (infeasibleFilling: boolean) => moveTwoParamPlayback(emptyTwoParamPlayback(), 200, 42, "multivariate", { constraintPreset: "disk", priorWeight: 0, infeasibleFilling });
    const on = run(true).trials.find((trial) => trial.violation === 0)?.id;
    const off = run(false).trials.find((trial) => trial.violation === 0)?.id;
    expect(on).toBe(11);
    expect(off).toBe(64);
  });
});
