import type { ResolvedGpConfig } from "./model/gp/types";

export type GpSettings = ResolvedGpConfig;

export const gpLengthScaleRange = { min: 0.2, max: 6, step: 0.05 };
export const gpBetaRange = { min: 0, max: 4, step: 0.1 };
export const gpXiRange = { min: 0, max: 0.5, step: 0.01 };
export const gpNoiseOptions = [0.001, 0.01, 0.05, 0.1, 0.25];
export const gpStartupTrialCounts = (limit: number) => [...new Set([2, 5, 10, 20, 30, 50, 100, limit].filter((count) => count <= limit))];
export const gpKernelOptions = [{ value: "matern52", label: "Matérn 5/2" }, { value: "rbf", label: "RBF" }] as const;
export const gpAcquisitionOptions = [{ value: "ucb", label: "UCB (LCB)" }, { value: "ei", label: "EI (Expected Improvement)" }] as const;
export const gpLengthScaleRules = ["auto", "manual"] as const;

export const gpDefaults: GpSettings = {
  kernel: "matern52", acquisition: "ucb", lengthScaleRule: "auto",
  lengthScale: 2, beta: 2, xi: 0.01, noise: 0.01, startupTrials: 10,
};

export const optunaGpPreset = {
  kernel: "matern52", acquisition: "ei", lengthScaleRule: "auto", xi: 0.01, noise: 0.01, startupTrials: 10,
} as const;

export function applyOptunaGpPreset(settings: GpSettings): GpSettings {
  return { ...settings, ...optunaGpPreset };
}

export function matchesOptunaGpPreset(settings: GpSettings): boolean {
  return (Object.keys(optunaGpPreset) as (keyof typeof optunaGpPreset)[]).every((key) => settings[key] === optunaGpPreset[key]);
}

export function matchesGpDefaults(settings: GpSettings): boolean {
  return (Object.keys(gpDefaults) as (keyof GpSettings)[]).every((key) =>
    (key === "lengthScale" && settings.lengthScaleRule === "auto") || settings[key] === gpDefaults[key]);
}
