import { expect, it } from "vitest";
import { optunaPreset } from "../searchSettings";
import { proposeTpe } from "./engine";
import fixture from "./fixtures/optuna-5.1-trajectories.json";
import type { DensityMode, Observation, Problem } from "./types";

const runs = fixture.runs as { name: string; seed: number; mode: DensityMode; problem: Problem; trials: Observation[] }[];

const steps = runs.flatMap((run) => run.trials.map((trial, step) => ({ ...run, trial, step })));

it.each(steps)("matches Optuna 5.1.0 for $name, trial $step", ({ seed, mode, problem, trials, trial, step }) => {
  const config = { bandwidth: 0.4, mode, ...optunaPreset };
  const proposal = proposeTpe(problem, trials.slice(0, step), config, seed);
  const startup = step < config.startupTrials;
  expect(proposal.method).toBe(startup ? "random" : "tpe");
  for (const { id } of problem.parameters) {
    const actual = proposal.selected[id];
    if (startup) expect(actual, id).toBe(trial.params[id]);
    else expect(Math.abs(actual - trial.params[id]), id).toBeLessThanOrEqual(1e-9);
  }
});
