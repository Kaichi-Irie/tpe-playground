import { describe, expect, it } from "vitest";
import { logDensity } from "./density";
import { fitTpe } from "./engine";
import type { Point } from "../types";
import { createFieldEvaluator, evaluateFieldGrid2D, type Projection } from "./visualization";
import { twoParamConfig, emptyTwoParamPlayback, moveTwoParamPlayback, twoParamObservations, twoParamProblem } from "../../twoParamTpe";

describe("shared visualization evaluation", () => {
  it("matches point evaluation on Cartesian grids, including narrow peaks, tails and reversed axes", () => {
    for (const mode of ["multivariate", "univariate"] as const) for (const bandwidthRule of ["constant", "scott"] as const) for (const priorWeight of [0, 0.5]) {
      const model = fitTpe(twoParamProblem, twoParamObservations(moveTwoParamPlayback(emptyTwoParamPlayback(), 40, 42, mode, { startupTrials: 40 }).trials), twoParamConfig(mode, { bandwidth: 0.01, bandwidthRule, priorWeight, weights: "ei" }));
      const evaluate = createFieldEvaluator(model, { axes: ["x1", "x2"], projection: { kind: "full" } });
      for (const [xId, yId] of [["x1", "x2"], ["x2", "x1"]]) {
        const xs = [-1000, -5, -0.91, 0, 5, 1000], ys = [-5, -0.12, 0, 5];
        const grid = evaluateFieldGrid2D(model, xId, xs, yId, ys);
        xs.forEach((x, i) => ys.forEach((y, j) => expect(grid[i][j]).toEqual(evaluate({ [xId]: x, [yId]: y }))));
      }
      expect(() => evaluateFieldGrid2D(model, "x1", [NaN], "x2", [0])).toThrow();
      expect(() => evaluateFieldGrid2D(model, "x1", [0], "x1", [0])).toThrow();
      expect(() => evaluateFieldGrid2D(model, "unknown", [0], "x2", [0])).toThrow();
    }
  });
  for (const mode of ["multivariate", "univariate"] as const) {
    it(`preserves full, slice and marginal fields for ${mode} models`, () => {
      const model = fitTpe(twoParamProblem, twoParamObservations(moveTwoParamPlayback(emptyTwoParamPlayback(), 20, 42, mode, { startupTrials: 20 }).trials), twoParamConfig(mode, { priorWeight: 0.5, bandwidthRule: "scott" }));
      const requests: { axes: string[]; projection: Projection }[] = [
        { axes: ["x1", "x2"], projection: { kind: "full" } },
        { axes: ["x1"], projection: { kind: "slice", fixed: { x2: 0 } } },
        { axes: ["x1"], projection: { kind: "marginal" } },
      ];
      for (const request of requests) {
        const evaluate = createFieldEvaluator(model, request);
        for (const x1 of [-5, 0, 5, 1000]) {
          const point: Point = request.axes.length === 2 ? { x1, x2: 5 } : { x1 };
          const coordinates = request.projection.kind === "slice" ? { ...point, ...request.projection.fixed } : point;
          let logL = 0, logG = 0;
          for (const group of model.snapshot.groups) {
            const axes = request.projection.kind === "marginal" ? group.parameterIds.filter((id) => request.axes.includes(id)) : group.parameterIds;
            logL += logDensity(group.good, coordinates, axes);
            logG += logDensity(group.bad, coordinates, axes);
          }
          const actual = evaluate(point);
          expect(actual["good-density"]).toBeCloseTo(Math.exp(logL), 12);
          expect(actual["bad-density"]).toBeCloseTo(Math.exp(logG), 12);
          if (x1 > 5) {
            expect(actual).toEqual({ "good-density": 0, "bad-density": 0, "log-ratio": NaN });
          } else {
            expect(actual["log-ratio"]).toBeCloseTo(logL - logG, 12);
            expect(Number.isFinite(actual["log-ratio"])).toBe(true);
          }
        }
        expect(() => evaluate({ x1: NaN, x2: 0 })).toThrow();
        expect(() => evaluate({})).toThrow();
      }
      expect(() => createFieldEvaluator(model, { axes: ["unknown"], projection: { kind: "marginal" } })).toThrow();
      expect(() => createFieldEvaluator(model, { axes: ["x1", "x1"], projection: { kind: "full" } })).toThrow();
    });
  }
});
