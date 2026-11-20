import { resolveBandwidth, validateBandwidthRule } from "./bandwidth";
import { createDensity, logDensity, sampleDensity } from "./density";
import { partitionConstrainedSingleObjective, partitionSingleObjective, totalViolation } from "./partition";
import type { Evaluation, GroupModel, GroupTrace, ModelSnapshot, Observation, Point, Problem, ProposalTrace, TpeConfig } from "./types";

export function freezeData<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeData);
    Object.freeze(value);
  }
  return value;
}

// Cache/provenance key, not a security hash. Includes values, not just trial IDs.
export function dataKey(value: unknown): string {
  const text = JSON.stringify(value);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}

export function validateInput(problem: Problem, trials: readonly Observation[], config: TpeConfig): void {
  const { bandwidth, gamma, weights, priorWeight, startupTrials, candidates, mode } = config;
  if (!["univariate", "multivariate"].includes(mode) || !["uniform", "recency", "ei"].includes(weights) || !Number.isFinite(bandwidth) || bandwidth <= 0 || !Number.isFinite(gamma) || gamma <= 0 || gamma >= 1 || !Number.isFinite(priorWeight) || priorWeight < 0 || !Number.isInteger(startupTrials) || startupTrials < 2 || startupTrials > 10000 || !Number.isInteger(candidates) || candidates < 1 || candidates > 10000) throw new Error("Invalid TPE configuration.");
  validateBandwidthRule(config.bandwidthRule ?? "constant");
  if (problem.directions.length !== 1 || !["minimize", "maximize"].includes(problem.directions[0])) throw new Error("Only single-objective partitioning is currently supported.");
  if (!Number.isInteger(problem.constraintCount) || problem.constraintCount < 0) throw new Error("Invalid constraint count.");
  if (problem.constraintCount > 0 && weights === "ei") throw new Error("EI weights are unavailable with constraints.");
  if (!problem.parameters.length || new Set(problem.parameters.map((p) => p.id)).size !== problem.parameters.length || problem.parameters.some((p) => !p.id || !Number.isFinite(p.low) || !Number.isFinite(p.high) || p.low >= p.high || !Number.isFinite(p.high - p.low))) throw new Error("Invalid search space.");
  if (new Set(trials.map((t) => t.id)).size !== trials.length || trials.some((t) => !Number.isInteger(t.id) || t.id < 0 || t.objectives.length !== 1 || !Number.isFinite(t.objectives[0]) || t.constraints.length !== problem.constraintCount || !Array.from(t.constraints).every(Number.isFinite) || !Number.isFinite(totalViolation(t.constraints)) || Object.keys(t.params).length !== problem.parameters.length || problem.parameters.some((p) => !Number.isFinite(t.params[p.id]) || t.params[p.id] < p.low || t.params[p.id] > p.high))) throw new Error("Invalid observations.");
}

export function createRandom(seed: number, trialCount: number) {
  if (!Number.isFinite(seed)) throw new Error("Invalid seed.");
  let state = (seed ^ Math.imul(trialCount + 1, 2654435761)) >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x21f0aaad);
  state = Math.imul(state ^ (state >>> 15), 0x735a2d97);
  state = (state ^ (state >>> 15)) >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return (state + 0.5) / 2 ** 32; };
}

export function evaluateGroup(group: GroupModel, point: Point): Evaluation {
  const logL = logDensity(group.good, point), logG = logDensity(group.bad, point);
  return { logL, logG, score: logL - logG };
}

export function restoreModel(input: ModelSnapshot) {
  // Clone so a caller cannot mutate the data behind evaluation closures.
  return modelRuntime(freezeData(structuredClone(input)));
}

function modelRuntime(snapshot: ModelSnapshot) {
  return {
    snapshot,
    evaluate(points: readonly Point[]): Evaluation[] {
      return points.map((point) => {
        const values = snapshot.groups.map((g) => evaluateGroup(g, point));
        const logL = values.reduce((sum, v) => sum + v.logL, 0);
        const logG = values.reduce((sum, v) => sum + v.logG, 0);
        return { logL, logG, score: logL - logG };
      });
    },
    propose(seed: number): ProposalTrace {
      const random = createRandom(seed, snapshot.inputTrialIds.length);
      const selected: Record<string, number> = {};
      const groups: GroupTrace[] = snapshot.groups.map((group) => {
        const candidates = Array.from({ length: snapshot.config.candidates }, () => {
          const params = sampleDensity(group.good, random);
          return { params, ...evaluateGroup(group, params) };
        });
        const selectedIndex = candidates.reduce((best, c, i) => c.score > candidates[best].score ? i : best, 0);
        Object.assign(selected, candidates[selectedIndex].params);
        return { groupId: group.id, parameterIds: group.parameterIds, candidates, selectedIndex };
      });
      return freezeData({ version: 2, method: "tpe", modelId: snapshot.id, seed, config: snapshot.config, problem: snapshot.problem, historyKey: snapshot.historyKey, inputTrialIds: snapshot.inputTrialIds, groups, selected });
    },
  };
}
export type FittedTpeModel = ReturnType<typeof restoreModel>;

export function fitTpe(problem: Problem, trials: readonly Observation[], config: TpeConfig): FittedTpeModel {
  validateInput(problem, trials, config);
  return fitValidatedTpe(problem, trials, config);
}

function fitValidatedTpe(problem: Problem, trials: readonly Observation[], config: TpeConfig): FittedTpeModel {
  const direction = problem.directions[0];
  const partition = problem.constraintCount
    ? partitionConstrainedSingleObjective(trials, config.gamma, config.weights, direction, config.infeasibleFilling)
    : partitionSingleObjective(trials, config.gamma, config.weights, direction);
  if (!partition.good.length && config.priorWeight === 0) throw new Error("A Good density needs a feasible observation or a prior.");
  const byId = new Map(trials.map((t) => [t.id, t]));
  const parameterGroups = config.mode === "univariate" ? problem.parameters.map((p) => [p]) : [problem.parameters];
  const groups = parameterGroups.map((parameters, i): GroupModel => {
    const density = (members: typeof partition.good) => {
      const samples = members.map((m) => byId.get(m.trialId)!);
      // Apply the existing 1D rules per coordinate; joint kernels keep paired centers.
      const widths = Object.fromEntries(parameters.map((parameter) => [parameter.id,
        resolveBandwidth(samples.map((sample) => sample.params[parameter.id]), config.bandwidthRule ?? "constant", config.bandwidth, parameter.high - parameter.low, config.priorWeight > 0),
      ]));
      const result = createDensity(parameters, samples, config.bandwidth, members.map((m) => m.weight), config.priorWeight);
      return { ...result, kernels: result.kernels.map((kernel) => kernel.source.kind === "observation" ? { ...kernel, bandwidths: widths } : kernel) };
    };
    return { id: `group-${i}`, parameterIds: parameters.map((p) => p.id), good: density(partition.good), bad: density(partition.bad) };
  });
  const historyKey = dataKey(trials.map((t) => [t.id, problem.parameters.map((p) => t.params[p.id]), t.objectives, t.constraints]));
  return modelRuntime(freezeData({ version: 2, id: dataKey([problem, config, historyKey]), historyKey, problem: structuredClone(problem), config: { ...config }, inputTrialIds: trials.map((t) => t.id), partition, groups }));
}

export function proposeTpe(problem: Problem, trials: readonly Observation[], config: TpeConfig, seed: number): ProposalTrace {
  validateInput(problem, trials, config);
  const startup = trials.length < config.startupTrials;
  if (!startup && !needsFeasibleGood(problem, trials, config)) return fitValidatedTpe(problem, trials, config).propose(seed);
  const random = createRandom(seed, trials.length);
  return freezeData({ version: 2, method: "random", reason: startup ? "startup" : "no-feasible-good", seed, problem: structuredClone(problem), config: { ...config }, inputTrialIds: trials.map((t) => t.id), historyKey: dataKey(trials.map((t) => [t.id, problem.parameters.map((p) => t.params[p.id]), t.objectives, t.constraints])), selected: Object.fromEntries(problem.parameters.map((p) => [p.id, p.low + random() * (p.high - p.low)])) });
}

export function needsFeasibleGood(problem: Problem, trials: readonly Observation[], config: TpeConfig): boolean {
  return problem.constraintCount > 0 && config.infeasibleFilling === false && config.priorWeight === 0
    && !trials.some((trial) => trial.constraints.every((value) => value <= 0));
}
