import { expect, it } from "vitest";
import { bestSoFar, comparisonFloor } from "./comparison";
import { findObjectiveMinimum, type ObjectivePreset } from "./objectives";
import { nextExampleIndex, seedExamples } from "./seedExamples";
import { defaults, prior, runSearch, trialLimit } from "./tpe";
import { emptyPlayback, movePlayback } from "./playback";

it("cycles through every curated seed exactly once before repeating", () => {
  for (const preset of Object.keys(seedExamples) as ObjectivePreset[]) {
    const pool = seedExamples[preset];
    expect(pool).toHaveLength(10);
    expect(new Set(pool).size).toBe(pool.length);
    let index = 0;
    const visited = [];
    for (let i = 0; i < pool.length; i++) {
      visited.push(pool[index]);
      index = nextExampleIndex(preset, index);
    }
    expect(visited).toEqual(pool);
    expect(index).toBe(0);
  }
});

// Each full search gets its own timeout and failure report on slower CI runners.
const curatedCases = (Object.keys(seedExamples) as ObjectivePreset[]).flatMap((preset) =>
  seedExamples[preset].map((seed) => [preset, seed] as const));
it.each(curatedCases)("keeps %s seed %i distinct at 200 evaluations with default settings", (objectivePreset, seed) => {
  const minimum = findObjectiveMinimum(objectivePreset).y;
  const config = { ...defaults, objectivePreset };
  const tpe = runSearch(seed, trialLimit, prior.weight, config);
  const random = runSearch(seed, trialLimit, 0, { ...config, startupTrials: trialLimit });
  expect(tpe.trials).toHaveLength(200);
  expect(random.proposals.every((proposal) => proposal.method === "random")).toBe(true);
  expect(tpe.trials.slice(0, 10)).toEqual(random.trials.slice(0, 10));
  const gap = (values: typeof tpe.trials) => Math.max(comparisonFloor, bestSoFar(values).at(-1)! - minimum);
  expect(Math.abs(Math.log10(gap(random.trials) / gap(tpe.trials)))).toBeGreaterThan(4);
});

it("continues beyond trial 50 and ends exactly at 200, including random-only playback", () => {
  const config = { ...defaults, startupTrials: trialLimit };
  const full = movePlayback(emptyPlayback(), trialLimit + 1, 50, prior.weight, config);
  expect(full.step).toBe(200);
  expect(full.trials).toHaveLength(200);
  expect(full.proposals.every((proposal) => proposal.method === "random")).toBe(true);
  expect(full.trials).toEqual(runSearch(50, trialLimit, 0, config).trials);
  const back = movePlayback(full, 199, 50, prior.weight, config);
  expect(back.trials).toHaveLength(199);
  expect(movePlayback(back, 200, 50, prior.weight, config)).toEqual(full);
});
