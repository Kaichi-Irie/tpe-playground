import { validateBandwidthRule, type BandwidthRule } from "./model/bandwidth";
import { fitTpe, proposeTpe } from "./model/engine";
import { rankSplit } from "./model/partition";
import { evaluateField } from "./model/visualization";
import type { Observation, Problem, ProposalTrace, TpeConfig } from "./model/types";
import { getObjective, type ObjectivePreset } from "./objectives";

export interface Trial { id: number; x: number; y: number }
export const trialLimit = 200;
export const domain = [-5, 5] as const;
export type WeightStrategy = "uniform" | "recency" | "ei";
interface ModelConfig { bandwidthRule?: BandwidthRule; bandwidth: number; gamma: number; weights?: WeightStrategy }
export const defaults = { bandwidthRule: "constant" as BandwidthRule, bandwidth: 0.4, gamma: 0.2, weights: "uniform" as WeightStrategy };
export const prior = { mean: 0, bandwidth: domain[1] - domain[0], weight: 1 };
export interface SearchConfig extends ModelConfig { startupTrials?: number; candidates?: number; objectivePreset?: ObjectivePreset }
export const searchDefaults = { startupTrials: 10, candidates: 24 };

interface Candidate { x: number; logRatio: number }
export interface Proposal { method: "random" | "tpe"; x: number; candidates: Candidate[]; trace: ProposalTrace }

function validateModelConfig({ gamma, bandwidth, weights = "uniform", bandwidthRule = "constant" }: ModelConfig): void {
  if (!Number.isFinite(gamma) || gamma <= 0 || gamma >= 1 || !Number.isFinite(bandwidth) || bandwidth <= 0) {
    throw new Error("Need 0 < gamma < 1 and a positive finite bandwidth.");
  }
  validateBandwidthRule(bandwidthRule);
  if (!["uniform", "recency", "ei"].includes(weights)) throw new Error("Unknown weight strategy.");
}

function validatePriorWeight(weight: number): void {
  if (!Number.isFinite(weight) || weight < 0) throw new Error("Prior weight must be finite and nonnegative.");
}

const problem1D: Problem = { id: "multimodal", parameters: [{ id: "x", low: -5, high: 5 }], directions: ["minimize"], constraintCount: 0 };
const observations1D = (trials: readonly Trial[]): Observation[] => trials.map((t) => ({ id: t.id, params: { x: t.x }, objectives: [t.y], constraints: [] }));
const config1D = (config: SearchConfig, priorWeight: number): TpeConfig => ({ mode: "univariate", bandwidth: config.bandwidth, bandwidthRule: config.bandwidthRule ?? "constant", gamma: config.gamma, weights: config.weights ?? "uniform", priorWeight, startupTrials: config.startupTrials ?? searchDefaults.startupTrials, candidates: config.candidates ?? searchDefaults.candidates });

export function fitModel1D(trials: readonly Trial[], priorWeight = 0, config: SearchConfig = defaults) {
  return fitTpe({ ...problem1D, id: config.objectivePreset ?? "multimodal" }, observations1D(trials), config1D(config, priorWeight));
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

// Rank-based minimization split; trial order breaks objective ties deterministically.
export function splitTrials(trials: readonly Trial[], gamma: number) {
  return rankSplit(trials, gamma, (t) => t.y);
}
