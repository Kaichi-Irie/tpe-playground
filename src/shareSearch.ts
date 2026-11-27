import { twoParamConstraintPresets, type TwoParamConstraintPreset } from "./twoParamConstraints";
import { isBandwidthRule } from "./model/tpe/bandwidth";
import type { DensityMode } from "./model/tpe/types";
import { cmaEsPopulationSizeRange, cmaEsSigma0Range, cmaEsX0Range, matchesOptunaCmaEsPreset, optunaCmaEsPreset, twoParamCmaEsDefaults, type TwoParamCmaEsSettings, type TwoParamSampler } from "./twoParamCmaEs";
import {
  applyOptunaPreset, bandwidthRange, candidateCounts, constrainSettings, gammaRange, matchesOptunaPreset, priorWeights, startupTrialCounts, weightOptions, type ModelSettings,
} from "./searchSettings";

export const playPageHrefs = { "play-2d": import.meta.env.BASE_URL, "play-3d": "#play-3d" } as const;
const playShareHashes = { "play-2d": "#play-2d", "play-3d": playPageHrefs["play-3d"] } as const;
export type Page = keyof typeof playPageHrefs | "lab" | "about";
export type ShareExperiment =
  | { page: "play-2d"; preset: string; sampler?: "tpe"; settings: ModelSettings }
  | { page: "play-3d"; preset: string; mode: DensityMode; constraint: TwoParamConstraintPreset; sampler?: "tpe"; settings: ModelSettings }
  | { page: "play-3d"; preset: string; mode?: DensityMode; constraint: TwoParamConstraintPreset; sampler: "cmaes"; cmaEsSettings?: TwoParamCmaEsSettings };

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

export function createShareUrl(documentUrl: string, experiment: ShareExperiment, seed: number) {
  const url = new URL(documentUrl);
  url.search = "";
  if (experiment.sampler === "cmaes") {
    const cmaEsSettings = experiment.cmaEsSettings ?? twoParamCmaEsDefaults;
    const { sigma0, populationSize, x0 } = cmaEsSettings;
    const params = new URLSearchParams({ sampler: "cmaes", seed: String(seed), preset: experiment.preset });
    if (matchesOptunaCmaEsPreset(cmaEsSettings)) params.set("cmaes", "optuna");
    else {
      params.set("sigma0", String(sigma0));
      params.set("popsize", String(populationSize));
      params.set("x0x1", String(x0.x1));
      params.set("x0x2", String(x0.x2));
    }
    if (experiment.constraint !== "none") params.set("constraint", experiment.constraint);
    url.hash = `${playShareHashes[experiment.page]}?${params}`;
    return url.href;
  }
  const { settings } = experiment;
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
): Omit<SharedSearch<Preset>, "settings"> & {
  settings: ModelSettings;
  mode: DensityMode;
  constraint: TwoParamConstraintPreset;
  sampler: TwoParamSampler;
  cmaEsSettings: TwoParamCmaEsSettings;
} {
  const search = readSharedSearch(params, defaults, presets, trialLimit, domainWidth);
  const mode = params?.get("mode") === "univariate" ? "univariate" : "multivariate";
  const sampler = params?.get("sampler") === "cmaes" ? "cmaes" : "tpe";
  const constraintParam = params?.get("constraint");
  const value = sampler === "cmaes" && constraintParam === "circle" ? "disk" : constraintParam;
  const constraint = value && Object.hasOwn(twoParamConstraintPresets, value) ? value as TwoParamConstraintPreset : "none";
  const settings = constraint === "none" ? search.settings : constrainSettings({
    ...search.settings,
    infeasibleFilling: search.settings.infeasibleFilling ?? (params?.get("infeasibleFilling") !== "false"),
  });
  const cmaEsSettings = sampler === "cmaes" ? readCmaEsSettings(params) : twoParamCmaEsDefaults;
  return { ...search, settings, mode, constraint, sampler, cmaEsSettings };
}

function readCmaEsSettings(params: URLSearchParams | null): TwoParamCmaEsSettings {
  if (!params) return twoParamCmaEsDefaults;
  if (params.get("cmaes") === "optuna") return optunaCmaEsPreset;
  const read = (key: string, range: { min: number; max: number; step: number }, fallback: number) => {
    const raw = params.get(key);
    const value = raw !== null && /^-?\d+(?:\.\d{1,2})?$/.test(raw) ? Number(raw) : NaN;
    return onStep(value, range.min, range.max, range.step) ? value : fallback;
  };
  return {
    sigma0: read("sigma0", cmaEsSigma0Range, twoParamCmaEsDefaults.sigma0),
    populationSize: read("popsize", cmaEsPopulationSizeRange, twoParamCmaEsDefaults.populationSize),
    x0: {
      x1: read("x0x1", cmaEsX0Range, twoParamCmaEsDefaults.x0.x1),
      x2: read("x0x2", cmaEsX0Range, twoParamCmaEsDefaults.x0.x2),
    },
  };
}
