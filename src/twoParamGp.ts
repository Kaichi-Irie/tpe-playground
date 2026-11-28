import { gpDefaults, type GpSettings } from "./gpSettings";
import { fitGp, proposeGp } from "./model/gp/engine";
import type { FittedGpModel, GpPrediction, GpProposalTrace } from "./model/gp/types";
import { advanceHistory } from "./model/history";
import { getTwoParamObjective, twoParamDefaultSeed, twoParamObservations, twoParamProblem, twoParamTrialLimit, type TwoParamObjectivePreset, type TwoParamTrial } from "./twoParamProblem";

export interface TwoParamGpProposal {
  method: GpProposalTrace["method"];
  x1: number;
  x2: number;
  trace: GpProposalTrace;
}

export interface TwoParamGpPlayback {
  step: number;
  trials: TwoParamTrial[];
  proposals: TwoParamGpProposal[];
}

export const emptyTwoParamGpPlayback = (): TwoParamGpPlayback => ({ step: 0, trials: [], proposals: [] });

export function proposeTwoParamGp(
  trials: readonly TwoParamTrial[],
  seed = twoParamDefaultSeed,
  settings = gpDefaults,
  fitted?: FittedGpModel | null,
): TwoParamGpProposal {
  const trace = fitted && trials.length >= settings.startupTrials
    ? fitted.propose(seed)
    : proposeGp(twoParamProblem, twoParamObservations(trials), settings, seed);
  return { method: trace.method, x1: trace.selected.x1, x2: trace.selected.x2, trace };
}

export function moveTwoParamGpPlayback(
  state: TwoParamGpPlayback,
  next: number,
  seed = twoParamDefaultSeed,
  settings = gpDefaults,
  objectivePreset?: TwoParamObjectivePreset,
): TwoParamGpPlayback {
  const { evaluate } = getTwoParamObjective(objectivePreset);
  return advanceHistory(state.trials, state.proposals, next, twoParamTrialLimit,
    (past) => proposeTwoParamGp(past, seed, settings),
    ({ x1, x2 }, id) => ({ id, x1, x2, value: evaluate(x1, x2), constraints: [], violation: 0 }));
}

type GridPoint = GpPrediction & { x1: number; x2: number; objective: number };
type Scale = readonly [number, number];

export function buildTwoParamGpView(
  trials: readonly TwoParamTrial[],
  settings: GpSettings,
  objectivePreset?: TwoParamObjectivePreset,
) {
  const objective = getTwoParamObjective(objectivePreset);
  const fitted = trials.length > 0 ? fitGp(twoParamProblem, twoParamObservations(trials), settings) : null;
  const evaluate = (x1: number, x2: number): GridPoint => ({
    x1, x2, objective: objective.evaluate(x1, x2),
    ...(fitted?.predict([{ x1, x2 }])[0] ?? { mean: 0, std: 0, acquisition: 0 }),
  });
  let visualization: { grid: GridPoint[][]; scales: Record<"mean" | "uncertainty" | "acquisition", Scale> } | undefined;
  function getVisualization() {
    if (visualization) return visualization;
    const resolution = 24;
    const axes = twoParamProblem.parameters.map(({ low, high }) =>
      Array.from({ length: resolution + 1 }, (_, i) => low + (high - low) * i / resolution));
    const grid = fitted ? axes[0].map((x1) => axes[1].map((x2) => evaluate(x1, x2))) : [];
    const points = grid.flat();
    const range = (field: keyof GpPrediction): Scale => {
      if (!points.length) return [0, 1];
      const values = points.map((point) => point[field]);
      const low = Math.min(...values), high = Math.max(...values);
      return [low, high === low ? low + 1 : high];
    };
    visualization = { grid, scales: { mean: range("mean"), uncertainty: range("std"), acquisition: range("acquisition") } };
    return visualization;
  }
  return {
    trials, fitted, hasModel: fitted !== null, evaluate,
    resolvedLengthScale: fitted?.snapshot.resolvedLengthScale ?? settings.lengthScale,
    get grid() { return getVisualization().grid; },
    get scales() { return getVisualization().scales; },
  };
}
