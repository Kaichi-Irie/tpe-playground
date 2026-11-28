import { expect, it } from "vitest";
import { gpDefaults } from "./gpSettings";
import { seekPlayback } from "./seekPlayback";
import { buildTwoParamGpView, emptyTwoParamGpPlayback, moveTwoParamGpPlayback, proposeTwoParamGp } from "./twoParamGp";
import { getTwoParamObjective, twoParamTrialLimit } from "./twoParamProblem";

const settings = { ...gpDefaults, startupTrials: 2 };

it("keeps GP traces aligned when moving forward, truncating, and replaying", () => {
  const empty = emptyTwoParamGpPlayback();
  const move = (state: typeof empty, step: number) => moveTwoParamGpPlayback(state, step, 42, settings, "quadratic");
  const run = move(empty, 5);
  expect(run.step).toBe(5);
  expect(run.proposals.map(({ method }) => method)).toEqual(["random", "random", "gp", "gp", "gp"]);
  expect(run.proposals[3].trace.inputTrialIds).toEqual([1, 2, 3]);
  const rewind = move(run, 2);
  expect(rewind.trials).toEqual(run.trials.slice(0, 2));
  expect(rewind.proposals).toEqual(run.proposals.slice(0, 2));
  expect(move(rewind, 5)).toEqual(run);
  const model = buildTwoParamGpView(rewind.trials, settings, "quadratic");
  expect(proposeTwoParamGp(rewind.trials, 42, settings, model.fitted)).toEqual(run.proposals[2]);
  for (const { id, x1, x2, value, constraints, violation } of run.trials) {
    expect([x1, x2]).toEqual([run.proposals[id - 1].x1, run.proposals[id - 1].x2]);
    expect(x1).toBeGreaterThanOrEqual(-5);
    expect(x1).toBeLessThanOrEqual(5);
    expect(x2).toBeGreaterThanOrEqual(-5);
    expect(x2).toBeLessThanOrEqual(5);
    expect(value).toBe(getTwoParamObjective("quadratic").evaluate(x1, x2));
    expect(constraints).toEqual([]);
    expect(violation).toBe(0);
  }
});

it("supplies objective values and safe default scales before the first observation", () => {
  const model = buildTwoParamGpView([], settings, "quadratic");
  expect(model.fitted).toBeNull();
  expect(model.hasModel).toBe(false);
  expect(model.resolvedLengthScale).toBe(settings.lengthScale);
  expect(model.evaluate(1.5, -1)).toEqual({ x1: 1.5, x2: -1, objective: 0, mean: 0, std: 0, acquisition: 0 });
  expect(model.grid).toEqual([]);
  expect(model.scales).toEqual({ mean: [0, 1], uncertainty: [0, 1], acquisition: [0, 1] });
});

it("samples 625 points with finite scales and less uncertainty near a trial", () => {
  const { trials } = moveTwoParamGpPlayback(emptyTwoParamGpPlayback(), 1, 42, settings);
  const model = buildTwoParamGpView(trials, settings);
  expect(model.hasModel).toBe(true);
  expect(model.resolvedLengthScale).toBe(model.fitted?.snapshot.resolvedLengthScale);
  expect(model.grid).toHaveLength(25);
  expect(model.grid.every((row) => row.length === 25)).toBe(true);
  expect(model.grid[0][0]).toEqual(model.evaluate(-5, -5));
  expect(model.grid[24][24]).toEqual(model.evaluate(5, 5));
  expect(model.grid).toBe(model.grid);
  expect(model.scales).toBe(model.scales);
  for (const [low, high] of Object.values(model.scales)) {
    expect(Number.isFinite(low) && Number.isFinite(high) && high > low).toBe(true);
  }
  expect(model.evaluate(trials[0].x1, trials[0].x2).std).toBeLessThan(model.scales.uncertainty[1] / 10);
});

it("matches an uninterrupted run when seeking and leaves the input unchanged when canceled", async () => {
  const start = moveTwoParamGpPlayback(emptyTwoParamGpPlayback(), 2, 42, settings);
  const move = (state: typeof start, step: number) => moveTwoParamGpPlayback(state, step, 42, settings);
  const controller = new AbortController();
  const seek = (yieldTask: () => Promise<void>) =>
    seekPlayback(start, (state) => state.step, 6, twoParamTrialLimit, move, controller.signal, yieldTask, () => 0);
  expect(await seek(async () => {})).toEqual(move(start, 6));
  expect(await seek(async () => controller.abort())).toBeNull();
  expect(start.trials).toHaveLength(2);
  expect(start.proposals).toHaveLength(2);
});
