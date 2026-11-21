import { describe, expect, it } from "vitest";
import { createShareUrl, readRoute, readSharedSearch, readPlay3DSharedSearch, type SharedSearch } from "./shareSearch";
import { applyOptunaPreset, bandwidthRange, candidateCounts, gammaRange, priorWeights, startupTrialCounts, weightOptions } from "./searchSettings";
import { objectivePresets, type ObjectivePreset } from "./objectives";
import { defaults, prior, runSearch, searchDefaults, trialLimit } from "./oneParamTpe";
import { twoParamDefaultModelSettings, emptyTwoParamPlayback, moveTwoParamPlayback, twoParamObjectivePresets, twoParamSettings, type TwoParamObjectivePreset } from "./twoParamTpe";

const pageUrl = "https://kaichi-irie.github.io/tpe-playground/?tracking=123#about";
const legacyPlay2DUrl = "https://kaichi-irie.github.io/tpe-playground/#play-2d?seed=7&preset=boundary&gamma=0.15&bandwidth=0.73&bandwidthRule=scott&weights=ei&priorWeight=2&startupTrials=5&candidates=8";
const legacyPlay3DUrl = "https://kaichi-irie.github.io/tpe-playground/#play-3d?seed=99&preset=rosenbrock&gamma=0.35&bandwidth=0.82&bandwidthRule=optuna&weights=ei&priorWeight=0.5&startupTrials=20&candidates=64&mode=univariate";
const legacyConstrainedPlay3DUrl = "https://kaichi-irie.github.io/tpe-playground/#play-3d?seed=17&preset=quadratic&gamma=0.30&bandwidth=0.55&bandwidthRule=constant&weights=recency&priorWeight=0&startupTrials=2&candidates=4&mode=multivariate&constraint=band&infeasibleFilling=false";
const play2DDefaults: SharedSearch<ObjectivePreset> = {
  seed: 0, preset: "multimodal", settings: { ...defaults, ...searchDefaults, priorWeight: prior.weight },
};
const play3DDefaults: SharedSearch<TwoParamObjectivePreset> = {
  seed: twoParamSettings.seed, preset: "multimodal", settings: { ...twoParamDefaultModelSettings, bandwidthRule: "constant" },
};

function roundTripPlay2D(search: SharedSearch<ObjectivePreset>) {
  const url = createShareUrl(pageUrl, { page: "play-2d", preset: search.preset }, search.seed, search.settings);
  return readSharedSearch(readRoute(new URL(url).hash).share, play2DDefaults, objectivePresets, trialLimit, 10);
}

function decodePlay3D(params: URLSearchParams | null) {
  return readPlay3DSharedSearch(params, play3DDefaults, twoParamObjectivePresets, twoParamSettings.count, 10);
}

describe("share links", () => {
  it("reads existing Play 2D links with every linked setting", () => {
    const route = readRoute(new URL(legacyPlay2DUrl).hash);
    expect(route.page).toBe("play-2d");
    expect(readSharedSearch(route.share, play2DDefaults, objectivePresets, trialLimit, 10)).toStrictEqual({
      seed: 7, preset: "boundary",
      settings: {
        gamma: 0.15, bandwidth: 0.73, bandwidthRule: "scott", weights: "ei",
        priorWeight: 2, startupTrials: 5, candidates: 8,
      },
    });
  });

  it("reads existing unconstrained Play 3D links with every linked setting", () => {
    const route = readRoute(new URL(legacyPlay3DUrl).hash);
    expect(route.page).toBe("play-3d");
    expect(decodePlay3D(route.share)).toStrictEqual({
      seed: 99, preset: "rosenbrock", mode: "univariate", constraint: "none",
      settings: {
        gamma: 0.35, bandwidth: 0.82, bandwidthRule: "optuna", weights: "ei",
        priorWeight: 0.5, startupTrials: 20, candidates: 64,
      },
    });
  });

  it("reads existing constrained Play 3D links with every linked setting", () => {
    const route = readRoute(new URL(legacyConstrainedPlay3DUrl).hash);
    expect(route.page).toBe("play-3d");
    expect(decodePlay3D(route.share)).toStrictEqual({
      seed: 17, preset: "quadratic", mode: "multivariate", constraint: "band",
      settings: {
        gamma: 0.3, bandwidth: 0.55, bandwidthRule: "constant", weights: "recency",
        priorWeight: 0, startupTrials: 2, candidates: 4, infeasibleFilling: false,
      },
    });
  });

  it.each([
    ["", "play-2d"], ["#play", "play-2d"], ["#play-2d", "play-2d"], ["#play-3d", "play-3d"], ["#lab", "lab"], ["#about", "about"],
    ["#lab?seed=3", "lab"], ["#about?seed=3", "about"], ["#invalid?seed=3", "play-2d"], ["#play?seed=3", "play-2d"],
  ])("opens %s as %s without a settings payload", (hash, page) => {
    expect(readRoute(hash)).toEqual({ page, share: null });
  });

  it.each([
    ["#play-2d", "play-2d"], ["#play-3d", "play-3d"],
  ])("opens shared settings from %s in %s regardless of the version parameter", (hash, page) => {
    for (const version of [undefined, "1", "2", "unknown"]) {
      const params = new URLSearchParams();
      if (version !== undefined) params.set("v", version);
      params.set("seed", "3");
      const route = readRoute(`${hash}?${params}`);
      expect(route.page).toBe(page);
      expect(route.share?.get("seed")).toBe("3");
    }
  });

  it("writes the Play 2D hash for new Play 2D share links", () => {
    const url = new URL(createShareUrl(pageUrl, { page: "play-2d", preset: play2DDefaults.preset }, play2DDefaults.seed, play2DDefaults.settings));
    expect(url.hash).toMatch(/^#play-2d\?seed=/);
    expect(readRoute(url.hash).share?.has("v")).toBe(false);
  });

  it("copies current settings when the address still contains an earlier experiment", () => {
    const originalUrl = "https://kaichi-irie.github.io/tpe-playground/#play-2d?seed=3&preset=quadratic&gamma=0.15";
    const settings = { ...play2DDefaults.settings, gamma: 0.35 };
    const newUrl = createShareUrl(originalUrl, { page: "play-2d", preset: "boundary" }, 7, settings);
    const originalShare = readRoute(new URL(originalUrl).hash).share;
    const newShare = readRoute(new URL(newUrl).hash).share;

    expect(readSharedSearch(originalShare, play2DDefaults, objectivePresets, trialLimit, 10)).toEqual({
      seed: 3, preset: "quadratic", settings: { ...play2DDefaults.settings, gamma: 0.15 },
    });
    expect(readSharedSearch(newShare, play2DDefaults, objectivePresets, trialLimit, 10)).toEqual({
      seed: 7, preset: "boundary", settings,
    });
  });

  it("preserves the base path and writes the Play 3D hash and density mode without tracking parameters", () => {
    const url = new URL(createShareUrl(pageUrl, { page: "play-3d", preset: "rosenbrock", mode: "univariate", constraint: "none" }, 99, play3DDefaults.settings));
    const route = readRoute(url.hash);
    expect(url.pathname).toBe("/tpe-playground/");
    expect(url.search).toBe("");
    expect(url.hash).toMatch(/^#play-3d\?seed=/);
    expect(route.share?.has("v")).toBe(false);
    expect(route.page).toBe("play-3d");
    expect(decodePlay3D(route.share).mode).toBe("univariate");
    expect(route.share?.get("seed")).toBe("99");
    expect(route.share?.get("preset")).toBe("rosenbrock");
  });

  it("writes the constraint and infeasible filling only for constrained Play 3D links", () => {
    const experiment = { page: "play-3d", preset: "rosenbrock", mode: "univariate", constraint: "none" } as const;
    const shareUrl = (infeasibleFilling: boolean | undefined) =>
      createShareUrl(pageUrl, { ...experiment, constraint: "disk" }, 99, { ...play3DDefaults.settings, infeasibleFilling });
    const unconstrained = createShareUrl(pageUrl, experiment, 99, { ...play3DDefaults.settings, infeasibleFilling: false });

    expect(unconstrained).not.toMatch(/constraint=|infeasibleFilling=/);
    expect(shareUrl(undefined)).toBe(`${unconstrained}&constraint=disk&infeasibleFilling=true`);
    expect(shareUrl(true)).toBe(`${unconstrained}&constraint=disk&infeasibleFilling=true`);
    expect(shareUrl(false)).toBe(`${unconstrained}&constraint=disk&infeasibleFilling=false`);
    const play2D = createShareUrl(pageUrl, { page: "play-2d", preset: play2DDefaults.preset }, 99, { ...play2DDefaults.settings, infeasibleFilling: false });
    expect(play2D).not.toMatch(/constraint=|infeasibleFilling=/);
  });

  it("decodes Play 3D defaults and falls back to an unconstrained search", () => {
    const unconstrained = { ...play3DDefaults, mode: "multivariate", constraint: "none" };
    expect(decodePlay3D(null)).toStrictEqual(unconstrained);
    for (const query of ["infeasibleFilling=false", "constraint=none", "constraint=unknown", "constraint=__proto__"]) {
      expect(decodePlay3D(new URLSearchParams(query))).toStrictEqual(unconstrained);
    }
    expect(decodePlay3D(new URLSearchParams("mode=unknown&weights=ei"))).toStrictEqual({
      ...unconstrained, settings: { ...play3DDefaults.settings, weights: "ei" },
    });
  });

  it("decodes the constraint and infeasible filling for a constrained Play 3D search", () => {
    for (const query of ["constraint=disk", "constraint=disk&infeasibleFilling=true", "constraint=disk&infeasibleFilling=invalid"]) {
      expect(decodePlay3D(new URLSearchParams(query))).toEqual({
        ...play3DDefaults, mode: "multivariate", constraint: "disk", settings: { ...play3DDefaults.settings, infeasibleFilling: true },
      });
    }
    expect(decodePlay3D(new URLSearchParams("constraint=disk&infeasibleFilling=false&weights=ei"))).toEqual({
      ...play3DDefaults, mode: "multivariate", constraint: "disk", settings: { ...play3DDefaults.settings, weights: "uniform", infeasibleFilling: false },
    });
  });

  it("round-trips explorer defaults, preset IDs, and every model control value", () => {
    expect(roundTripPlay2D(play2DDefaults)).toEqual(play2DDefaults);
    const url = new URL(createShareUrl(pageUrl, { page: "play-3d", preset: play3DDefaults.preset, mode: "multivariate", constraint: "none" }, play3DDefaults.seed, play3DDefaults.settings));
    expect(decodePlay3D(readRoute(url.hash).share)).toEqual({ ...play3DDefaults, mode: "multivariate", constraint: "none" });
    for (const preset of ["multimodal", "quadratic", "narrow", "boundary"] as const) {
      expect(roundTripPlay2D({ ...play2DDefaults, preset }).preset).toBe(preset);
    }
    for (const preset of ["multimodal", "quadratic", "rosenbrock"] as const) {
      expect(decodePlay3D(readRoute(`#play-3d?preset=${preset}`).share).preset).toBe(preset);
    }
    function checkSetting<Key extends keyof typeof play2DDefaults.settings>(key: Key, values: readonly (typeof play2DDefaults.settings)[Key][]) {
      for (const value of values) {
        const settings = { ...play2DDefaults.settings, [key]: value };
        expect(roundTripPlay2D({ ...play2DDefaults, settings }).settings[key]).toBe(value);
      }
    }
    const hundredths = (min: number, max: number, step: number) =>
      Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => Math.round((min + i * step) * 100) / 100);
    checkSetting("gamma", hundredths(gammaRange.min, gammaRange.max, gammaRange.step));
    checkSetting("bandwidth", hundredths(bandwidthRange.min, 10, bandwidthRange.step));
    checkSetting("bandwidthRule", ["constant", "scott", "optuna"]);
    checkSetting("weights", weightOptions.map(({ value }) => value));
    checkSetting("priorWeight", priorWeights);
    checkSetting("startupTrials", startupTrialCounts(trialLimit));
    checkSetting("candidates", candidateCounts);
  });

  it("uses dimension defaults for invalid fields while preserving valid fields including zero", () => {
    const { share } = readRoute("#play-2d?seed=0&preset=__proto__&gamma=0.14&bandwidth=0xff&bandwidthRule=adaptive&weights=bad&priorWeight=0&startupTrials=500&candidates=1e2");
    expect(readSharedSearch(share, play2DDefaults, objectivePresets, trialLimit, 10)).toEqual({
      ...play2DDefaults, seed: 0, settings: { ...play2DDefaults.settings, priorWeight: 0 },
    });
    const params = readRoute("#play-3d?seed=100&preset=boundary&gamma=Infinity&bandwidth=0&priorWeight=2&startupTrials=2").share;
    expect(decodePlay3D(params)).toEqual({
      ...play3DDefaults, mode: "multivariate", constraint: "none", settings: { ...play3DDefaults.settings, priorWeight: 2, startupTrials: 2 },
    });
  });

  it("reproduces both trial sequences from a non-default configuration", () => {
    const seed = 0;
    const settings = {
      gamma: 0.15, bandwidth: 0.73, bandwidthRule: "constant", weights: "ei",
      priorWeight: 2, startupTrials: 2, candidates: 8,
    } as const;
    const one = roundTripPlay2D({ seed, preset: "boundary", settings });
    expect(runSearch(one.seed, 12, one.settings.priorWeight, { ...one.settings, objectivePreset: one.preset }))
      .toEqual(runSearch(seed, 12, settings.priorWeight, { ...settings, objectivePreset: "boundary" }));

    const fragment = new URL(createShareUrl(pageUrl, { page: "play-3d", preset: "rosenbrock", mode: "univariate", constraint: "none" }, seed, settings)).hash;
    const two = decodePlay3D(readRoute(fragment).share);
    expect(moveTwoParamPlayback(emptyTwoParamPlayback(), 12, two.seed, two.mode, { ...two.settings, objectivePreset: two.preset }))
      .toEqual(moveTwoParamPlayback(emptyTwoParamPlayback(), 12, seed, "univariate", { ...settings, objectivePreset: "rosenbrock" }));
  });

  it("round-trips a constrained Play 3D search and reproduces its trial sequence", () => {
    const seed = 17;
    const mode = "univariate";
    const objectivePreset = "quadratic";
    const constraintPreset = "band";
    const settings = { ...play3DDefaults.settings, startupTrials: 2, infeasibleFilling: false };
    const url = createShareUrl(pageUrl, { page: "play-3d", preset: objectivePreset, mode, constraint: constraintPreset }, seed, settings);
    const route = readRoute(new URL(url).hash);
    const shared = decodePlay3D(route.share);

    expect(route.page).toBe("play-3d");
    expect(shared).toEqual({ seed, preset: objectivePreset, settings, mode, constraint: constraintPreset });
    expect(moveTwoParamPlayback(emptyTwoParamPlayback(), 12, shared.seed, shared.mode, {
      ...shared.settings, objectivePreset: shared.preset, constraintPreset: shared.constraint,
    })).toEqual(moveTwoParamPlayback(emptyTwoParamPlayback(), 12, seed, mode, { ...settings, objectivePreset, constraintPreset }));
  });
});

describe("Optuna share alias", () => {
  it("overrides model parameters with the preset over each page's defaults", () => {
    const params = new URLSearchParams("seed=17&preset=quadratic&tpe=optuna&mode=univariate&constraint=band&infeasibleFilling=false&gamma=0.3&bandwidth=0.73&bandwidthRule=constant&weights=ei&priorWeight=0&startupTrials=2&candidates=4");
    const preset = {
      gamma: 0.1, bandwidthRule: "optuna", weights: "optuna", priorWeight: 1,
      startupTrials: 10, candidates: 24, infeasibleFilling: true,
    };
    expect(decodePlay3D(params)).toEqual({
      seed: 17, preset: "quadratic", mode: "univariate", constraint: "band",
      settings: { ...preset, bandwidth: play3DDefaults.settings.bandwidth },
    });
    expect(readSharedSearch(params, play2DDefaults, objectivePresets, trialLimit, 10)).toEqual({
      seed: 17, preset: "quadratic", settings: { ...preset, bandwidth: play2DDefaults.settings.bandwidth },
    });
  });

  it("ignores unknown aliases and accepts the standalone Optuna bandwidth rule and weights", () => {
    const params = new URLSearchParams("mode=univariate&tpe=unknown&gamma=0.35&bandwidthRule=optuna&weights=optuna");
    expect(decodePlay3D(params)).toEqual({
      ...play3DDefaults, mode: "univariate", constraint: "none",
      settings: { ...play3DDefaults.settings, gamma: 0.35, bandwidthRule: "optuna", weights: "optuna" },
    });
  });

  it("writes only the alias when all preset values match, ignoring the Constant width", () => {
    const settings = { ...applyOptunaPreset(play3DDefaults.settings), bandwidth: 0.73 };
    const experiment = { page: "play-3d", preset: "rosenbrock", mode: "univariate", constraint: "disk" } as const;
    const url = createShareUrl(pageUrl, experiment, 17, settings);
    expect(new URL(url).hash).toBe("#play-3d?seed=17&preset=rosenbrock&tpe=optuna&mode=univariate&constraint=disk");
    expect(createShareUrl(pageUrl, { page: "play-2d", preset: "boundary" }, 17, settings))
      .toContain("#play-2d?seed=17&preset=boundary&tpe=optuna");
    for (const change of [
      { gamma: 0.2 }, { bandwidthRule: "constant" }, { weights: "uniform" }, { priorWeight: 0 },
      { startupTrials: 2 }, { candidates: 8 }, { infeasibleFilling: false },
    ] as const) {
      const individual = createShareUrl(pageUrl, experiment, 17, { ...settings, ...change });
      expect(individual).not.toContain("tpe=");
      expect(individual).toContain("bandwidth=0.73");
    }
  });
});
