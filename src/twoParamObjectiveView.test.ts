import { expect, it } from "vitest";
import { createTwoParamObjectiveView } from "./twoParamObjectiveView";
import { getTwoParamObjective } from "./twoParamTpe";

it("samples the actual minimum and resolves the innermost bowl contours", () => {
  for (const preset of ["quadratic", "multimodal"] as const) {
    const view = createTwoParamObjectiveView(preset);
    const objective = getTwoParamObjective(preset);
    const minimum = view.grid.flat().find((point) => point.x1 === view.optimum.x1 && point.x2 === view.optimum.x2);
    expect(minimum?.objective).toBe(view.low);
    for (const level of view.levels.slice(0, 3)) {
      const points = view.contours.filter((segment) => segment.level === level).flatMap((segment) => [segment.a, segment.b]);
      expect(points.length).toBeGreaterThan(12);
      expect(Math.min(...points.map((p) => p.x1))).toBeLessThan(view.optimum.x1);
      expect(Math.max(...points.map((p) => p.x1))).toBeGreaterThan(view.optimum.x1);
      expect(Math.min(...points.map((p) => p.x2))).toBeLessThan(view.optimum.x2);
      expect(Math.max(...points.map((p) => p.x2))).toBeGreaterThan(view.optimum.x2);
      // Check original values, not the interpolated level stored on each vertex.
      for (const point of points) {
        expect(Math.abs(objective.evaluate(point.x1, point.x2) - level) / (level - view.low)).toBeLessThan(0.2);
      }
    }
  }
});

it("resolves closed Rosenbrock contours around (1, 1) in original function values", () => {
  const view = createTwoParamObjectiveView("rosenbrock");
  expect(view.optimum).toEqual({ x1: 1, x2: 1, value: 0 });
  expect(view.levels[0]).toBe(0.0001);
  for (const segment of view.contours) for (const point of [segment.a, segment.b]) {
    expect(getTwoParamObjective("rosenbrock").evaluate(point.x1, point.x2)).toBeCloseTo(segment.level, 10);
    expect(Math.abs(point.x1)).toBeLessThanOrEqual(5);
    expect(Math.abs(point.x2)).toBeLessThanOrEqual(5);
  }
  const inner = view.contours.filter((segment) => segment.level === 0.0001).flatMap((segment) => [segment.a, segment.b]);
  expect(Math.min(...inner.map((point) => point.x1))).toBeLessThan(1);
  expect(Math.max(...inner.map((point) => point.x1))).toBeGreaterThan(1);
  expect(Math.min(...inner.map((point) => point.x2))).toBeLessThan(1);
  expect(Math.max(...inner.map((point) => point.x2))).toBeGreaterThan(1);
  for (const row of view.grid) {
    const valley = row[16];
    expect(valley.x2).toBe(Math.min(5, valley.x1 ** 2));
    expect(row[0].x2).toBe(-5);
    expect(row.at(-1)!.x2).toBe(5);
  }
});

it("keeps both height scales finite, ordered, and anchored at the same optimum", () => {
  for (const preset of ["rosenbrock", "quadratic", "multimodal"] as const) {
    const view = createTwoParamObjectiveView(preset);
    expect(getTwoParamObjective(preset).evaluate(view.optimum.x1, view.optimum.x2)).toBe(view.optimum.value);
    for (const scale of ["linear", "log"] as const) {
      expect(view.normalize(view.low, scale)).toBe(0);
      expect(view.normalize(view.high, scale)).toBeCloseTo(1, 12);
      const values = [view.low, ...view.levels, view.high].sort((a, b) => a - b).map((value) => view.normalize(value, scale));
      expect(values.every(Number.isFinite)).toBe(true);
      expect(values).toEqual([...values].sort((a, b) => a - b));
    }
    expect(view.normalize(view.low + (view.high - view.low) / 10, "linear")).toBeCloseTo(0.1, 12);
    expect(view.normalize(view.low + view.softening, "log")).toBeGreaterThan(view.normalize(view.low + view.softening, "linear"));
  }
});
