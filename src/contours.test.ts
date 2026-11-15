import { expect, it } from "vitest";
import { objectiveContours } from "./contours";

it("interpolates contour crossings on a plane without degenerate segments", () => {
  const grid = Array.from({ length: 3 }, (_, x1) => Array.from({ length: 3 }, (_, x2) => ({ x1, x2, objective: x1 + x2 })));
  const segments = objectiveContours(grid, [0, 0.5, 1, 2, 3.5, 4, 5]);
  expect(segments.length).toBeGreaterThan(0);
  for (const { level, a, b } of segments) {
    expect(a.x1 + a.x2).toBeCloseTo(level, 12);
    expect(b.x1 + b.x2).toBeCloseTo(level, 12);
    expect(a).not.toEqual(b);
    for (const point of [a, b]) expect(Object.values(point).every(Number.isFinite)).toBe(true);
  }
  expect(segments.some((segment) => segment.level === 5)).toBe(false);
});

it("handles constant cells and retains isolated contours inside a bowl", () => {
  const grid = Array.from({ length: 3 }, (_, i) => Array.from({ length: 3 }, (_, j) => ({ x1: i - 1, x2: j - 1, objective: (i - 1) ** 2 + (j - 1) ** 2 })));
  const segments = objectiveContours(grid, [0.5]);
  expect(segments.length).toBeGreaterThan(0);
  for (const { a, b } of segments) for (const point of [a, b]) {
    expect(Math.abs(point.x1)).toBeLessThan(1);
    expect(Math.abs(point.x2)).toBeLessThan(1);
  }
  expect(objectiveContours(grid.map((row) => row.map((point) => ({ ...point, objective: 1 }))), [1])).toEqual([]);
});
