import { expect, it } from "vitest";
import { gpDefaults } from "./gpSettings";
import { buildOneParamGpView, emptyOneParamGpPlayback, keepOneParamGpObservations, moveOneParamGpPlayback, proposeOneParamGp } from "./oneParamGp";

const grid = Array.from({ length: 501 }, (_, i) => -5 + i / 50);

it("returns an empty view before the first observation", () => {
  expect(buildOneParamGpView([], grid, gpDefaults, "multimodal")).toEqual({
    trials: [], fitted: null, resolvedLengthScale: 2, mean: [], std: [], acquisition: [],
    sampleGrid: [], posteriorSamples: [], evaluate: null,
  });
});

it("pins predictions near observations and draws four smooth deterministic posterior curves", () => {
  const trials = [{ id: 1, x: -2, y: 2 }, { id: 2, x: 0, y: 3 }, { id: 3, x: 2, y: 1 }];
  const settings = { ...gpDefaults, lengthScaleRule: "manual", noise: 0.001 } as const;
  const view = buildOneParamGpView(trials, grid, settings, "multimodal");
  expect(view.fitted?.snapshot.problem.id).toBe("multimodal");
  expect(view.mean).toHaveLength(501);
  expect(view.std).toHaveLength(501);
  expect(view.acquisition).toHaveLength(501);
  for (const { x, y } of trials) {
    const prediction = view.evaluate!(x);
    expect(prediction.mean).toBeCloseTo(y, 4);
    expect(prediction.std).toBeLessThan(0.002);
  }
  expect(view.sampleGrid).toHaveLength(101);
  expect(view.posteriorSamples).toHaveLength(4);
  expect(new Set(view.posteriorSamples.map((curve) => curve.join(","))).size).toBe(4);
  for (const curve of view.posteriorSamples) {
    expect(curve).toHaveLength(101);
    expect(Math.max(...curve.slice(1).map((y, i) => Math.abs(y - curve[i])))).toBeLessThan(0.4);
  }
  expect(buildOneParamGpView(trials, grid, { ...settings, beta: 0 }, "multimodal").posteriorSamples).toEqual(view.posteriorSamples);
  expect(buildOneParamGpView(trials, grid, settings, "multimodal", 8).posteriorSamples).not.toEqual(view.posteriorSamples);
});

it("advances, truncates and branches GP playback without rewriting observations", () => {
  const settings = { ...gpDefaults, startupTrials: 2 };
  const move = (state: ReturnType<typeof emptyOneParamGpPlayback>, step: number) => moveOneParamGpPlayback(state, step, 42, settings, "multimodal");
  const full = move(emptyOneParamGpPlayback(), 4);
  expect(full.proposals.map(({ method }) => method)).toEqual(["random", "random", "gp", "gp"]);
  expect(full.trials.map(({ x }) => x)).toEqual(full.proposals.map(({ x }) => x));
  const rewind = move(full, 2);
  expect(rewind.trials).toEqual(full.trials.slice(0, 2));
  expect(rewind.proposals).toEqual(full.proposals.slice(0, 2));
  expect(move(rewind, 4)).toEqual(full);
  expect(keepOneParamGpObservations({ ...full, step: 2 })).toEqual(rewind);

  const edited = { ...settings, beta: 0 };
  const view = buildOneParamGpView(rewind.trials, grid, edited, "multimodal");
  const preview = proposeOneParamGp(rewind.trials, 42, edited, "multimodal", view.fitted);
  const branch = moveOneParamGpPlayback(rewind, 3, 42, edited, "multimodal");
  expect(branch.trials.slice(0, 2)).toEqual(rewind.trials);
  expect(branch.proposals[2]).toEqual(preview);
  expect(preview.x).not.toBe(full.proposals[2].x);
});
