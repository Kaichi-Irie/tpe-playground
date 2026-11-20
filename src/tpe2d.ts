import { createDensity, createLogDensity } from "./model/density";
import { fitTpe, needsFeasibleGood, proposeTpe } from "./model/engine";
import { totalViolation } from "./model/partition";
import { constrainedOptima2D, getConstraint2D, type ConstraintPreset2D } from "./constraints2D";
import { advanceHistory } from "./model/history";
import { createFieldEvaluator, evaluateFieldGrid2D } from "./model/visualization";
import type { DensityMode, Observation, Problem, ProposalTrace, TpeConfig } from "./model/types";
export type { DensityMode } from "./model/types";

export interface Trial2D { id: number; x1: number; x2: number; value: number; constraints: number[]; violation: number }
export const settings2D = { bandwidth: 0.65, gamma: 0.25, count: 200, seed: 42, startupTrials: 10, candidates: 24 };

export function objective2D(x1: number, x2: number): number {
  return 0.12 * (x1 - 0.7) ** 2 + 0.18 * (x2 + 0.5) ** 2 + Math.sin(1.4 * x1) * Math.cos(1.1 * x2) + 1.2;
}

export const objectivePresets2D = {
  multimodal: { label: "Multimodal", description: "Multiple local minima with interacting coordinates.", formula: "f(x₁, x₂) = 0.12(x₁ − 0.7)² + 0.18(x₂ + 0.5)² + sin(1.4x₁) cos(1.1x₂) + 1.2", evaluate: objective2D },
  quadratic: { label: "Quadratic", description: "An axis-aligned bowl with one minimum at (1.5, −1).", formula: "f(x₁, x₂) = 0.12(x₁ − 1.5)² + 0.18(x₂ + 1)²", evaluate: (x1: number, x2: number) => 0.12 * (x1 - 1.5) ** 2 + 0.18 * (x2 + 1) ** 2 },
  rosenbrock: { label: "Rosenbrock", description: "A curved valley coupling both coordinates, with a minimum at (1, 1).", formula: "f(x₁, x₂) = [(1 − x₁)² + 100(x₂ − x₁²)²] / 1000", evaluate: (x1: number, x2: number) => ((1 - x1) ** 2 + 100 * (x2 - x1 ** 2) ** 2) / 1000 },
} as const;
export type ObjectivePreset2D = keyof typeof objectivePresets2D;
export function getObjective2D(preset: ObjectivePreset2D = "multimodal") {
  if (!Object.prototype.hasOwnProperty.call(objectivePresets2D, preset)) throw new Error("Unknown 2D objective preset.");
  return objectivePresets2D[preset];
}

// Deterministic global grid followed by local refinement for the multimodal reference.
export function findObjectiveOptimum2D(preset: ObjectivePreset2D, constraintPreset: ConstraintPreset2D = "none"): { x1: number; x2: number; value: number } {
  getObjective2D(preset);
  if (constraintPreset !== "none") return { ...constrainedOptima2D[constraintPreset][preset] };
  if (preset === "quadratic") return { x1: 1.5, x2: -1, value: 0 };
  if (preset === "rosenbrock") return { x1: 1, x2: 1, value: 0 };
  const evaluate = getObjective2D(preset).evaluate;
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

export function findObjectiveMinimum2D(preset: ObjectivePreset2D, constraintPreset?: ConstraintPreset2D): number {
  return findObjectiveOptimum2D(preset, constraintPreset).value;
}

export function generateTrials2D(seed = settings2D.seed, count = settings2D.count): Trial2D[] {
  if (!Number.isInteger(seed) || !Number.isInteger(count) || count < 2 || count > 10000) throw new Error("Invalid seed or observation count.");
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return (state + 0.5) / 2 ** 32; };
  return Array.from({ length: count }, (_, i) => {
    const x1 = random() * 10 - 5, x2 = random() * 10 - 5;
    return { id: i + 1, x1, x2, value: objective2D(x1, x2), constraints: [], violation: 0 };
  });
}

export const problem2D: Problem = { id: "2d", parameters: [{ id: "x1", low: -5, high: 5 }, { id: "x2", low: -5, high: 5 }], directions: ["minimize"], constraintCount: 0 };
function problemForConstraint2D(preset: ConstraintPreset2D = "none"): Problem {
  return preset === "none" ? problem2D : { ...problem2D, id: `2d-${preset}`, constraintCount: getConstraint2D(preset).constraints.length };
}
export const observations2D = (trials: readonly Trial2D[]): Observation[] => trials.map((t) => ({ id: t.id, params: { x1: t.x1, x2: t.x2 }, objectives: [t.value], constraints: t.constraints }));
export type ModelSettings2D = Omit<TpeConfig, "mode">;
export type SearchSettings2D = Partial<ModelSettings2D> & { objectivePreset?: ObjectivePreset2D; constraintPreset?: ConstraintPreset2D };
export const defaultModelSettings2D: ModelSettings2D = { bandwidthRule: "constant", bandwidth: settings2D.bandwidth, gamma: settings2D.gamma, weights: "uniform", priorWeight: 0, startupTrials: settings2D.startupTrials, candidates: settings2D.candidates };
export const config2D = (mode: DensityMode = "multivariate", settings: SearchSettings2D = {}): TpeConfig => {
  const { objectivePreset: _objectivePreset, constraintPreset, ...modelSettings } = settings;
  const { infeasibleFilling, ...config } = { ...defaultModelSettings2D, ...modelSettings, mode };
  return constraintPreset && constraintPreset !== "none" ? { ...config, infeasibleFilling: infeasibleFilling ?? true } : config;
};

export function createJointKDE(samples: readonly Trial2D[], bandwidth: number) {
  const density = createDensity(problem2D.parameters, observations2D(samples), bandwidth, samples.map(() => 1));
  const evaluate = createLogDensity(density);
  return { logDensity: (x1: number, x2: number) => evaluate({ x1, x2 }), density: (x1: number, x2: number) => Math.exp(evaluate({ x1, x2 })) };
}

export function buildDemo2D(trials: readonly Trial2D[] = generateTrials2D(), mode: DensityMode = "multivariate", settings: SearchSettings2D = {}) {
  const objective = getObjective2D(settings.objectivePreset);
  const problem = problemForConstraint2D(settings.constraintPreset);
  const observations = observations2D(trials);
  const config = config2D(mode, settings);
  const hasPartition = trials.length >= 2;
  const fitted = hasPartition && !needsFeasibleGood(problem, observations, config) ? fitTpe(problem, observations, config) : null;
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
  return { trials, fitted, goodIds, feasibleIds, filledIds, hasPartition, hasDensities: fitted !== null, evaluate,
    get grid() { return getVisualization().grid; },
    get scales() { return getVisualization().scales; },
  };
}


export interface Candidate2D { x1: number; x2: number; logRatio: number }
export interface Proposal2D { method: "random" | "tpe"; x1: number; x2: number; candidates: Candidate2D[]; trace: ProposalTrace }
export interface Playback2D { trials: Trial2D[]; proposals: Proposal2D[] }
export const emptyPlayback2D = (): Playback2D => ({ trials: [], proposals: [] });

export function proposeTrial2D(trials: readonly Trial2D[], seed = settings2D.seed, mode: DensityMode = "multivariate", settings: SearchSettings2D = {}): Proposal2D {
  getObjective2D(settings.objectivePreset);
  if (!Number.isInteger(seed)) throw new Error("Invalid seed.");
  const trace = proposeTpe(problemForConstraint2D(settings.constraintPreset), observations2D(trials), config2D(mode, settings), seed);
  return proposal2DFromTrace(trace);
}

export function proposal2DFromTrace(trace: ProposalTrace): Proposal2D {
  // Independent candidates belong to separate axes, never invent joint candidates.
  const candidates = trace.method === "tpe" && trace.config.mode === "multivariate" ? trace.groups[0].candidates.map((c) => ({ x1: c.params.x1, x2: c.params.x2, logRatio: c.score })) : [];
  return { method: trace.method, x1: trace.selected.x1, x2: trace.selected.x2, candidates, trace };
}

export function movePlayback2D(state: Playback2D, next: number, seed = settings2D.seed, mode: DensityMode = "multivariate", settings: SearchSettings2D = {}): Playback2D {
  const objective = getObjective2D(settings.objectivePreset);
  const constraint = getConstraint2D(settings.constraintPreset);
  const { trials, proposals } = advanceHistory(state.trials, state.proposals, next, settings2D.count,
    (past) => proposeTrial2D(past, seed, mode, settings),
    ({ x1, x2 }, id) => {
      const constraints = constraint.constraints.map((evaluate) => evaluate(x1, x2));
      return { id, x1, x2, value: objective.evaluate(x1, x2), constraints, violation: totalViolation(constraints) };
    });
  return { trials, proposals };
}
