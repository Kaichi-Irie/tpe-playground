import { describe, expect, it } from "vitest";
import { buildTwoParamCmaEsView, emptyTwoParamCmaEsPlayback, matchesOptunaCmaEsPreset, moveTwoParamCmaEsPlayback, optunaCmaEsPreset, twoParamCmaEsDefaults } from "./twoParamCmaEs";
import { getTwoParamObjective, twoParamSettings, type TwoParamObjectivePreset } from "./twoParamTpe";

describe("two-parameter CMA-ES", () => {
  it("starts with the Optuna-inspired defaults and its initial normal density", () => {
    expect(twoParamCmaEsDefaults).toEqual({ sigma0: 1.67, populationSize: 6, x0: { x1: 0, x2: 0 } });
    expect(matchesOptunaCmaEsPreset(twoParamCmaEsDefaults)).toBe(true);
    expect(matchesOptunaCmaEsPreset({ ...optunaCmaEsPreset, x0: { x1: 0, x2: 0.5 } })).toBe(false);
    const view = buildTwoParamCmaEsView([]);
    expect(view.snapshot).toMatchObject({ generation: 0, generationProgress: 0, mean: { x1: 0, x2: 0 }, sigma: 1.67 });
    expect(view.snapshot.ellipse.radii1Sigma).toEqual([1.67, 1.67]);
    expect(view.snapshot.ellipse.radii2Sigma).toEqual([3.34, 3.34]);
    expect(view.evaluate(0, 0).logDensity).toBeCloseTo(-Math.log(2 * Math.PI * 1.67 ** 2), 12);
  });

  it("evaluates the preview and advances the mean only at population boundaries", () => {
    const empty = emptyTwoParamCmaEsPlayback();
    const first = moveTwoParamCmaEsPlayback(empty, 1);
    expect(first.proposals[0].trace).toEqual(buildTwoParamCmaEsView([]).fitted.propose(twoParamSettings.seed));
    const partial = buildTwoParamCmaEsView(moveTwoParamCmaEsPlayback(first, 5).trials);
    expect(partial.snapshot.meanPath).toEqual([{ x1: 0, x2: 0 }]);
    expect(partial.currentGenIds).toEqual(new Set([1, 2, 3, 4, 5]));
    const finished = buildTwoParamCmaEsView(moveTwoParamCmaEsPlayback(first, 6).trials);
    expect(finished.snapshot).toMatchObject({ generation: 1, generationProgress: 0 });
    expect(finished.currentGenIds.size).toBe(0);
    expect(finished.lastGenIds).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(finished.snapshot.meanPath).toEqual([{ x1: 0, x2: 0 }, finished.snapshot.mean]);
    expect(finished.snapshot.mean).not.toEqual(twoParamCmaEsDefaults.x0);
  });

  it("replays deterministically after rewinding with custom settings", () => {
    const settings = { sigma0: 2.25, populationSize: 4, x0: { x1: -1.5, x2: 3 } };
    const move = (state: ReturnType<typeof emptyTwoParamCmaEsPlayback>, step: number) =>
      moveTwoParamCmaEsPlayback(state, step, 13, settings, "rosenbrock");
    const all = move(emptyTwoParamCmaEsPlayback(), twoParamSettings.count + 1);
    expect(all.trials).toHaveLength(twoParamSettings.count);
    const rewound = move(all, 9);
    expect(move(rewound, twoParamSettings.count)).toEqual(all);
    expect(move(all, -1)).toEqual(emptyTwoParamCmaEsPlayback());
    expect(all.trials.every(({ x1, x2 }) => Math.abs(x1) <= 5 && Math.abs(x2) <= 5)).toBe(true);
  });

  it.each<TwoParamObjectivePreset>(["multimodal", "quadratic", "rosenbrock"])("uses the %s objective for replay and inspection", (preset) => {
    const objective = getTwoParamObjective(preset);
    const { trials } = moveTwoParamCmaEsPlayback(emptyTwoParamCmaEsPlayback(), 14, 7, twoParamCmaEsDefaults, preset);
    for (const { x1, x2, value, constraints, violation } of trials) {
      expect(value).toBe(objective.evaluate(x1, x2));
      expect(constraints).toEqual([]);
      expect(violation).toBe(0);
    }
    expect(buildTwoParamCmaEsView(trials, twoParamCmaEsDefaults, preset).evaluate(-1.5, 2).objective).toBe(objective.evaluate(-1.5, 2));
  });
});
