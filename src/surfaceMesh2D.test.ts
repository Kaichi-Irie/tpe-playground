import { expect, it } from "vitest";
import { surfaceMesh2D, mergeDepthSorted } from "./surfaceMesh2D";
import { createObjectiveView2D } from "./objectiveView2D";

it("keeps the domain edges and original heights even with an uneven stride", () => {
  const grid = Array.from({ length: 8 }, (_, x1) => Array.from({ length: 6 }, (_, x2) => ({ x1, x2, value: x1 + x2 })));
  const copy = structuredClone(grid);
  const mesh = surfaceMesh2D(grid, 3, (p) => p.value / 12);
  expect(mesh.map((row) => row[0].x1)).toEqual([0, 3, 6, 7]);
  expect(mesh[0].map((p) => p.x2)).toEqual([0, 3, 5]);
  for (const row of mesh) for (const p of row) expect(p.height).toBe((p.x1 + p.x2) / 12);
  expect(grid).toEqual(copy);
  for (const stride of [0, -1, 1.5, Infinity]) expect(() => surfaceMesh2D(grid, stride, (p) => p.value)).toThrow();
});

it("retains the Rosenbrock valley and optimum in the coarse rotation mesh", () => {
  const view = createObjectiveView2D("rosenbrock");
  for (const stride of [2, 4]) {
    const mesh = surfaceMesh2D(view.grid, stride, (p) => p.objective);
    for (const row of mesh) expect(row.some((p) => p.x2 === Math.min(5, p.x1 ** 2))).toBe(true);
    expect(mesh.flat().find((p) => p.x1 === 1 && p.x2 === 1)?.height).toBe(0);
  }
});

it("merges static and changing geometry with the same stable painter order as sorting", () => {
  const fixed = [-10, 0, 0, 3, Infinity].map((depth, id) => ({ depth, id: `fixed-${id}` }));
  const changing = [-20, 0, 1, 2, 20, Infinity].map((depth, id) => ({ depth, id: `changing-${id}` }));
  expect(mergeDepthSorted(fixed, changing)).toEqual([...fixed, ...changing].sort((a, b) => a.depth - b.depth));
  expect(mergeDepthSorted([], changing)).toEqual(changing);
  expect(mergeDepthSorted(fixed, [])).toEqual(fixed);
});
