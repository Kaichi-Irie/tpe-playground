import { expect, it } from "vitest";
import { logNdtr, normalCdf, normalPdf } from "./normal";

it("evaluates the standard normal density", () => {
  expect(normalPdf(0)).toBeCloseTo(0.3989422804014327, 15);
  expect(normalPdf(1)).toBeCloseTo(0.24197072451914337, 15);
  expect(normalPdf(-1)).toBe(normalPdf(1));
  expect(normalPdf(-Infinity)).toBe(0);
  expect(normalPdf(Infinity)).toBe(0);
});

it("evaluates the cumulative probability and its reflection", () => {
  expect(normalCdf(0)).toBe(0.5);
  expect(normalCdf(1)).toBeCloseTo(0.8413447460685429, 15);
  for (const z of [0.5, 1, 2, 5]) {
    expect(normalCdf(z) + normalCdf(-z)).toBe(1);
  }
  expect(normalCdf(-Infinity)).toBe(0);
  expect(normalCdf(Infinity)).toBe(1);
});

it("retains small left-tail probabilities and agrees with the log CDF", () => {
  expect(normalCdf(-10) / 7.61985302416047e-24).toBeCloseTo(1, 13);
  for (const z of [-30, -20, -10, -1, 0, 1, 10]) {
    expect(normalCdf(z) / Math.exp(logNdtr(z))).toBeCloseTo(1, 12);
  }
});
