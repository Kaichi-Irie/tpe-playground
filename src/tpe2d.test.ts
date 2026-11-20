import { describe, expect, it } from "vitest";
import { buildDemo2D, createJointKDE, generateTrials2D, emptyPlayback2D, movePlayback2D, proposeTrial2D, settings2D, objective2D, getObjective2D, objectivePresets2D } from "./tpe2d";

const sample = (x1: number, x2: number) => ({ id: 1, x1, x2, value: 0, constraints: [], violation: 0 });
describe("joint 2D KDE", () => {
  it("normalizes on the plane, including kernels centered at the viewing boundary", () => {
    const kde = createJointKDE([sample(-5, 5), sample(0, 0)], 0.65);
    let integral = 0;
    const step = 0.1;
    for (let x = -9 + step / 2; x < 9; x += step) for (let y = -9 + step / 2; y < 9; y += step) integral += kde.density(x, y) * step * step;
    expect(integral).toBeCloseTo(1, 6);
    expect(kde.density(-5, 5)).toBeGreaterThan(0);
  });
  it("preserves paired observations instead of creating marginal cross peaks", () => {
    const kde = createJointKDE([sample(-2, -2), sample(2, 2)], 0.5);
    expect(kde.density(-2, -2)).toBeGreaterThan(kde.density(-2, 2) * 1000);
    expect(kde.density(0, 0)).toBeCloseTo(Math.exp(kde.logDensity(0, 0)), 12);
    expect(Number.isFinite(kde.logDensity(100, 100))).toBe(true);
  });
  it("rejects invalid inputs", () => {
    expect(() => createJointKDE([], 1)).toThrow();
    for (const h of [0, -1, Infinity, NaN]) expect(() => createJointKDE([sample(0, 0)], h)).toThrow();
    expect(() => createJointKDE([sample(NaN, 0)], 1)).toThrow();
    expect(() => createJointKDE([sample(0, 0)], 1).density(Infinity, 0)).toThrow();
    expect(() => generateTrials2D(1, 1)).toThrow();
  });
  it("reproduces trials and supplies finite surfaces with shared density scales", () => {
    expect(generateTrials2D()).toEqual(generateTrials2D());
    expect(generateTrials2D(43)).not.toEqual(generateTrials2D());
    const model = buildDemo2D();
    expect(model.goodIds.size).toBe(50);
    expect(model.scales.good).toEqual(model.scales.bad);
    for (const row of model.grid) for (const p of row) {
      expect(Object.values(p).every(Number.isFinite)).toBe(true);
      expect(p.acquisition).toBeCloseTo(Math.log(p.good / p.bad), 10);
    }
  });
});

describe("2D sequential search", () => {
  it("starts empty and keeps early surfaces finite until a split is possible", () => {
    for (const trials of [[], [sample(0, 0)]]) {
      const model = buildDemo2D(trials);
      expect(model.hasDensities).toBe(false);
      expect(model.goodIds.size).toBe(0);
      for (const row of model.grid) for (const point of row) expect(Object.values(point).every(Number.isFinite)).toBe(true);
      for (const [low, high] of Object.values(model.scales)) expect(high).toBeGreaterThan(low);
    }
    const model = buildDemo2D([sample(0, 0), { ...sample(1, 1), id: 2 }]);
    expect(model.hasDensities).toBe(true);
    expect(model.goodIds.size).toBe(1);
  });

  it("uses earlier observations to choose the highest scoring joint candidate", () => {
    const initial = movePlayback2D(emptyPlayback2D(), settings2D.startupTrials);
    expect(proposeTrial2D(initial.trials.slice(0, -1)).method).toBe("random");
    const proposal = proposeTrial2D(initial.trials);
    expect(proposal.method).toBe("tpe");
    expect(proposal.candidates).toHaveLength(settings2D.candidates);
    const model = buildDemo2D(initial.trials);
    for (const candidate of proposal.candidates) {
      expect(candidate.logRatio).toBeCloseTo(model.evaluate(candidate.x1, candidate.x2).acquisition, 12);
    }
    const best = proposal.candidates.reduce((a, b) => b.logRatio > a.logRatio ? b : a);
    expect([proposal.x1, proposal.x2]).toEqual([best.x1, best.x2]);
    const next = movePlayback2D(initial, initial.trials.length + 1);
    expect(next.trials.slice(0, -1)).toEqual(initial.trials);
    expect(next.trials[next.trials.length - 1].value).toBe(objective2D(proposal.x1, proposal.x2));
  });

  it("replays deterministically, truncates history, and respects search boundaries", () => {
    const empty = emptyPlayback2D();
    const full = movePlayback2D(empty, 300);
    expect(full.trials).toHaveLength(settings2D.count);
    expect(empty.trials).toEqual([]);
    expect(full).toEqual(movePlayback2D(empty, 300));
    expect(full).not.toEqual(movePlayback2D(empty, 300, 43));
    for (const trial of full.trials) {
      expect(Math.abs(trial.x1)).toBeLessThanOrEqual(5);
      expect(Math.abs(trial.x2)).toBeLessThanOrEqual(5);
      expect(trial.value).toBe(objective2D(trial.x1, trial.x2));
    }
    const back = movePlayback2D(full, 9);
    expect(back.trials).toEqual(full.trials.slice(0, 9));
    expect(movePlayback2D(back, 300)).toEqual(full);
    expect(movePlayback2D(full, -1)).toEqual(empty);
    expect(() => movePlayback2D(empty, NaN)).toThrow();
    expect(() => proposeTrial2D([], NaN)).toThrow();
    expect(() => proposeTrial2D([sample(6, 0)])).toThrow();
  });
});

describe("adjustable 2D search", () => {
  it("branches from unchanged observations and uses the new settings in previews and evaluations", () => {
    const past = movePlayback2D(emptyPlayback2D(), 10);
    for (const mode of ["univariate", "multivariate"] as const) {
      const settings = { gamma: 0.5, bandwidth: 0.1, weights: "recency" as const, priorWeight: 1, startupTrials: 2, candidates: 4 };
      const model = buildDemo2D(past.trials, mode, settings);
      expect(model.goodIds.size).toBe(5);
      expect(model.fitted!.snapshot.config).toMatchObject(settings);
      const preview = proposeTrial2D(past.trials, 42, mode, settings);
      expect(preview.trace).toEqual(model.fitted!.propose(42));
      if (preview.trace.method !== "tpe") throw new Error("Expected TPE proposal");
      expect(preview.trace.groups).toHaveLength(mode === "univariate" ? 2 : 1);
      expect(preview.trace.groups.every((group) => group.candidates.length === 4)).toBe(true);
      const next = movePlayback2D(past, 11, 42, mode, settings);
      expect(next.trials.slice(0, 10)).toEqual(past.trials);
      expect(next.proposals[10]).toEqual(preview);
      expect(next).toEqual(movePlayback2D(past, 11, 42, mode, settings));
      expect(model.evaluate(0, 0).acquisition).toBeCloseTo(Math.log(model.evaluate(0, 0).good / model.evaluate(0, 0).bad), 10);
    }
  });

  it("respects random-only mode and rejects invalid settings even before startup", () => {
    const random = movePlayback2D(emptyPlayback2D(), 64, 42, "multivariate", { startupTrials: 64 });
    expect(random.proposals.every((proposal) => proposal.method === "random")).toBe(true);
    for (const settings of [{ gamma: 0 }, { gamma: 1 }, { bandwidth: 0 }, { priorWeight: -1 }, { startupTrials: 1 }, { candidates: 0 }]) {
      expect(() => proposeTrial2D([], 42, "multivariate", settings)).toThrow();
    }
  });
});


describe("2D objective presets", () => {
  it("uses the selected objective consistently in playback and the landscape", () => {
    for (const objectivePreset of Object.keys(objectivePresets2D) as (keyof typeof objectivePresets2D)[]) {
      const settings = { objectivePreset, startupTrials: 2, bandwidth: 1.2, gamma: 0.05 };
      const state = movePlayback2D(emptyPlayback2D(), 12, 42, "multivariate", settings);
      expect(state).toEqual(movePlayback2D(emptyPlayback2D(), 12, 42, "multivariate", settings));
      const model = buildDemo2D(state.trials, "multivariate", settings);
      for (const trial of state.trials) {
        expect(trial.value).toBe(getObjective2D(objectivePreset).evaluate(trial.x1, trial.x2));
        expect(model.evaluate(trial.x1, trial.x2).objective).toBe(trial.value);
      }
      for (const row of model.grid) for (const point of row) expect(Object.values(point).every(Number.isFinite)).toBe(true);
    }
    expect(getObjective2D("quadratic").evaluate(1.5, -1)).toBe(0);
    expect(getObjective2D("rosenbrock").evaluate(1, 1)).toBe(0);
    expect(getObjective2D().evaluate(1, 2)).toBe(objective2D(1, 2));
  });
});

it("replays adaptive 2D searches deterministically and branches without rewriting observations", () => {
  for (const mode of ["multivariate", "univariate"] as const) for (const bandwidthRule of ["scott", "silverman"] as const) {
    const settings = { bandwidthRule, startupTrials: 2 };
    const initial = movePlayback2D(emptyPlayback2D(), 12, 42, mode, settings);
    expect(initial).toEqual(movePlayback2D(emptyPlayback2D(), 12, 42, mode, settings));
    const back = movePlayback2D(initial, 5, 42, mode, settings);
    expect(movePlayback2D(back, 12, 42, mode, settings)).toEqual(initial);
    const changed = movePlayback2D(initial, 13, 42, mode, { ...settings, gamma: 0.4 });
    expect(changed.trials.slice(0, 12)).toEqual(initial.trials);
    expect(changed.trials.every((t) => Number.isFinite(t.value) && Math.abs(t.x1) <= 5 && Math.abs(t.x2) <= 5)).toBe(true);
  }
});

describe("2D constraints", () => {
  it("exposes feasibility and filling membership for a hand-built disk history", () => {
    const trials = [[3, 3], [0, 0], [3.8, 3], [4, 3]].map(([x1, x2], index) => {
      const constraint = Math.hypot(x1 - 3, x2 - 3) - 0.7;
      return { id: index + 1, x1, x2, value: objective2D(x1, x2), constraints: [constraint], violation: Math.max(0, constraint) };
    });
    const settings = { constraintPreset: "disk", gamma: 0.5 } as const;
    const view = buildDemo2D(trials, "multivariate", settings);
    expect([...view.feasibleIds]).toEqual([1]);
    expect([...view.filledIds]).toEqual([3]);
    expect([...view.goodIds]).toEqual([1, 3]);
    expect([...buildDemo2D(trials, "multivariate", { ...settings, infeasibleFilling: false }).goodIds]).toEqual([1]);
  });

  it("records raw constraints and summed violations in a reproducible seeded run", () => {
    const settings = { constraintPreset: "band" } as const;
    const state = movePlayback2D(emptyPlayback2D(), 30, 42, "multivariate", settings);
    expect(state).toEqual(movePlayback2D(emptyPlayback2D(), 30, 42, "multivariate", settings));
    for (const { x1, x2, constraints, violation } of state.trials) {
      expect(constraints).toEqual([(x1 + x2 - 3.2) / Math.SQRT2, (2.8 - x1 - x2) / Math.SQRT2]);
      expect(violation).toBe(constraints.reduce((sum, value) => sum + Math.max(0, value), 0));
    }
  });

  it("reproduces first feasible disk trials with seed 42 and prior weight 0", () => {
    const run = (infeasibleFilling: boolean) => movePlayback2D(emptyPlayback2D(), 200, 42, "multivariate", { constraintPreset: "disk", priorWeight: 0, infeasibleFilling });
    const on = run(true).trials.find((trial) => trial.violation === 0)?.id;
    const off = run(false).trials.find((trial) => trial.violation === 0)?.id;
    expect(on).toBe(17);
    expect(off).toBe(18);
  });
});
