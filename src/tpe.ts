import { validateBandwidthRule, type BandwidthRule } from "./model/bandwidth";
import { createDensity, createLogDensity } from "./model/density";
import { fitTpe, proposeTpe } from "./model/engine";
import { rankSplit, weightsFor } from "./model/partition";
import { evaluateField } from "./model/visualization";
import type { Observation, Problem, ProposalTrace, TpeConfig } from "./model/types";
import { getObjective, objective, type ObjectivePreset } from "./objectives";
export { objective } from "./objectives";

export interface Trial { id: number; x: number; y: number }
export interface DensityConfig { bandwidth: number; weights: readonly number[] }
export const trialLimit = 200;
export const domain = [-5, 5] as const;
export type WeightStrategy = "uniform" | "recency" | "ei";
export interface ModelConfig { bandwidthRule?: BandwidthRule; bandwidth: number; gamma: number; weights?: WeightStrategy }
export const defaults = { bandwidthRule: "constant" as BandwidthRule, bandwidth: 0.4, gamma: 0.2, weights: "uniform" as WeightStrategy };
export const prior = { mean: 0, bandwidth: domain[1] - domain[0], weight: 1 };
export interface SearchConfig extends ModelConfig { startupTrials?: number; candidates?: number; objectivePreset?: ObjectivePreset }
export const searchDefaults = { startupTrials: 10, candidates: 24 };

export interface Candidate { x: number; logRatio: number }
export interface Proposal { method: "random" | "tpe"; x: number; candidates: Candidate[]; trace: ProposalTrace }

// Normalize to one observation per sample on average, preserving the prior's scale.
export function observationWeights(samples: readonly Trial[], strategy: WeightStrategy = "uniform", threshold?: number): number[] {
  return weightsFor(samples, (trial) => trial.y, strategy, threshold);
}

function validateModelConfig({ gamma, bandwidth, weights = "uniform", bandwidthRule = "constant" }: ModelConfig): void {
  if (!Number.isFinite(gamma) || gamma <= 0 || gamma >= 1 || !Number.isFinite(bandwidth) || bandwidth <= 0) {
    throw new Error("Need 0 < gamma < 1 and a positive finite bandwidth.");
  }
  validateBandwidthRule(bandwidthRule);
  if (!["uniform", "recency", "ei"].includes(weights)) throw new Error("Unknown weight strategy.");
}

export function splitModel(trials: readonly Trial[], config: ModelConfig = defaults) {
  validateModelConfig(config);
  const split = splitTrials(trials, config.gamma);
  return {
    ...split,
    goodWeights: observationWeights(split.good, config.weights, split.threshold),
    badWeights: observationWeights(split.bad, config.weights === "ei" ? "uniform" : config.weights, split.threshold),
  };
}

function validatePriorWeight(weight: number): void {
  if (!Number.isFinite(weight) || weight < 0) throw new Error("Prior weight must be finite and nonnegative.");
}

export function createModelDensity(samples: readonly Trial[], priorWeight = 0, bandwidth = defaults.bandwidth, weights: readonly number[] = samples.map(() => 1)): (x: number) => number {
  const model = createDensity(problem1D.parameters, samples.map((t) => ({ id: t.id, params: { x: t.x } })), bandwidth, weights, priorWeight);
  const evaluate = createLogDensity(model);
  return (x) => Math.exp(evaluate({ x }));
}

export const problem1D: Problem = { id: "multimodal", parameters: [{ id: "x", low: -5, high: 5 }], directions: ["minimize"], constraintCount: 0 };
export const observations1D = (trials: readonly Trial[]): Observation[] => trials.map((t) => ({ id: t.id, params: { x: t.x }, objectives: [t.y], constraints: [] }));
export const config1D = (config: SearchConfig, priorWeight: number): TpeConfig => ({ mode: "univariate", bandwidth: config.bandwidth, bandwidthRule: config.bandwidthRule ?? "constant", gamma: config.gamma, weights: config.weights ?? "uniform", priorWeight, startupTrials: config.startupTrials ?? searchDefaults.startupTrials, candidates: config.candidates ?? searchDefaults.candidates });

export function fitModel1D(trials: readonly Trial[], priorWeight = 0, config: SearchConfig = defaults) {
  return fitTpe({ ...problem1D, id: config.objectivePreset ?? "multimodal" }, observations1D(trials), config1D(config, priorWeight));
}

export function createAcquisition(trials: readonly Trial[], priorWeight = 0, config: ModelConfig = defaults): (x: number) => number {
  const model = fitModel1D(trials, priorWeight, config);
  return (x) => model.evaluate([{ x }])[0].score;
}

// Visualization adapter: all fields and memberships come from one fitted model.
export function buildView1D(trials: readonly Trial[], grid: readonly number[], priorWeight: number, config: SearchConfig) {
  if (trials.length < 2) return { trials, fitted: null, good: [] as Trial[], bad: [] as Trial[], threshold: null, goodWeights: [], badWeights: [], acquisition: [], goodDensity: grid.map(() => 0), badDensity: grid.map(() => 0) };
  const fitted = fitModel1D(trials, priorWeight, config);
  const partition = fitted.snapshot.partition;
  if (partition.kind !== "single-objective") throw new Error("Play 1D requires an unconstrained partition.");
  const byId = new Map(trials.map((t) => [t.id, t]));
  const field = (field: "good-density" | "bad-density" | "log-ratio") => evaluateField(fitted, { field, axes: ["x"], points: grid.map((x) => ({ x })), projection: { kind: "full" } }).values;
  return { trials, fitted, good: partition.good.map((m) => byId.get(m.trialId)!), bad: partition.bad.map((m) => byId.get(m.trialId)!), threshold: partition.threshold, goodWeights: partition.good.map((m) => m.weight), badWeights: partition.bad.map((m) => m.weight), acquisition: field("log-ratio"), goodDensity: field("good-density"), badDensity: field("bad-density") };
}

function validateSearchConfig(config: SearchConfig): void {
  getObjective(config.objectivePreset);
  const { startupTrials = searchDefaults.startupTrials, candidates = searchDefaults.candidates } = config;
  if (!Number.isInteger(startupTrials) || startupTrials < 2 || startupTrials > 10000 ||
      !Number.isInteger(candidates) || candidates < 1 || candidates > 10000) {
    throw new Error("Need 2–10000 startup trials and 1–10000 candidates, both integers.");
  }
}

export function proposeTrial(trials: readonly Trial[], seed: number, priorWeight = 0, config: SearchConfig = defaults): Proposal {
  validateSearchConfig(config);
  const trace = proposeTpe({ ...problem1D, id: config.objectivePreset ?? "multimodal" }, observations1D(trials), config1D(config, priorWeight), seed);
  return proposal1DFromTrace(trace);
}

export function proposal1DFromTrace(trace: ProposalTrace): Proposal {
  const candidates = trace.method === "tpe" ? trace.groups[0].candidates.map((c) => ({ x: c.params.x, logRatio: c.score })) : [];
  return { method: trace.method, x: trace.selected.x, candidates, trace };
}

export function runSearch(seed: number, count = trialLimit, priorWeight = 0, config: SearchConfig = defaults): { trials: Trial[]; proposals: Proposal[] } {
  validatePriorWeight(priorWeight);
  validateModelConfig(config);
  validateSearchConfig(config);
  if (!Number.isFinite(seed) || !Number.isInteger(count) || count < 0 || count > 10000) {
    throw new Error("Invalid seed or trial count (0–10000).");
  }
  const trials: Trial[] = [], proposals: Proposal[] = [];
  for (let i = 0; i < count; i++) {
    const proposal = proposeTrial(trials, seed, priorWeight, config);
    proposals.push(proposal);
    trials.push({ id: i + 1, x: proposal.x, y: getObjective(config.objectivePreset).evaluate(proposal.x) });
  }
  return { trials, proposals };
}

export function generateTrials(seed: number, count = 50): Trial[] {
  let state = seed >>> 0;
  return Array.from({ length: count }, (_, i) => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    const x = domain[0] + (state / 2 ** 32) * (domain[1] - domain[0]);
    return { id: i + 1, x, y: objective(x) };
  });
}

// Rank-based minimization split; trial order breaks objective ties deterministically.
export function splitTrials(trials: readonly Trial[], gamma: number) {
  return rankSplit(trials, gamma, (t) => t.y);
}

// Gaussian kernels integrate to one over the real line; the plot shows only the search domain.
export function createKde(samples: readonly number[], config: DensityConfig): (x: number) => number {
  if (!samples.length) throw new Error("Need KDE samples.");
  return createModelDensity(samples.map((x, id) => ({ id, x, y: 0 })), 0, config.bandwidth, config.weights);
}
