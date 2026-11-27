import { defaultCmaEsPopulationSize, defaultCmaEsSigma0, fitCmaEs, proposeCmaEs } from "./model/cmaes/engine";
import type { CmaEsProposalTrace } from "./model/cmaes/types";
import { advanceHistory } from "./model/history";
import { getTwoParamObjective, twoParamObservations, twoParamProblem, twoParamDefaultSeed, twoParamTrialLimit, type TwoParamObjectivePreset, type TwoParamTrial } from "./twoParamProblem";

export type TwoParamSampler = "tpe" | "cmaes";

export interface TwoParamCmaEsSettings {
  sigma0: number;
  populationSize: number;
  x0: { x1: number; x2: number };
}

export const cmaEsSigma0Range = { min: 0.1, max: 5, step: 0.01 };
export const cmaEsPopulationSizeRange = { min: 4, max: 24, step: 1 };
export const cmaEsX0Range = { min: -5, max: 5, step: 0.5 };
export const twoParamCmaEsDefaults: TwoParamCmaEsSettings = {
  sigma0: Number(defaultCmaEsSigma0(twoParamProblem).toFixed(2)),
  populationSize: defaultCmaEsPopulationSize,
  x0: { x1: 0, x2: 0 },
};
export const optunaCmaEsPreset: TwoParamCmaEsSettings = { sigma0: 1.67, populationSize: 6, x0: { x1: 0, x2: 0 } };

export function matchesOptunaCmaEsPreset({ sigma0, populationSize, x0 }: TwoParamCmaEsSettings): boolean {
  return sigma0 === optunaCmaEsPreset.sigma0 && populationSize === optunaCmaEsPreset.populationSize
    && x0.x1 === optunaCmaEsPreset.x0.x1 && x0.x2 === optunaCmaEsPreset.x0.x2;
}

export interface TwoParamCmaEsProposal {
  method: "cmaes";
  x1: number;
  x2: number;
  trace: CmaEsProposalTrace;
}

export interface TwoParamCmaEsPlayback {
  trials: TwoParamTrial[];
  proposals: TwoParamCmaEsProposal[];
}

export const emptyTwoParamCmaEsPlayback = (): TwoParamCmaEsPlayback => ({ trials: [], proposals: [] });

export function buildTwoParamCmaEsView(
  trials: readonly TwoParamTrial[],
  settings: TwoParamCmaEsSettings = twoParamCmaEsDefaults,
  objectivePreset?: TwoParamObjectivePreset,
) {
  const objective = getTwoParamObjective(objectivePreset);
  const fitted = fitCmaEs(twoParamProblem, twoParamObservations(trials), settings);
  const { snapshot } = fitted;
  return {
    trials, fitted, snapshot,
    currentGenIds: new Set(snapshot.currentGenerationTrialIds),
    lastGenIds: new Set(snapshot.lastGenerationTrialIds),
    evaluate: (x1: number, x2: number) => ({
      x1, x2, objective: objective.evaluate(x1, x2), logDensity: fitted.logDensity([{ x1, x2 }])[0],
    }),
  };
}

export function moveTwoParamCmaEsPlayback(
  state: TwoParamCmaEsPlayback,
  next: number,
  seed = twoParamDefaultSeed,
  settings: TwoParamCmaEsSettings = twoParamCmaEsDefaults,
  objectivePreset?: TwoParamObjectivePreset,
): TwoParamCmaEsPlayback {
  const objective = getTwoParamObjective(objectivePreset);
  const { trials, proposals } = advanceHistory(state.trials, state.proposals, next, twoParamTrialLimit,
    (past): TwoParamCmaEsProposal => {
      const trace = proposeCmaEs(twoParamProblem, twoParamObservations(past), settings, seed);
      return { method: trace.method, x1: trace.selected.x1, x2: trace.selected.x2, trace };
    },
    ({ x1, x2 }, id) => ({ id, x1, x2, value: objective.evaluate(x1, x2), constraints: [], violation: 0 }));
  return { trials, proposals };
}
