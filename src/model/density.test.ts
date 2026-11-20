import { expect, it } from "vitest";
import { createDensity, logDensity } from "./density";

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

  const step = 0.05;
  let integral = 0;
  for (let i = 0; i < 4000; i++) {
    const x = -100 + (i + 0.5) * step;
    integral += Math.exp(logDensity(mixture, { x })) * step;
  }
  expect(integral).toBeCloseTo(1, 8);
});

it("normalizes a joint density on the plane with a kernel at the viewing boundary", () => {
  const center = { x: -5, y: 5 };
  const density = createDensity(
    [...parameters, { id: "y", low: -5, high: 5 }],
    [{ id: 1, params: center }, { id: 2, params: { x: 0, y: 0 } }],
    0.65,
    [1, 1],
  );
  const step = 0.1;
  let integral = 0;
  for (let i = 0; i < 180; i++) {
    const x = -9 + (i + 0.5) * step;
    for (let j = 0; j < 180; j++) {
      const y = -9 + (j + 0.5) * step;
      integral += Math.exp(logDensity(density, { x, y })) * step ** 2;
    }
  }
  expect(integral).toBeCloseTo(1, 6);
  expect(Math.exp(logDensity(density, center))).toBeGreaterThan(0);
});
