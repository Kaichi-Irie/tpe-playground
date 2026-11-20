import { twoParamConstraintPresets, type TwoParamConstraintPreset } from "./twoParamConstraints";
import { isBandwidthRule } from "./model/bandwidth";
import type { DensityMode } from "./model/types";
import {
  applyOptunaPreset, bandwidthRange, candidateCounts, constrainSettings, gammaRange, matchesOptunaPreset, priorWeights, startupTrialCounts, weightOptions, type ModelSettings,
} from "./searchSettings";

export const playPageHrefs = { "play-2d": import.meta.env.BASE_URL, "play-3d": "#play-3d" } as const;
const playShareHashes = { "play-2d": "#play-2d", "play-3d": playPageHrefs["play-3d"] } as const;
export type Page = keyof typeof playPageHrefs | "lab" | "about";
export type ShareExperiment =
  | { page: "play-2d"; preset: string }
  | { page: "play-3d"; preset: string; mode: DensityMode; constraint: TwoParamConstraintPreset };

export type SharedSearch<Preset extends string> = {
  seed: number;
  preset: Preset;
  settings: Required<Omit<ModelSettings, "infeasibleFilling">> & Pick<ModelSettings, "infeasibleFilling">;
};

export type Route = { page: Page; share: URLSearchParams | null };

export function readRoute(hash: string): Route {
  const separator = hash.indexOf("?");
  const path = separator === -1 ? hash : hash.slice(0, separator);
  const params = separator === -1 ? null : new URLSearchParams(hash.slice(separator + 1));
  if (path === playShareHashes["play-2d"] || path === playShareHashes["play-3d"]) {
    return { page: path === playShareHashes["play-2d"] ? "play-2d" : "play-3d", share: params };
  }
  return { page: path === "#lab" ? "lab" : path === "#about" ? "about" : "play-2d", share: null };
}

export function createShareUrl(documentUrl: string, experiment: ShareExperiment, seed: number, settings: ModelSettings) {
  const url = new URL(documentUrl);
  url.search = "";
  const model = {
    gamma: settings.gamma.toFixed(2),
    bandwidth: settings.bandwidth.toFixed(2),
    bandwidthRule: settings.bandwidthRule ?? "constant",
    weights: settings.weights,
    priorWeight: String(settings.priorWeight),
    startupTrials: String(settings.startupTrials),
    candidates: String(settings.candidates),
  } satisfies Record<keyof Omit<ModelSettings, "infeasibleFilling">, string>;
  const optuna = matchesOptunaPreset(settings);
  const params = new URLSearchParams({
    seed: String(seed), preset: experiment.preset, ...(optuna ? { tpe: "optuna" } : model),
  });
  if (experiment.page === "play-3d") {
    params.set("mode", experiment.mode);
    if (experiment.constraint !== "none") {
      params.set("constraint", experiment.constraint);
      if (!optuna) params.set("infeasibleFilling", String(settings.infeasibleFilling ?? true));
    }
  }
  url.hash = `${playShareHashes[experiment.page]}?${params}`;
  return url.href;
}

function decimal(value: string | null): number {
  return value !== null && /^\d+(?:\.\d{1,2})?$/.test(value) ? Number(value) : NaN;
}

function onStep(value: number, min: number, max: number, step: number) {
  const steps = (value - min) / step;
  return value >= min && value <= max && Math.abs(steps - Math.round(steps)) < 1e-9;
}

export function readSharedSearch<Preset extends string>(
  params: URLSearchParams | null,
  defaults: SharedSearch<Preset>,
  presets: Record<Preset, unknown>,
  trialLimit: number,
  domainWidth: number,
): SharedSearch<Preset> {
  if (!params) return defaults;

  const preset = params.get("preset");
  const seed = decimal(params.get("seed"));
  const gamma = decimal(params.get("gamma"));
  const bandwidth = decimal(params.get("bandwidth"));
  const bandwidthRule = params.get("bandwidthRule");
  const weights = weightOptions.find((option) => option.value === params.get("weights"))?.value;

  const readOption = (key: "priorWeight" | "startupTrials" | "candidates", options: number[]) => {
    const candidate = decimal(params.get(key));
    return options.includes(candidate) ? candidate : defaults.settings[key];
  };

  return {
    seed: Number.isInteger(seed) && seed >= 0 && seed <= 99 ? seed : defaults.seed,
    preset: preset !== null && Object.hasOwn(presets, preset) ? preset as Preset : defaults.preset,
    settings: params.get("tpe") === "optuna" ? applyOptunaPreset(defaults.settings) : {
      gamma: onStep(gamma, gammaRange.min, gammaRange.max, gammaRange.step) ? gamma : defaults.settings.gamma,
      bandwidth: onStep(bandwidth, bandwidthRange.min, domainWidth, bandwidthRange.step) ? bandwidth : defaults.settings.bandwidth,
      bandwidthRule: isBandwidthRule(bandwidthRule) ? bandwidthRule : defaults.settings.bandwidthRule,
      weights: weights ?? defaults.settings.weights,
      priorWeight: readOption("priorWeight", priorWeights),
      startupTrials: readOption("startupTrials", startupTrialCounts(trialLimit)),
      candidates: readOption("candidates", candidateCounts),
    },
  };
}

export function readPlay3DSharedSearch<Preset extends string>(
  params: URLSearchParams | null,
  defaults: SharedSearch<Preset>,
  presets: Record<Preset, unknown>,
  trialLimit: number,
  domainWidth: number,
): Omit<SharedSearch<Preset>, "settings"> & { settings: ModelSettings; mode: DensityMode; constraint: TwoParamConstraintPreset } {
  const search = readSharedSearch(params, defaults, presets, trialLimit, domainWidth);
  const mode = params?.get("mode") === "univariate" ? "univariate" : "multivariate";
  const value = params?.get("constraint");
  const constraint = value && Object.hasOwn(twoParamConstraintPresets, value) ? value as TwoParamConstraintPreset : "none";
  const settings = constraint === "none" ? search.settings : constrainSettings({
    ...search.settings,
    infeasibleFilling: search.settings.infeasibleFilling ?? (params?.get("infeasibleFilling") !== "false"),
  });
  return { ...search, settings, mode, constraint };
}
