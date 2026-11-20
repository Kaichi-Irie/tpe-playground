import type { TpeConfig } from "./model/types";

export type ModelSettings = Omit<TpeConfig, "mode">;

export const optunaPreset = {
  gamma: 0.1,
  bandwidthRule: "neighbor",
  weights: "optuna",
  priorWeight: 1,
  startupTrials: 10,
  candidates: 24,
  infeasibleFilling: true,
} as const satisfies Omit<ModelSettings, "bandwidth">;

export function applyOptunaPreset(settings: Pick<ModelSettings, "bandwidth">) {
  return { ...settings, ...optunaPreset };
}

export function matchesOptunaPreset(settings: ModelSettings): boolean {
  return (Object.keys(optunaPreset) as (keyof typeof optunaPreset)[]).every((key) =>
    (key === "infeasibleFilling" ? settings.infeasibleFilling ?? true : settings[key]) === optunaPreset[key],
  );
}

export function constrainSettings(settings: ModelSettings): ModelSettings {
  return settings.weights === "ei" ? { ...settings, weights: "uniform" } : settings;
}

export const priorWeights = [0, 0.1, 0.5, 1, 2, 5];
export const candidateCounts = [1, 4, 8, 24, 64, 128];
export const startupTrialCounts = (trialLimit: number) => [2, 5, 10, 20, 30, 50, 100, trialLimit];
export const gammaRange = { min: 0.05, max: 0.5, step: 0.05 };
export const bandwidthRange = { min: 0.01, step: 0.01 };
export const weightOptions = [
  { value: "uniform", label: "Uniform", description: "Every observation counts equally." },
  { value: "recency", label: "Recency", description: "Newer observations count more within each group." },
  { value: "optuna", label: "Optuna", description: "The newest 25 in each group get weight 1. For older observations, weights ramp from 1 / group size toward 1. The prior keeps its set weight." },
  { value: "ei", label: "EI weights", description: "Good observations count more the further they fall below the split; bad ones count equally." },
] as const;
