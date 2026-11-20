import { expect, it } from "vitest";
import { optunaPreset } from "../searchSettings";
import { logDensity } from "./density";
import { fitTpe } from "./engine";
import fixture from "./fixtures/optuna-5.1-parity.json";
import type { DensityMode, Observation, Point, Problem } from "./types";

interface ReferenceCase {
  name: string;
  mode: DensityMode;
  problem: Problem;
  trials: Observation[];
  goodIds: number[];
  badIds: number[];
  points: Point[];
  groups: {
    parameterIds: string[];
    good: ReferenceDensity;
    bad: ReferenceDensity;
  }[];
}

interface ReferenceDensity {
  kernels: { trialId: number | null; center: Point; bandwidths: Point; mixtureWeight: number }[];
  logPdf: number[];
}

const cases = fixture.cases as ReferenceCase[];

it.each(cases)("matches Optuna 5.1.0 for $name", ({ mode, problem, trials, goodIds, badIds, points, groups }) => {
  const fitted = fitTpe(problem, trials, { bandwidth: 0.4, mode, ...optunaPreset });
  const { snapshot } = fitted;
  expect(snapshot.partition.good.map(({ trialId }) => trialId)).toEqual(goodIds);
  expect(snapshot.partition.bad.map(({ trialId }) => trialId)).toEqual(badIds);
  expect(snapshot.groups).toHaveLength(groups.length);

  for (const [index, reference] of groups.entries()) {
    const group = snapshot.groups[index];
    expect(group.parameterIds).toEqual(reference.parameterIds);
    for (const key of ["good", "bad"] as const) {
      const density = group[key];
      const expected = reference[key];
      expect(density.kernels).toHaveLength(expected.kernels.length);
      for (const [i, kernel] of density.kernels.entries()) {
        const wanted = expected.kernels[i];
        expect(kernel.source.kind === "observation" ? kernel.source.trialId : null).toBe(wanted.trialId);
        expect(Math.abs(kernel.mixtureWeight - wanted.mixtureWeight)).toBeLessThanOrEqual(1e-12);
        for (const id of group.parameterIds) {
          expect(Math.abs(kernel.center[id] - wanted.center[id])).toBeLessThanOrEqual(1e-12);
          expect(Math.abs(kernel.bandwidths[id] - wanted.bandwidths[id])).toBeLessThanOrEqual(1e-12);
        }
      }
      for (const [i, point] of points.entries()) {
        expect(Math.abs(logDensity(density, point) - expected.logPdf[i])).toBeLessThanOrEqual(1e-9);
      }
    }
  }

  const evaluations = fitted.evaluate(points);
  for (const [i, { logL, logG }] of evaluations.entries()) {
    const expectedL = groups.reduce((sum, group) => sum + group.good.logPdf[i], 0);
    const expectedG = groups.reduce((sum, group) => sum + group.bad.logPdf[i], 0);
    expect(Math.abs(logL - expectedL)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(logG - expectedG)).toBeLessThanOrEqual(1e-9);
  }
});
