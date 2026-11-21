import { expect, it } from "vitest";
import fixture from "./fixtures/optuna-5.1-trajectories.json";
import { choiceIndex, randomSample } from "./numpyRandom";

it.each(fixture.uniforms)("matches RandomState($seed) doubles exactly", ({ seed, values }) => {
  expect(values.map((_, position) => randomSample(seed, position))).toEqual(values);
});

it("reproduces repeated and out-of-order draws across state refreshes and cache eviction", () => {
  const { seed, positions, values } = fixture.streamPositions;
  for (const i of [6, 0, 3, 5, 4, 2, 1, 0, 6]) {
    expect(randomSample(seed, positions[i])).toBe(values[i]);
  }
  for (const otherSeed of [0, 1, 2, 3]) randomSample(otherSeed, 0);
  expect(randomSample(seed, positions[6])).toBe(values[6]);
});

it("matches weighted choice and skips zero-weight entries at CDF boundaries", () => {
  const { seed, p, indices } = fixture.choice;
  let total = 0;
  const cdf = p.map((weight) => total += weight);
  expect(indices.map((_, i) => choiceIndex(cdf, randomSample(seed, i)))).toEqual(indices);
  expect([0, 0.125, 0.5].map((u) => choiceIndex(cdf, u))).toEqual([1, 3, 4]);
});
