import { fitTpe, needsFeasibleGood, proposeTpe } from "./model/engine";
import { totalViolation } from "./model/partition";
import { twoParamConstrainedOptima, getTwoParamConstraint, type TwoParamConstraintPreset } from "./twoParamConstraints";
import { advanceHistory } from "./model/history";
import { createFieldEvaluator, evaluateFieldGrid2D } from "./model/visualization";
import type { DensityMode, Observation, Problem, ProposalTrace, TpeConfig } from "./model/types";
export type { DensityMode } from "./model/types";

export interface TwoParamTrial { id: number; x1: number; x2: number; value: number; constraints: number[]; violation: number }
export const twoParamSettings = { bandwidth: 0.65, gamma: 0.25, count: 200, seed: 42, startupTrials: 10, candidates: 24 };

function twoParamObjective(x1: number, x2: number): number {
  return 0.12 * (x1 - 0.7) ** 2 + 0.18 * (x2 + 0.5) ** 2 + Math.sin(1.4 * x1) * Math.cos(1.1 * x2) + 1.2;
}

export const twoParamObjectivePresets = {
  multimodal: { label: "Multimodal", description: "Multiple local minima with interacting coordinates.", formula: String.raw`\begin{aligned}f(x_1,x_2)={}&0.12(x_1-0.7)^2+0.18(x_2+0.5)^2\\&+\sin(1.4x_1)\cos(1.1x_2)+1.2\end{aligned}`, evaluate: twoParamObjective },
  quadratic: { label: "Quadratic", description: "An axis-aligned bowl with one minimum at (1.5, −1).", formula: String.raw`f(x_1,x_2)=0.12(x_1-1.5)^2+0.18(x_2+1)^2`, evaluate: (x1: number, x2: number) => 0.12 * (x1 - 1.5) ** 2 + 0.18 * (x2 + 1) ** 2 },
  rosenbrock: { label: "Rosenbrock", description: "A curved valley coupling both coordinates, with a minimum at (1, 1).", formula: String.raw`f(x_1,x_2)=\frac{(1-x_1)^2+100(x_2-x_1^2)^2}{1000}`, evaluate: (x1: number, x2: number) => ((1 - x1) ** 2 + 100 * (x2 - x1 ** 2) ** 2) / 1000 },
} as const;
export type TwoParamObjectivePreset = keyof typeof twoParamObjectivePresets;
export function getTwoParamObjective(preset: TwoParamObjectivePreset = "multimodal") {
  if (!Object.prototype.hasOwnProperty.call(twoParamObjectivePresets, preset)) throw new Error("Unknown two-parameter objective preset.");
  return twoParamObjectivePresets[preset];
}

// Deterministic global grid followed by local refinement for the multimodal reference.
export function findTwoParamObjectiveOptimum(preset: TwoParamObjectivePreset, constraintPreset: TwoParamConstraintPreset = "none"): { x1: number; x2: number; value: number } {
  getTwoParamObjective(preset);
  if (constraintPreset !== "none") return { ...twoParamConstrainedOptima[constraintPreset][preset] };
  if (preset === "quadratic") return { x1: 1.5, x2: -1, value: 0 };
  if (preset === "rosenbrock") return { x1: 1, x2: 1, value: 0 };
  const evaluate = getTwoParamObjective(preset).evaluate;
  let best = { x: 0, y: 0, value: Infinity };
  for (let i = 0; i <= 100; i++) for (let j = 0; j <= 100; j++) {
    const x = -5 + i / 10, y = -5 + j / 10;
    const value = evaluate(x, y);
    if (value < best.value) best = { x, y, value };
  }
  for (let step = 0.1; step > 1e-10; step /= 2) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const x = Math.max(-5, Math.min(5, best.x + dx * step));
        const y = Math.max(-5, Math.min(5, best.y + dy * step));
        const value = evaluate(x, y);
        if (value < best.value) { best = { x, y, value }; improved = true; }
      }
    }
  }
  return { x1: best.x, x2: best.y, value: best.value };
}

export function findTwoParamObjectiveMinimum(preset: TwoParamObjectivePreset, constraintPreset?: TwoParamConstraintPreset): number {
  return findTwoParamObjectiveOptimum(preset, constraintPreset).value;
}

export const twoParamProblem: Problem = { id: "two-param", parameters: [{ id: "x1", low: -5, high: 5 }, { id: "x2", low: -5, high: 5 }], directions: ["minimize"], constraintCount: 0 };
function twoParamProblemForConstraint(preset: TwoParamConstraintPreset = "none"): Problem {
  return preset === "none" ? twoParamProblem : { ...twoParamProblem, id: `two-param-${preset}`, constraintCount: getTwoParamConstraint(preset).constraints.length };
}
export const twoParamObservations = (trials: readonly TwoParamTrial[]): Observation[] => trials.map((t) => ({ id: t.id, params: { x1: t.x1, x2: t.x2 }, objectives: [t.value], constraints: t.constraints }));
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


interface TwoParamCandidate { x1: number; x2: number; logRatio: number }
interface TwoParamProposal { method: "random" | "tpe"; x1: number; x2: number; candidates: TwoParamCandidate[]; trace: ProposalTrace }
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
  const candidates = trace.method === "tpe" && trace.config.mode === "multivariate" ? trace.groups[0].candidates.map((c) => ({ x1: c.params.x1, x2: c.params.x2, logRatio: c.score })) : [];
  return { method: trace.method, x1: trace.selected.x1, x2: trace.selected.x2, candidates, trace };
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
