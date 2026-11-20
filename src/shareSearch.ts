import type { DensityMode } from "./model/types";
import {
  bandwidthRange, candidateCounts, gammaRange, priorWeights, startupTrialCounts, weightOptions, type ModelSettings,
} from "./searchSettings";

export const playPageHrefs = { "1d": import.meta.env.BASE_URL, "2d": "#play-3d" } as const;
const playShareHashes = { "1d": "#play-2d", "2d": playPageHrefs["2d"] } as const;
export type Page = keyof typeof playPageHrefs | "lab" | "about";
export type ShareExperiment = { page: "1d"; preset: string } | { page: "2d"; preset: string; mode: DensityMode };

export type SharedSearch<Preset extends string> = {
  seed: number;
  preset: Preset;
  settings: Required<Omit<ModelSettings, "infeasibleFilling">>;
};

export type Route = { page: Page; share: URLSearchParams | null };

export function readRoute(hash: string): Route {
  const separator = hash.indexOf("?");
  const path = separator === -1 ? hash : hash.slice(0, separator);
  const params = separator === -1 ? null : new URLSearchParams(hash.slice(separator + 1));
  const version = params?.get("v");
  // Version 1 used #play-2d for the two-variable explorer.
  if (version === "1" && (path === "#play" || path === "#play-2d")) {
    return { page: path === "#play" ? "1d" : "2d", share: params };
  }
  if (path === playShareHashes["1d"] || path === playShareHashes["2d"]) {
    return { page: path === playShareHashes["1d"] ? "1d" : "2d", share: version === "2" ? params : null };
  }
  return { page: path === "#lab" ? "lab" : path === "#about" ? "about" : "1d", share: null };
}

export function readBrowserRoute(): Route {
  const { hash, pathname, search } = window.location;
  // Only bare bookmarks are aliases. Shared settings stay in the address bar.
  if (hash === "#play" || hash === playShareHashes["1d"]) {
    window.history.replaceState(window.history.state, "", `${pathname}${search}`);
  }
  return readRoute(hash);
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
  } satisfies Record<keyof SharedSearch<string>["settings"], string>;
  const params = new URLSearchParams({ v: "2", seed: String(seed), preset: experiment.preset, ...model });
  if (experiment.page === "2d") params.set("mode", experiment.mode);
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
    settings: {
      gamma: onStep(gamma, gammaRange.min, gammaRange.max, gammaRange.step) ? gamma : defaults.settings.gamma,
      bandwidth: onStep(bandwidth, bandwidthRange.min, domainWidth, bandwidthRange.step) ? bandwidth : defaults.settings.bandwidth,
      bandwidthRule: bandwidthRule === "constant" || bandwidthRule === "scott" || bandwidthRule === "silverman"
        ? bandwidthRule : defaults.settings.bandwidthRule,
      weights: weights ?? defaults.settings.weights,
      priorWeight: readOption("priorWeight", priorWeights),
      startupTrials: readOption("startupTrials", startupTrialCounts(trialLimit)),
      candidates: readOption("candidates", candidateCounts),
    },
  };
}
