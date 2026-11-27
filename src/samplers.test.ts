import { expect, it } from "vitest";
import { getSampler, samplerList, samplers, samplersForPage, supportsConstraints, type SamplerId } from "./samplers";
import type { TwoParamSampler } from "./twoParamCmaEs";

it("lists samplers in display order for each supported page", () => {
  expect(samplerList).toEqual([samplers.tpe, samplers.cmaes]);
  expect(samplersForPage("play-2d")).toEqual([samplers.tpe]);
  expect(samplersForPage("play-3d")).toEqual(samplerList);
});

it.each([
  ["tpe", "TPE", "TPE", true, "blue"],
  ["cmaes", "CMA-ES", "CMA", false, "green"],
] as const)("provides the label, constraint support, and color for %s", (id, label, shortLabel, constraints, colorName) => {
  const legacyId: TwoParamSampler = id;
  const samplerId: SamplerId = legacyId;
  expect(getSampler(samplerId)).toMatchObject({ id, label, shortLabel, colorName, colorToken: `--sampler-${id}` });
  expect(supportsConstraints(samplerId)).toBe(constraints);
});
