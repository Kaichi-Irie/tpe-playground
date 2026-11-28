import { compareOptionsForPage, type CompareSamplerId, type SamplerId, type SamplerPage } from "./samplers";
import { applyOptunaGpPreset, gpAcquisitionOptions, gpBetaRange, gpDefaults, gpKernelOptions, gpLengthScaleRange, gpLengthScaleRules, gpNoiseOptions, gpStartupTrialCounts, gpXiRange, matchesOptunaGpPreset, type GpSettings } from "./gpSettings";
import { trialLimit as oneParamTrialLimit } from "./oneParamProblem";
import { twoParamTrialLimit } from "./twoParamProblem";
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
export type ShareExperiment = { compare?: readonly CompareSamplerId[] } & (
  | { page: "play-2d"; preset: string; sampler?: "tpe"; settings: ModelSettings }
  | { page: "play-2d"; preset: string; sampler: "gp"; gpSettings: GpSettings }
  | { page: "play-3d"; preset: string; mode: DensityMode; constraint: TwoParamConstraintPreset; sampler?: "tpe"; settings: ModelSettings }
  | { page: "play-3d"; preset: string; mode?: DensityMode; constraint: TwoParamConstraintPreset; sampler: "cmaes"; cmaEsSettings?: TwoParamCmaEsSettings }
  | { page: "play-3d"; preset: string; mode?: DensityMode; constraint: TwoParamConstraintPreset; sampler: "gp"; gpSettings: GpSettings });

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
  const finish = (params: URLSearchParams) => {
    if (experiment.compare?.length) params.set("compare", experiment.compare.join(","));
    url.hash = `${playShareHashes[experiment.page]}?${params}`;
    return url.href;
  };
  if (experiment.sampler === "gp") {
    const settings = experiment.gpSettings;
    const values = new URLSearchParams({
      kernel: settings.kernel, acq: settings.acquisition, lsRule: settings.lengthScaleRule,
      ls: String(settings.lengthScale), beta: String(settings.beta), xi: String(settings.xi),
      noise: String(settings.noise), startupTrials: String(settings.startupTrials),
    });
    const validated = readGpSettings(values, experiment.page === "play-3d" ? twoParamTrialLimit : oneParamTrialLimit);
    const params = new URLSearchParams({ sampler: "gp", seed: String(seed), preset: experiment.preset });
    if (matchesOptunaGpPreset(validated)) {
      params.set("gp", "optuna");
      // Keep the inactive values available when switching back to manual or UCB.
      if (validated.lengthScale !== gpDefaults.lengthScale) params.set("ls", String(validated.lengthScale));
      if (validated.beta !== gpDefaults.beta) params.set("beta", String(validated.beta));
    } else {
      for (const [key, value] of Object.entries({
        kernel: validated.kernel, acq: validated.acquisition, lsRule: validated.lengthScaleRule,
        ls: validated.lengthScale, beta: validated.beta, xi: validated.xi,
        noise: validated.noise, startupTrials: validated.startupTrials,
      })) params.set(key, String(value));
    }
    if (experiment.page === "play-3d" && experiment.constraint !== "none") params.set("constraint", experiment.constraint);
    return finish(params);
  }
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
    return finish(params);
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
  return finish(params);
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

function readGpSettings(params: URLSearchParams, trialLimit: number): GpSettings {
  const readRange = (key: string, range: { min: number; max: number; step: number }, fallback: number) => {
    const value = decimal(params.get(key));
    return onStep(value, range.min, range.max, range.step) ? value : fallback;
  };
  const noiseParam = params.get("noise");
  const noise = noiseParam !== null && /^\d+(?:\.\d{1,3})?$/.test(noiseParam) ? Number(noiseParam) : NaN;
  const startupTrials = decimal(params.get("startupTrials"));
  const settings: GpSettings = {
    kernel: gpKernelOptions.find(({ value }) => value === params.get("kernel"))?.value ?? gpDefaults.kernel,
    acquisition: gpAcquisitionOptions.find(({ value }) => value === params.get("acq"))?.value ?? gpDefaults.acquisition,
    lengthScaleRule: gpLengthScaleRules.find((rule) => rule === params.get("lsRule")) ?? gpDefaults.lengthScaleRule,
    lengthScale: readRange("ls", gpLengthScaleRange, gpDefaults.lengthScale),
    beta: readRange("beta", gpBetaRange, gpDefaults.beta),
    xi: readRange("xi", gpXiRange, gpDefaults.xi),
    noise: gpNoiseOptions.includes(noise) ? noise : gpDefaults.noise,
    startupTrials: gpStartupTrialCounts(trialLimit).includes(startupTrials) ? startupTrials : gpDefaults.startupTrials,
  };
  return params.get("gp") === "optuna" ? applyOptunaGpPreset(settings) : settings;
}

function readCompare(params: URLSearchParams | null, page: SamplerPage, focus: SamplerId, constrained = false): CompareSamplerId[] {
  const options = compareOptionsForPage(page, focus).filter((option) => !constrained || option.supportsConstraints);
  return [...new Set(params?.get("compare")?.split(","))].flatMap((value) => {
    const option = options.find(({ id }) => id === value);
    return option ? [option.id] : [];
  });
}

export function readPlay2DSharedSearch<Preset extends string>(
  params: URLSearchParams | null,
  defaults: SharedSearch<Preset>,
  presets: Record<Preset, unknown>,
  trialLimit: number,
  domainWidth: number,
): SharedSearch<Preset> & { sampler: "tpe" | "gp"; gpSettings: GpSettings; compare: CompareSamplerId[] } {
  if (params?.get("sampler") === "gp") {
    const experiment = new URLSearchParams({ seed: params.get("seed") ?? "", preset: params.get("preset") ?? "" });
    return {
      ...readSharedSearch(experiment, defaults, presets, trialLimit, domainWidth),
      sampler: "gp",
      compare: readCompare(params, "play-2d", "gp"),
      gpSettings: readGpSettings(params, trialLimit),
    };
  }
  return { ...readSharedSearch(params, defaults, presets, trialLimit, domainWidth), sampler: "tpe", gpSettings: gpDefaults, compare: readCompare(params, "play-2d", "tpe") };
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
  gpSettings: GpSettings;
  compare: CompareSamplerId[];
} {
  const samplerParam = params?.get("sampler");
  const sampler = samplerParam === "cmaes" || samplerParam === "gp" ? samplerParam : "tpe";
  const searchParams = sampler === "gp" ? new URLSearchParams({ seed: params?.get("seed") ?? "", preset: params?.get("preset") ?? "" }) : params;
  const search = readSharedSearch(searchParams, defaults, presets, trialLimit, domainWidth);
  const mode = params?.get("mode") === "univariate" ? "univariate" : "multivariate";
  const constraintParam = params?.get("constraint");
  const value = sampler !== "tpe" && constraintParam === "circle" ? "disk" : constraintParam;
  const constraint = value && Object.hasOwn(twoParamConstraintPresets, value) ? value as TwoParamConstraintPreset : "none";
  const settings = constraint === "none" ? search.settings : constrainSettings({
    ...search.settings,
    infeasibleFilling: search.settings.infeasibleFilling ?? (params?.get("infeasibleFilling") !== "false"),
  });
  const cmaEsSettings = sampler === "cmaes" ? readCmaEsSettings(params) : twoParamCmaEsDefaults;
  const gpSettings = sampler === "gp" && params ? readGpSettings(params, trialLimit) : gpDefaults;
  return { ...search, settings, mode, constraint, sampler, cmaEsSettings, gpSettings, compare: readCompare(params, "play-3d", sampler, constraint !== "none") };
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
