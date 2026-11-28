import { expect, it } from "vitest";
import { getSampler, samplerList, samplers, samplersForPage, supportsConstraints, type SamplerId } from "./samplers";

it("lists samplers in display order for each supported page", () => {
  expect(samplerList).toEqual([samplers.tpe, samplers.cmaes, samplers.gp]);
  expect(samplersForPage("play-2d")).toEqual([samplers.tpe, samplers.gp]);
  expect(samplersForPage("play-3d")).toEqual([samplers.tpe, samplers.cmaes]);
});

it.each([
  ["tpe", "TPE", "TPE", true, "blue"],
  ["cmaes", "CMA-ES", "CMA", false, "green"],
  ["gp", "GP", "GP", false, "purple"],
] as const)("provides the label, constraint support, and color for %s", (id, label, shortLabel, constraints, colorName) => {
  const samplerId: SamplerId = id;
  expect(getSampler(samplerId)).toMatchObject({ id, label, shortLabel, colorName, colorToken: `--sampler-${id}` });
  expect(supportsConstraints(samplerId)).toBe(constraints);
});
