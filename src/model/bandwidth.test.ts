import { expect, it } from "vitest";
import { resolveBandwidth, type BandwidthRule } from "./bandwidth";
import { fitModel1D, runSearch, defaults } from "../tpe";
import { logDensity } from "./density";

it("matches Scott and robust Silverman formulas with interpolated quartiles", () => {
  const samples = [0, 1, 2, 3, 4];
  const sd = Math.sqrt(2.5);
  expect(resolveBandwidth(samples, "scott", 0.4, 4)).toBeCloseTo(sd * 5 ** -0.2, 12);
  expect(resolveBandwidth(samples, "silverman", 0.4, 4)).toBeCloseTo(0.9 * (2 / 1.34) * 5 ** -0.2, 12);
  const outlier = [0, 1, 2, 3, 100];
  expect(resolveBandwidth(outlier, "silverman", 0.4, 100)).toBeLessThan(resolveBandwidth(outlier, "scott", 0.4, 100));
  expect(samples).toEqual([0, 1, 2, 3, 4]);
});

it("handles empty, singleton, coincident and nearly coincident observations", () => {
  for (const rule of ["scott", "silverman"] as const) {
    for (const samples of [[], [0], [2, 2, 2], [0, 0, 0, 0, 1], [0, 1e-12]]) {
      const width = resolveBandwidth(samples, rule, 0.4, 10);
      expect(Number.isFinite(width)).toBe(true);
      expect(width).toBeGreaterThanOrEqual(10 / Math.min(100, 1 + samples.length));
      expect(width).toBeLessThanOrEqual(10);
    }
    expect(resolveBandwidth([0, 1e-12], rule, 0.4, 10)).toBe(10 / 3);
    expect(resolveBandwidth([0], rule, 0.4, 10, true)).toBe(10 / 3);
    expect(resolveBandwidth([0, 0], rule, 0.4, 10, true)).toBe(2.5);
    expect(resolveBandwidth(Array.from({ length: 200 }, () => 0), rule, 0.4, 10)).toBe(0.1);
    expect(resolveBandwidth([-100, 100], rule, 0.4, 10)).toBe(10);
  }
  expect(resolveBandwidth([0], "constant", 0.4, 10)).toBe(0.4);
  expect(() => resolveBandwidth([NaN], "scott", 0.4, 10)).toThrow();
  expect(() => resolveBandwidth([], "scott", 0.4, 0)).toThrow();
  expect(() => resolveBandwidth([], "scott", -1, 10)).toThrow();
  expect(() => resolveBandwidth([], "unknown" as BandwidthRule, 0.4, 10)).toThrow();
});

it("fits separate normalized group widths and leaves the prior width unchanged", () => {
  const trials = [-0.1, 0, 0.1, -5, 0, 5].map((x, i) => ({ id: i + 1, x, y: i }));
  for (const bandwidthRule of ["scott", "silverman"] as const) {
    const fitted = fitModel1D(trials, 1, { ...defaults, gamma: 0.34, bandwidthRule });
    const group = fitted.snapshot.groups[0];
    expect(group.good.kernels[0].bandwidths.x).toBeLessThan(group.bad.kernels[0].bandwidths.x);
    for (const density of [group.good, group.bad]) {
      const widths = density.kernels.filter((k) => k.source.kind === "observation").map((k) => k.bandwidths.x);
      expect(new Set(widths).size).toBe(1);
      expect(density.kernels.at(-1)?.bandwidths.x).toBe(10);
      let integral = 0;
      for (let x = -100; x < 100; x += 0.01) integral += Math.exp(logDensity(density, { x: x + 0.005 })) * 0.01;
      expect(integral).toBeCloseTo(1, 8);
    }
    expect(fitted.propose(42)).toEqual(fitted.propose(42));
    const repeated = runSearch(42, 25, 1, { ...defaults, bandwidthRule });
    expect(repeated).toEqual(runSearch(42, 25, 1, { ...defaults, bandwidthRule }));
    expect(repeated.trials.every((trial) => trial.x >= -5 && trial.x <= 5)).toBe(true);
  }
});

it("clips the singleton-to-two-observation Scott transition at a 10% good split", () => {
  const config = { ...defaults, gamma: 0.1, bandwidthRule: "scott" as const };
  const trials = runSearch(50, 11, 1, config).trials;
  const before = fitModel1D(trials.slice(0, 10), 1, config).snapshot.groups[0].good;
  const after = fitModel1D(trials, 1, config).snapshot.groups[0].good;
  const positions = after.kernels.filter((kernel) => kernel.source.kind === "observation").map((kernel) => kernel.center.x);
  expect(before.kernels.filter((kernel) => kernel.source.kind === "observation")).toHaveLength(1);
  expect(positions).toHaveLength(2);
  expect(before.kernels[0].bandwidths.x).toBeCloseTo(10 / 3, 12);
  expect(after.kernels[0].bandwidths.x).toBe(2.5);
});

it("fits coordinate-wise adaptive widths in both 2D modes, preserving normalization and prior", async () => {
  const { fitTpe } = await import("./engine");
  const { config2D, problem2D } = await import("../tpe2d");
  const observations = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, params: { x1: i < 6 ? -5 + i * 2 : 0, x2: i < 6 ? 0 : -5 + (i - 6) * 2 }, objectives: [i], constraints: [] }));
  for (const mode of ["multivariate", "univariate"] as const) {
    for (const bandwidthRule of ["scott", "silverman"] as const) {
      const model = fitTpe(problem2D, observations, { ...config2D(mode), gamma: 0.5, priorWeight: 1, bandwidthRule });
      const goodWidths = Object.assign({}, ...model.snapshot.groups.map((g) => g.good.kernels[0].bandwidths));
      const badWidths = Object.assign({}, ...model.snapshot.groups.map((g) => g.bad.kernels[0].bandwidths));
      expect(goodWidths.x1).toBeGreaterThan(goodWidths.x2);
      expect(badWidths.x2).toBeGreaterThan(badWidths.x1);
      expect(goodWidths.x2).toBeCloseTo(10 / 8, 12);
      for (const group of model.snapshot.groups) for (const density of [group.good, group.bad]) {
        expect(density.kernels.at(-1)?.bandwidths).toEqual(Object.fromEntries(group.parameterIds.map((id) => [id, 10])));
        // Integrate every marginal over essentially the full Gaussian support.
        for (const id of group.parameterIds) {
          let integral = 0;
          for (let x = -100; x < 100; x += 0.1) integral += Math.exp(logDensity(density, { [id]: x + 0.05 }, [id])) * 0.1;
          expect(integral).toBeCloseTo(1, 8);
        }
      }
      const proposal = model.propose(42);
      expect(proposal).toEqual(model.propose(42));
      expect(Object.values(proposal.selected).every((value) => value >= -5 && value <= 5)).toBe(true);
    }
  }
});
