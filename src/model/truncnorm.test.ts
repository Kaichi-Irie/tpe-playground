import { expect, it } from "vitest";
import { createRandom } from "./engine";
import { erf, logGaussMass, logNdtr, sampleTruncatedNormal } from "./truncnorm";

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
  const random = createRandom(42, 0);
  const pdf = (z: number) => Math.exp(-0.5 * z ** 2) / Math.sqrt(2 * Math.PI);
  const mass = 0.3413447460685429; // Φ(1) − Φ(0)
  const mean = (pdf(0) - pdf(1)) / mass;
  const variance = 1 - pdf(1) / mass - mean ** 2;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const sample = sampleTruncatedNormal(0, 1, 0, 1, random);
    expect(sample).toBeGreaterThanOrEqual(0);
    expect(sample).toBeLessThanOrEqual(1);
    sum += sample;
  }
  expect(Math.abs(sum / count - mean)).toBeLessThan(3 * Math.sqrt(variance / count));
});

it("bounds rejection attempts for pathological draws", () => {
  expect(() => sampleTruncatedNormal(0, 1, 0, 1, () => 0)).toThrow("Could not sample within the domain");
});
