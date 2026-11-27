import { fitTpe, needsFeasibleGood, proposeTpe } from "./model/tpe/engine";
import { totalViolation } from "./model/tpe/partition";
import { getTwoParamConstraint, type TwoParamConstraintPreset } from "./twoParamConstraints";
import { advanceHistory } from "./model/history";
import { createFieldEvaluator, evaluateFieldGrid2D } from "./model/tpe/visualization";
import type { DensityMode, ProposalTrace, TpeConfig } from "./model/tpe/types";
import { getTwoParamObjective, twoParamDefaultSeed, twoParamObservations, twoParamProblemForConstraint, twoParamTrialLimit, type TwoParamObjectivePreset, type TwoParamTrial } from "./twoParamProblem";

export {
  findTwoParamObjectiveMinimum, findTwoParamObjectiveOptimum, getTwoParamObjective, twoParamDefaultSeed,
  twoParamObjectivePresets, twoParamObservations, twoParamProblem, twoParamProblemForConstraint, twoParamTrialLimit,
  type TwoParamObjectivePreset, type TwoParamTrial,
} from "./twoParamProblem";
export type { DensityMode } from "./model/tpe/types";

export const twoParamSettings = { bandwidth: 0.65, gamma: 0.25, count: twoParamTrialLimit, seed: twoParamDefaultSeed, startupTrials: 10, candidates: 24 };

export type TwoParamModelSettings = Omit<TpeConfig, "mode">;
export type TwoParamSearchSettings = Partial<TwoParamModelSettings> & { objectivePreset?: TwoParamObjectivePreset; constraintPreset?: TwoParamConstraintPreset };
export const twoParamDefaultModelSettings: TwoParamModelSettings = { bandwidthRule: "constant", bandwidth: twoParamSettings.bandwidth, gamma: twoParamSettings.gamma, weights: "uniform", priorWeight: 1, startupTrials: twoParamSettings.startupTrials, candidates: twoParamSettings.candidates };

export const twoParamConfig = (mode: DensityMode = "multivariate", settings: TwoParamSearchSettings = {}): TpeConfig => {
  const { objectivePreset: _objectivePreset, constraintPreset, ...modelSettings } = settings;
  const { infeasibleFilling, ...config } = { ...twoParamDefaultModelSettings, ...modelSettings, mode };
  return constraintPreset && constraintPreset !== "none" ? { ...config, infeasibleFilling: infeasibleFilling ?? true } : config;
};

export function buildTwoParamView(trials: readonly TwoParamTrial[], mode: DensityMode = "multivariate", settings: TwoParamSearchSettings = {}) {
  const objective = getTwoParamObjective(settings.objectivePreset);
  const problem = twoParamProblemForConstraint(settings.constraintPreset);
  const observations = twoParamObservations(trials);
  const config = twoParamConfig(mode, settings);
  const enoughTrialsToFit = trials.length >= 2;
  const fitted = enoughTrialsToFit && !needsFeasibleGood(problem, observations, config) ? fitTpe(problem, observations, config) : null;
  const partition = fitted?.snapshot.partition;
  const goodIds = new Set(partition?.good.map((member) => member.trialId));
  const feasibleIds = new Set(trials.filter((trial) => trial.violation === 0).map((trial) => trial.id));
  const filledIds = new Set(partition?.kind === "constrained-single-objective" ? partition.filledTrialIds : []);
  const fields = fitted ? createFieldEvaluator(fitted, { axes: ["x1", "x2"], projection: { kind: "full" } }) : null;
  const evaluate = (x1: number, x2: number) => {
    const values = fields?.({ x1, x2 });
    return { x1, x2, objective: objective.evaluate(x1, x2), good: values?.["good-density"] ?? 0, bad: values?.["bad-density"] ?? 0, acquisition: values?.["log-ratio"] ?? 0 };
  };
  const buildVisualization = () => {
    const resolution = 30;
    const axis = Array.from({ length: resolution + 1 }, (_, i) => -5 + i * 10 / resolution);
    const gridFields = fitted ? evaluateFieldGrid2D(fitted, "x1", axis, "x2", axis) : null;
    const grid = axis.map((x1, i) => axis.map((x2, j) => {
      const values = gridFields?.[i][j];
      return { x1, x2, objective: objective.evaluate(x1, x2), good: values?.["good-density"] ?? 0, bad: values?.["bad-density"] ?? 0, acquisition: values?.["log-ratio"] ?? 0 };
    }));
    const values = grid.flat();
    const objectiveMin = Math.min(...values.map((p) => p.objective), ...trials.map((p) => p.value));
    const objectiveMax = Math.max(...values.map((p) => p.objective), ...trials.map((p) => p.value));
    const densityMax = Math.max(...values.flatMap((p) => [p.good, p.bad]));
    const acquisitionMin = Math.min(...values.map((p) => p.acquisition));
    const acquisitionMax = Math.max(...values.map((p) => p.acquisition));
    return { grid, scales: { objective: [objectiveMin, objectiveMax], good: [0, densityMax || 1], bad: [0, densityMax || 1], acquisition: [acquisitionMin, acquisitionMax === acquisitionMin ? acquisitionMin + 1 : acquisitionMax] } };
  };
  let visualization: ReturnType<typeof buildVisualization> | undefined;
  const getVisualization = () => visualization ??= buildVisualization();
  return { trials, fitted, goodIds, feasibleIds, filledIds, hasPartition: fitted !== null, hasDensities: fitted !== null, evaluate,
    get grid() { return getVisualization().grid; },
    get scales() { return getVisualization().scales; },
  };
}


export interface TwoParamCandidate { x1: number; x2: number; logRatio: number }
export interface TwoParamAxisCandidate { value: number; logRatio: number }
export interface TwoParamAxisCandidates {
  x1: TwoParamAxisCandidate[];
  x2: TwoParamAxisCandidate[];
  selectedX1Index: number;
  selectedX2Index: number;
}
export interface TwoParamProposal {
  method: "random" | "tpe";
  x1: number;
  x2: number;
  candidates: TwoParamCandidate[];
  selectedCandidateIndex: number | null;
  axisCandidates: TwoParamAxisCandidates | null;
  trace: ProposalTrace;
}
export interface TwoParamPlayback { trials: TwoParamTrial[]; proposals: TwoParamProposal[] }
export const emptyTwoParamPlayback = (): TwoParamPlayback => ({ trials: [], proposals: [] });

export function proposeTwoParamTrial(trials: readonly TwoParamTrial[], seed = twoParamSettings.seed, mode: DensityMode = "multivariate", settings: TwoParamSearchSettings = {}): TwoParamProposal {
  getTwoParamObjective(settings.objectivePreset);
  if (!Number.isInteger(seed)) throw new Error("Invalid seed.");
  const trace = proposeTpe(twoParamProblemForConstraint(settings.constraintPreset), twoParamObservations(trials), twoParamConfig(mode, settings), seed);
  return twoParamProposalFromTrace(trace);
}

export function twoParamProposalFromTrace(trace: ProposalTrace): TwoParamProposal {
  // Independent candidates belong to separate axes, never invent joint candidates.
  if (trace.method === "tpe" && trace.config.mode === "multivariate") {
    const group = trace.groups[0];
    const candidates = group.candidates.map((c) => ({ x1: c.params.x1, x2: c.params.x2, logRatio: c.score }));
    return { method: trace.method, x1: trace.selected.x1, x2: trace.selected.x2, candidates, selectedCandidateIndex: group.selectedIndex, axisCandidates: null, trace };
  }
  if (trace.method === "tpe" && trace.config.mode === "univariate") {
    const x1Group = trace.groups.find((group) => group.parameterIds[0] === "x1");
    const x2Group = trace.groups.find((group) => group.parameterIds[0] === "x2");
    const axisCandidates = x1Group && x2Group ? {
      x1: x1Group.candidates.map((c) => ({ value: c.params.x1, logRatio: c.score })),
      x2: x2Group.candidates.map((c) => ({ value: c.params.x2, logRatio: c.score })),
      selectedX1Index: x1Group.selectedIndex,
      selectedX2Index: x2Group.selectedIndex,
    } : null;
    return { method: trace.method, x1: trace.selected.x1, x2: trace.selected.x2, candidates: [], selectedCandidateIndex: null, axisCandidates, trace };
  }
  return { method: trace.method, x1: trace.selected.x1, x2: trace.selected.x2, candidates: [], selectedCandidateIndex: null, axisCandidates: null, trace };
}

export function moveTwoParamPlayback(state: TwoParamPlayback, next: number, seed = twoParamSettings.seed, mode: DensityMode = "multivariate", settings: TwoParamSearchSettings = {}): TwoParamPlayback {
  const objective = getTwoParamObjective(settings.objectivePreset);
  const constraint = getTwoParamConstraint(settings.constraintPreset);
  const { trials, proposals } = advanceHistory(state.trials, state.proposals, next, twoParamSettings.count,
    (past) => proposeTwoParamTrial(past, seed, mode, settings),
    ({ x1, x2 }, id) => {
      const constraints = constraint.constraints.map((evaluate) => evaluate(x1, x2));
      return { id, x1, x2, value: objective.evaluate(x1, x2), constraints, violation: totalViolation(constraints) };
    });
  return { trials, proposals };
}
