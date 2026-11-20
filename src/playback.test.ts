import { expect, it } from "vitest";
import { emptyPlayback, keepObservations, movePlayback } from "./playback";
import { buildOneParamView, defaults, proposeTrial, runSearch } from "./oneParamTpe";

it("preserves evaluated points while bandwidth changes densities and future proposals", () => {
  const before = movePlayback(emptyPlayback(), 15, 42, 1, defaults);
  const snapshot = structuredClone(before);
  const edited = keepObservations(before);
  const config = { ...defaults, bandwidth: 0.1 };
  const grid = [-5, 0, 5];
  expect(buildOneParamView(edited.trials, grid, 1, config).goodDensity).not.toEqual(buildOneParamView(edited.trials, grid, 1, defaults).goodDensity);
  const next = movePlayback(edited, 16, 42, 1, config);
  expect(next.trials.slice(0, 15)).toEqual(snapshot.trials);
  expect(next.proposals[15]).toEqual(proposeTrial(snapshot.trials, 42, 1, config));
  expect(before).toEqual(snapshot);
});

it("reproduces unchanged searches and branches from a previous step", () => {
  const full = movePlayback(emptyPlayback(), 20, 42, 1, defaults);
  const back = movePlayback(full, 12, 42, 1, defaults);
  expect(back.trials).toHaveLength(12);
  expect(movePlayback(back, 20, 42, 1, defaults)).toEqual(full);
  const branch = keepObservations(back);
  expect(branch.trials).toEqual(full.trials.slice(0, 12));
  expect(branch.proposals).toEqual(full.proposals.slice(0, 12));
  const config = { gamma: 0.5, bandwidth: 1.2 };
  const next = movePlayback(branch, 13, 42, 0, config);
  expect(next.trials.slice(0, 12)).toEqual(branch.trials);
  expect(next.proposals[12]).toEqual(proposeTrial(branch.trials, 42, 0, config));
});

it("matches sequential search and respects playback boundaries", () => {
  const full = movePlayback(emptyPlayback(), 300, 42, 1, defaults);
  expect(full.step).toBe(200);
  expect(full.trials).toEqual(runSearch(42, 200, 1).trials);
  expect(movePlayback(full, -1, 42, 1, defaults).step).toBe(0);
  const completed = keepObservations(full);
  expect(completed.trials).toEqual(full.trials);
});


it("preserves observations when switching to EI or recency weights", () => {
  const before = movePlayback(emptyPlayback(), 15, 42, 1, defaults);
  for (const weights of ["ei", "recency"] as const) {
    const config = { ...defaults, weights };
    const edited = keepObservations(before);
    const next = movePlayback(edited, 16, 42, 1, config);
    expect(next.trials.slice(0, 15)).toEqual(before.trials);
    expect(next.proposals[15]).toEqual(proposeTrial(before.trials, 42, 1, config));
    expect(next.proposals[15]).not.toEqual(proposeTrial(before.trials, 42, 1, defaults));
  }
});

it("preserves observations when changing search settings or prior strength", () => {
  const before = movePlayback(emptyPlayback(), 15, 42, 1, defaults);
  for (const startupTrials of [2, 50]) {
    for (const priorWeight of [0, 0.5, 5]) {
      const config = { ...defaults, startupTrials, candidates: 4 };
      const next = movePlayback(keepObservations(before), 16, 42, priorWeight, config);
      expect(next.trials.slice(0, 15)).toEqual(before.trials);
      expect(next.proposals.slice(0, 15)).toEqual(before.proposals);
      expect(next.proposals[15]).toEqual(proposeTrial(before.trials, 42, priorWeight, config));
      expect(next.proposals[15].method).toBe(startupTrials === 50 ? "random" : "tpe");
    }
  }
});

it("preserves history when switching automatic rules and overriding with a constant width", () => {
  let state = movePlayback(emptyPlayback(), 15, 42, 1, defaults);
  for (const bandwidthRule of ["scott", "silverman", "constant"] as const) {
    const before = structuredClone(state);
    const config = { ...defaults, bandwidthRule, bandwidth: 0.25 };
    state = movePlayback(keepObservations(state), state.step + 1, 42, 1, config);
    expect(state.trials.slice(0, before.step)).toEqual(before.trials);
    expect(state.proposals.slice(0, before.step)).toEqual(before.proposals);
    expect(state.proposals[before.step]).toEqual(proposeTrial(before.trials, 42, 1, config));
    expect(state.proposals[before.step].trace.config.bandwidthRule).toBe(bandwidthRule);
  }
});
