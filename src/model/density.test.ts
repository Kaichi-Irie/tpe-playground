import { expect, it } from "vitest";
import { createDensity, createLogDensity, logDensity, logDensityGrid2D, sampleDensity } from "./density";

const parameters = [{ id: "x", low: -5, high: 5 }];
const samples = [{ id: 1, params: { x: -1 } }, { id: 2, params: { x: 1 } }];
const bandwidth = 0.4;

it("rejects missing, all-zero, negative, and non-finite observation weights", () => {
  for (const weights of [[], [0, 0], [-1, 2], [NaN, 1], [Infinity, 1]]) {
    expect(() => createDensity(parameters, samples, bandwidth, weights)).toThrow("Invalid density inputs");
  }
});

it("evaluates a zero-weight kernel as if it were omitted", () => {
  const weighted = createDensity(parameters, samples, bandwidth, [1, 0]);
  const remaining = createDensity(parameters, [samples[0]], bandwidth, [1]);
  for (const x of [-1, 0, 1]) {
    expect(logDensity(weighted, { x })).toBeCloseTo(logDensity(remaining, { x }), 12);
  }
});

it.each([0, 0.1, 0.5, 1, 5])("normalizes the one-dimensional mixture with prior weight %s", (priorWeight) => {
  const observed = createDensity(parameters, samples, bandwidth, [1, 1]);
  const broad = createDensity(parameters, [{ id: 1, params: { x: 0 } }], 10, [1]);
  const mixture = createDensity(parameters, samples, bandwidth, [1, 1], priorWeight);
  for (const x of [-5, 0, 5]) {
    const expected = (2 * Math.exp(logDensity(observed, { x })) + priorWeight * Math.exp(logDensity(broad, { x }))) / (2 + priorWeight);
    expect(Math.exp(logDensity(mixture, { x }))).toBeCloseTo(expected, 12);
  }

  const step = 0.002;
  let integral = 0;
  const evaluate = createLogDensity(mixture);
  for (let i = 0; i < 5000; i++) {
    const x = -5 + (i + 0.5) * step;
    integral += Math.exp(evaluate({ x })) * step;
  }
  expect(integral).toBeCloseTo(1, 8);
});

const jointParameters = [...parameters, { id: "y", low: 0, high: 6 }];
const jointSamples = [{ id: 1, params: { x: -5, y: 6 } }, { id: 2, params: { x: 0, y: 2 } }];

it("normalizes a one-dimensional mixture with edge and interior kernels", () => {
  const density = createDensity(parameters, jointSamples, 0.65, [2, 1], 0.5);
  const evaluate = createLogDensity(density);
  const step = 0.01;
  let integral = 0;
  for (let i = 0; i < 1000; i++) integral += Math.exp(evaluate({ x: -5 + (i + 0.5) * step })) * step;
  expect(integral).toBeCloseTo(1, 6);
  expect(density).toMatchObject({ normalization: "truncated-box", sampling: "truncated-components" });
});

it("normalizes a joint mixture with edge and interior kernels and preserves its analytic marginal", () => {
  const density = createDensity(jointParameters, jointSamples, 0.65, [2, 1], 0.5);
  const evaluate = createLogDensity(density);
  const step = 0.02;
  let integral = 0;
  for (let i = 0; i < 500; i++) {
    const x = -5 + (i + 0.5) * step;
    for (let j = 0; j < 300; j++) {
      const y = (j + 0.5) * step;
      integral += Math.exp(evaluate({ x, y })) * step ** 2;
    }
  }
  expect(integral).toBeCloseTo(1, 6);
  const marginal = createLogDensity(density, ["x"]);
  const oneDimensional = createLogDensity(createDensity(parameters, jointSamples, 0.65, [2, 1], 0.5));
  for (const x of [-5, -1, 0, 2, 5]) {
    expect(marginal({ x })).toBeCloseTo(oneDimensional({ x }), 12);
  }
});

it("assigns zero density outside the box for points, marginals, and grids", () => {
  const density = createDensity(jointParameters, jointSamples, 0.65, [2, 1]);
  expect(logDensity(density, { x: -5.01, y: 6 })).toBe(-Infinity);
  expect(logDensity(density, { x: -5, y: 6.01 })).toBe(-Infinity);
  expect(logDensity(density, { x: 5.01 }, ["x"])).toBe(-Infinity);
  const boundary = logDensity(density, { x: -5, y: 6 });
  expect(Number.isFinite(boundary)).toBe(true);
  expect(logDensityGrid2D(density, "y", [6, 6.01], "x", [-5.01, -5])).toEqual([
    [-Infinity, boundary], [-Infinity, -Infinity],
  ]);
});

it("retries each rejected coordinate without redrawing the component or accepted coordinates", () => {
  const density = createDensity(jointParameters, jointSamples, 1, [1, 1]);
  const radiusOne = Math.exp(-0.5);
  const draws = [0.25, radiusOne, 0.5, radiusOne, 0, radiusOne, 0, radiusOne, 0.5];
  let i = 0;
  expect(sampleDensity(density, () => {
    if (i >= draws.length) throw new Error("Unexpected extra draw.");
    return draws[i++];
  })).toEqual({ x: -4, y: 5 });
  expect(i).toBe(draws.length);
});
