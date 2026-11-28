import { fitGp, proposeGp } from "./model/gp/engine";
import type { FittedGpModel, GpPrediction, GpProposalTrace } from "./model/gp/types";
import { advanceHistory } from "./model/history";
import { oneParamObservations, oneParamProblem, trialLimit, type Trial } from "./oneParamProblem";
import { getObjective, type ObjectivePreset } from "./objectives";
import type { GpSettings } from "./gpSettings";

export interface OneParamGpProposal {
  method: GpProposalTrace["method"];
  x: number;
  trace: GpProposalTrace;
}

export interface OneParamGpPlayback {
  step: number;
  trials: Trial[];
  proposals: OneParamGpProposal[];
}

export const emptyOneParamGpPlayback = (): OneParamGpPlayback => ({ step: 0, trials: [], proposals: [] });

export function proposeOneParamGp(trials: readonly Trial[], seed: number, settings: GpSettings, objectivePreset: ObjectivePreset, fitted?: FittedGpModel | null): OneParamGpProposal {
  const trace = fitted && trials.length >= settings.startupTrials
    ? fitted.propose(seed)
    : proposeGp({ ...oneParamProblem, id: objectivePreset }, oneParamObservations(trials), settings, seed);
  return { method: trace.method, x: trace.selected.x, trace };
}

export function moveOneParamGpPlayback(state: OneParamGpPlayback, next: number, seed: number, settings: GpSettings, objectivePreset: ObjectivePreset): OneParamGpPlayback {
  const { evaluate } = getObjective(objectivePreset);
  return advanceHistory(state.trials, state.proposals, next, trialLimit,
    (past) => proposeOneParamGp(past, seed, settings, objectivePreset),
    (proposal, id) => ({ id, x: proposal.x, y: evaluate(proposal.x) }));
}

export function keepOneParamGpObservations(state: OneParamGpPlayback): OneParamGpPlayback {
  return { step: state.step, trials: state.trials.slice(0, state.step), proposals: state.proposals.slice(0, state.step) };
}

interface OneParamGpView {
  trials: readonly Trial[];
  fitted: FittedGpModel | null;
  resolvedLengthScale: number;
  mean: number[];
  std: number[];
  acquisition: number[];
  sampleGrid: number[];
  posteriorSamples: number[][];
  evaluate: ((x: number) => GpPrediction) | null;
}

export function buildOneParamGpView(trials: readonly Trial[], grid: readonly number[], settings: GpSettings, objectivePreset: ObjectivePreset, sampleSeed = 7): OneParamGpView {
  if (trials.length === 0) {
    return { trials, fitted: null, resolvedLengthScale: settings.lengthScale, mean: [], std: [], acquisition: [], sampleGrid: [], posteriorSamples: [], evaluate: null };
  }
  const fitted = fitGp({ ...oneParamProblem, id: objectivePreset }, oneParamObservations(trials), settings);
  const predictions = fitted.predict(grid.map((x) => ({ x })));
  const sampleGrid = grid.filter((_, i) => i % 5 === 0);
  return {
    trials, fitted,
    resolvedLengthScale: fitted.snapshot.resolvedLengthScale,
    mean: predictions.map(({ mean }) => mean),
    std: predictions.map(({ std }) => std),
    acquisition: predictions.map(({ acquisition }) => acquisition),
    sampleGrid,
    posteriorSamples: fitted.samplePosterior(sampleGrid.map((x) => ({ x })), 4, sampleSeed),
    evaluate: (x) => fitted.predict([{ x }])[0],
  };
}
