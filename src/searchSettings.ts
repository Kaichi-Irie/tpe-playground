import type { TpeConfig } from "./model/types";

export type ModelSettings = Omit<TpeConfig, "mode">;

export const priorWeights = [0, 0.1, 0.5, 1, 2, 5];
export const candidateCounts = [1, 4, 8, 24, 64, 128];
export const startupTrialCounts = (trialLimit: number) => [2, 5, 10, 20, 30, 50, 100, trialLimit];
export const gammaRange = { min: 0.05, max: 0.5, step: 0.05 };
export const bandwidthRange = { min: 0.01, step: 0.01 };
export const weightOptions = [
  { value: "uniform", label: "Uniform", description: "Each observation has equal weight within its group." },
  { value: "recency", label: "Recency", description: "Within each group, weights increase linearly from oldest (1) to newest (n)." },
  { value: "ei", label: "EI weights", description: "Good weights ∝ max(split threshold − f(x), 0); bad weights stay uniform. All-zero improvements fall back to uniform." },
] as const;
