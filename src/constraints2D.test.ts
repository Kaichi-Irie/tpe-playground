import { expect, it } from "vitest";
import { constrainedOptima2D, violation } from "./constraints2D";
import { findObjectiveOptimum2D, getObjective2D, objectivePresets2D, type ObjectivePreset2D } from "./tpe2d";

for (const preset of Object.keys(constrainedOptima2D) as (keyof typeof constrainedOptima2D)[]) {
  it(`matches the objective formulas and bounds feasible grid minima for ${preset}`, () => {
    const feasibleGrid: [number, number][] = [];
    for (let i = 0; i <= 400; i++) for (let j = 0; j <= 400; j++) {
      const x1 = -5 + i / 40, x2 = -5 + j / 40;
      if (violation(x1, x2, preset) === 0) feasibleGrid.push([x1, x2]);
    }
    expect(feasibleGrid.length).toBeGreaterThan(0);
    for (const objective of Object.keys(objectivePresets2D) as ObjectivePreset2D[]) {
      const { evaluate } = getObjective2D(objective);
      const optimum = findObjectiveOptimum2D(objective, preset);
      expect(violation(optimum.x1, optimum.x2, preset)).toBeLessThanOrEqual(1e-9);
      const value = evaluate(optimum.x1, optimum.x2);
      expect(Math.abs(value - optimum.value) / optimum.value).toBeLessThan(1e-9);
      const gridMinimum = feasibleGrid.reduce((best, [x1, x2]) => Math.min(best, evaluate(x1, x2)), Infinity);
      expect(optimum.value).toBeLessThanOrEqual(gridMinimum + 1e-12);
    }
  });
}
