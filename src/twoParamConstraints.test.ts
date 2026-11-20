import { expect, it } from "vitest";
import { twoParamConstrainedOptima, violation } from "./twoParamConstraints";
import { findTwoParamObjectiveOptimum, getTwoParamObjective, twoParamObjectivePresets, type TwoParamObjectivePreset } from "./twoParamTpe";

for (const preset of Object.keys(twoParamConstrainedOptima) as (keyof typeof twoParamConstrainedOptima)[]) {
  it(`matches the objective formulas and bounds feasible grid minima for ${preset}`, () => {
    const feasibleGrid: [number, number][] = [];
    for (let i = 0; i <= 400; i++) for (let j = 0; j <= 400; j++) {
      const x1 = -5 + i / 40, x2 = -5 + j / 40;
      if (violation(x1, x2, preset) === 0) feasibleGrid.push([x1, x2]);
    }
    expect(feasibleGrid.length).toBeGreaterThan(0);
    for (const objective of Object.keys(twoParamObjectivePresets) as TwoParamObjectivePreset[]) {
      const { evaluate } = getTwoParamObjective(objective);
      const optimum = findTwoParamObjectiveOptimum(objective, preset);
      expect(violation(optimum.x1, optimum.x2, preset)).toBeLessThanOrEqual(1e-9);
      const value = evaluate(optimum.x1, optimum.x2);
      expect(Math.abs(value - optimum.value) / optimum.value).toBeLessThan(1e-9);
      const gridMinimum = feasibleGrid.reduce((best, [x1, x2]) => Math.min(best, evaluate(x1, x2)), Infinity);
      expect(optimum.value).toBeLessThanOrEqual(gridMinimum + 1e-12);
    }
  });
}
