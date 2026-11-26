import { expect, it } from "vitest";
import fixture from "../fixtures/optuna-5.1-trajectories.json";
import { randomSample } from "../numpyRandom";
import { erf, logGaussMass, logNdtr, truncnormPpf } from "./truncnorm";

it.each([
  [0, 0], [1e-12, 1.1283791670955126e-12], [0.5, 0.5204998778130465],
  [0.9, 0.7969082124228322], [1.4, 0.9522851197626487],
  [-3, -0.9999779095030015], [6, 1],
])("matches the reference erf at %s", (x, expected) => {
  expect(Math.abs(erf(x) - expected)).toBeLessThanOrEqual(1e-15);
});

it.each([
  [-2, 0.5, -0.4024013123385753], [-1, 1, -0.38171514630212616],
  [-4, -2, -3.7845774380253263], [1, 2, -1.9957982691807554],
  [8, 9, -35.01361859343715], [-40, -39, -765.0831565643776],
])("matches the reference log interval mass for [%s, %s]", (a, b, expected) => {
  expect(logGaussMass(a, b)).toBeCloseTo(expected, 12);
});

it("preserves mass for extremely narrow and wide standardized intervals", () => {
  const b = 1e-300;
  expect(logGaussMass(0, b)).toBeCloseTo(Math.log(b) - 0.5 * Math.log(2 * Math.PI), 12);
  expect(logGaussMass(-Infinity, Infinity)).toBeCloseTo(0, 15);
  expect(logGaussMass(0, Infinity)).toBe(-Math.LN2);
  expect(logGaussMass(1, 1)).toBe(-Infinity);
  expect(logNdtr(-Infinity)).toBe(-Infinity);
  expect(logNdtr(8)).toBeLessThan(0);
});

it("samples within the box with the expected truncated mean", () => {
  const count = 20000;
  const pdf = (z: number) => Math.exp(-0.5 * z ** 2) / Math.sqrt(2 * Math.PI);
  const mass = 0.3413447460685429; // Φ(1) − Φ(0)
  const mean = (pdf(0) - pdf(1)) / mass;
  const variance = 1 - pdf(1) / mass - mean ** 2;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const sample = truncnormPpf(randomSample(42, i), 0, 1);
    expect(sample).toBeGreaterThanOrEqual(0);
    expect(sample).toBeLessThanOrEqual(1);
    sum += sample;
  }
  expect(Math.abs(sum / count - mean)).toBeLessThan(3 * Math.sqrt(variance / count));
});

it.each(fixture.ppf)("matches Optuna inverse CDF for [$a, $b]", ({ a, b, q, values }) => {
  let previous = a;
  for (const [i, quantile] of q.entries()) {
    const actual = truncnormPpf(quantile, a, b);
    expect(Math.abs(actual - values[i]), `q=${quantile}, got ${actual}, expected ${values[i]}`).toBeLessThanOrEqual(1e-12);
    expect(actual).toBeGreaterThanOrEqual(previous);
    expect(actual).toBeLessThanOrEqual(b);
    previous = actual;
  }
});

it("resolves quantiles in intervals narrower than the spacing of the normal CDF", () => {
  expect(truncnormPpf(0.25, -1e-20, 1e-20)).toBe(-5e-21);
});
