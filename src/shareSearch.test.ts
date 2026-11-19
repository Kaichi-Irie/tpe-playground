import { afterEach, describe, expect, it, vi } from "vitest";
import { createShareUrl, readBrowserRoute, readRoute, readSharedSearch, type SharedSearch } from "./shareSearch";
import { bandwidthRange, candidateCounts, gammaRange, priorWeights, startupTrialCounts, weightOptions } from "./searchSettings";
import { objectivePresets, type ObjectivePreset } from "./objectives";
import { defaults, prior, runSearch, searchDefaults, trialLimit } from "./tpe";
import { defaultModelSettings2D, emptyPlayback2D, movePlayback2D, objectivePresets2D, settings2D, type ObjectivePreset2D } from "./tpe2d";

const pageUrl = "https://kaichi-irie.github.io/tpe-playground/?tracking=123#about";
const defaults1D: SharedSearch<ObjectivePreset> = {
  seed: 50, preset: "multimodal", settings: { ...defaults, ...searchDefaults, priorWeight: prior.weight },
};
const defaults2D: SharedSearch<ObjectivePreset2D> = {
  seed: settings2D.seed, preset: "multimodal", settings: { ...defaultModelSettings2D, bandwidthRule: "constant" },
};

function roundTrip1D(search: SharedSearch<ObjectivePreset>) {
  const url = createShareUrl(pageUrl, { page: "1d", preset: search.preset }, search.seed, search.settings);
  return readSharedSearch(readRoute(new URL(url).hash).share, defaults1D, objectivePresets, trialLimit, 10);
}

describe("browser route", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["#play", "1d", "/tpe-playground/?tracking=123", null],
    ["#play-2d", "1d", "/tpe-playground/?tracking=123", null],
    ["#play?v=1&seed=3", "1d", "/tpe-playground/?tracking=123", "3"],
    ["#play-2d?v=2&seed=3", "1d", "/tpe-playground/?tracking=123", "3"],
    ["#play-2d?v=1&seed=3", "2d", "#play-3d", "3"],
    ["#play-3d?v=2&seed=3", "2d", "#play-3d", "3"],
    ["#play-3d", "2d", null, null],
    ["", "1d", null, null],
  ])("handles the address bar and settings for %s", (hash, page, canonicalUrl, seed) => {
    const state = { navigation: 1 };
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { hash, pathname: "/tpe-playground/", search: "?tracking=123" },
      history: { state, replaceState },
    });

    const route = readBrowserRoute();
    expect(route.page).toBe(page);
    expect(route.share?.get("seed") ?? null).toBe(seed);
    if (canonicalUrl) {
      expect(replaceState).toHaveBeenCalledExactlyOnceWith(state, "", canonicalUrl);
    } else {
      expect(replaceState).not.toHaveBeenCalled();
    }
  });
});

describe("share links", () => {
  it.each([
    ["", "1d"], ["#play", "1d"], ["#play-2d", "1d"], ["#play-3d", "2d"], ["#about", "about"],
    ["#lab?seed=3", "lab"], ["#about?v=1", "about"], ["#invalid?v=1&seed=3", "1d"],
    ["#play?seed=3", "1d"], ["#play?v=2&seed=3", "1d"],
    ["#play-2d?v=3&seed=3", "1d"], ["#play-3d?v=3&seed=3", "2d"],
  ])("opens %s as %s without a settings payload", (hash, page) => {
    expect(readRoute(hash)).toEqual({ page, share: null });
  });

  it.each([
    ["#play?v=1&seed=3", "1d"], ["#play-2d?v=1&seed=3", "2d"],
    ["#play-2d?v=2&seed=3", "1d"], ["#play-3d?v=2&seed=3", "2d"],
  ])("opens shared settings from %s in %s", (hash, page) => {
    const route = readRoute(hash);
    expect(route.page).toBe(page);
    expect(route.share?.get("seed")).toBe("3");
  });

  it("writes the 2D route for new 2D share links", () => {
    const url = new URL(createShareUrl(pageUrl, { page: "1d", preset: defaults1D.preset }, defaults1D.seed, defaults1D.settings));
    expect(url.hash).toMatch(/^#play-2d\?v=2&/);
  });

  it("preserves the base path and writes the 3D route and density mode without tracking parameters", () => {
    const url = new URL(createShareUrl(pageUrl, { page: "2d", preset: "rosenbrock", mode: "univariate" }, 99, defaults2D.settings));
    const route = readRoute(url.hash);
    expect(url.pathname).toBe("/tpe-playground/");
    expect(url.search).toBe("");
    expect(url.hash).toMatch(/^#play-3d\?v=2&/);
    expect(route.page).toBe("2d");
    expect(route.share?.get("mode")).toBe("univariate");
    expect(route.share?.get("seed")).toBe("99");
    expect(route.share?.get("preset")).toBe("rosenbrock");
  });

  it("round-trips explorer defaults, preset IDs, and every model control value", () => {
    expect(roundTrip1D(defaults1D)).toEqual(defaults1D);
    const url = new URL(createShareUrl(pageUrl, { page: "2d", preset: defaults2D.preset, mode: "multivariate" }, defaults2D.seed, defaults2D.settings));
    const decode2D = (hash: string) => readSharedSearch(readRoute(hash).share, defaults2D, objectivePresets2D, settings2D.count, 10);
    expect(decode2D(url.hash)).toEqual(defaults2D);
    for (const preset of ["multimodal", "quadratic", "narrow", "boundary"] as const) {
      expect(roundTrip1D({ ...defaults1D, preset }).preset).toBe(preset);
    }
    for (const preset of ["multimodal", "quadratic", "rosenbrock"] as const) {
      expect(decode2D(`#play-2d?v=1&preset=${preset}`).preset).toBe(preset);
    }
    function checkSetting<Key extends keyof typeof defaults1D.settings>(key: Key, values: readonly (typeof defaults1D.settings)[Key][]) {
      for (const value of values) {
        const settings = { ...defaults1D.settings, [key]: value };
        expect(roundTrip1D({ ...defaults1D, settings }).settings[key]).toBe(value);
      }
    }
    const hundredths = (min: number, max: number, step: number) =>
      Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => Math.round((min + i * step) * 100) / 100);
    checkSetting("gamma", hundredths(gammaRange.min, gammaRange.max, gammaRange.step));
    checkSetting("bandwidth", hundredths(bandwidthRange.min, 10, bandwidthRange.step));
    checkSetting("bandwidthRule", ["constant", "scott", "silverman"]);
    checkSetting("weights", weightOptions.map(({ value }) => value));
    checkSetting("priorWeight", priorWeights);
    checkSetting("startupTrials", startupTrialCounts(trialLimit));
    checkSetting("candidates", candidateCounts);
  });

  it("uses dimension defaults for invalid fields while preserving valid fields including zero", () => {
    const { share } = readRoute("#play?v=1&seed=0&preset=__proto__&gamma=0.14&bandwidth=0xff&bandwidthRule=adaptive&weights=bad&priorWeight=0&startupTrials=500&candidates=1e2");
    expect(readSharedSearch(share, defaults1D, objectivePresets, trialLimit, 10)).toEqual({
      ...defaults1D, seed: 0, settings: { ...defaults1D.settings, priorWeight: 0 },
    });
    const params = readRoute("#play-2d?v=1&seed=100&preset=boundary&gamma=Infinity&bandwidth=0&priorWeight=2&startupTrials=2").share;
    expect(readSharedSearch(params, defaults2D, objectivePresets2D, settings2D.count, 10)).toEqual({
      ...defaults2D, settings: { ...defaults2D.settings, priorWeight: 2, startupTrials: 2 },
    });
  });

  it("reproduces both trial sequences from a non-default configuration", () => {
    const seed = 0;
    const settings = {
      gamma: 0.15, bandwidth: 0.73, bandwidthRule: "constant", weights: "ei",
      priorWeight: 2, startupTrials: 2, candidates: 8,
    } as const;
    const one = roundTrip1D({ seed, preset: "boundary", settings });
    expect(runSearch(one.seed, 12, one.settings.priorWeight, { ...one.settings, objectivePreset: one.preset }))
      .toEqual(runSearch(seed, 12, settings.priorWeight, { ...settings, objectivePreset: "boundary" }));

    const fragment = new URL(createShareUrl(pageUrl, { page: "2d", preset: "rosenbrock", mode: "univariate" }, seed, settings)).hash;
    const { share } = readRoute(fragment);
    const two = readSharedSearch(share, defaults2D, objectivePresets2D, settings2D.count, 10);
    const mode = share?.get("mode") === "univariate" ? "univariate" : "multivariate";
    expect(movePlayback2D(emptyPlayback2D(), 12, two.seed, mode, { ...two.settings, objectivePreset: two.preset }))
      .toEqual(movePlayback2D(emptyPlayback2D(), 12, seed, "univariate", { ...settings, objectivePreset: "rosenbrock" }));
  });
});
