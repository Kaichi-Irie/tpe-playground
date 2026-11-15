import { describe, expect, it } from "vitest";
import { createObjectiveView2D } from "./objectiveView2D";
import { prepareSurface2D, projectSurface2D, type ProjectedPoint2D } from "./projectSurface2D";
import { surfaceMesh2D, type SurfaceVertex2D } from "./surfaceMesh2D";

// Independent reference: the original per-triangle calculation. Require exact
// coordinates/depth (not a tolerance) to guard rounding and painter-order changes.
function reference(mesh: SurfaceVertex2D[][], project: (x: number, y: number, z: number) => ProjectedPoint2D) {
  const result = [];
  for (let i = 0; i < mesh.length - 1; i++) for (let j = 0; j < mesh[i].length - 1; j++) {
    const corners = [mesh[i][j], mesh[i + 1][j], mesh[i + 1][j + 1], mesh[i][j + 1]];
    for (const indices of [[0, 1, 2], [0, 2, 3]]) {
      const points = indices.map((k) => project(corners[k].x1, corners[k].x2, corners[k].height));
      result.push({ path: `M${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("L")}Z`,
        depth: points.reduce((sum, p) => sum + p.depth, 0) / 3 });
    }
  }
  return result;
}

describe("prepared surface projection", () => {
  for (const preset of ["multimodal", "quadratic", "rosenbrock"] as const) {
    it(`preserves exact ${preset} geometry at multiple angles, scales and detail levels`, () => {
      const view = createObjectiveView2D(preset);
      for (const scale of ["linear", "log"] as const) for (const stride of [1, 2, 4]) {
        const mesh = surfaceMesh2D(view.grid, stride, (p) => 0.25 + 0.75 * view.normalize(p.objective, scale));
        const prepared = prepareSurface2D(mesh, "objective", () => {});
        for (const [yaw, pitch, zoom] of [[-0.65, 0.5, 1], [2.7, 0.15, 1.7], [-3.1, 1.4, 0.55]]) {
          const project = (x: number, y: number, height: number) => {
            const u = x * Math.cos(yaw) - y * Math.sin(yaw);
            const v = x * Math.sin(yaw) + y * Math.cos(yaw), z = height * 4;
            return { x: 500 + u * 48 * zoom, y: 350 + (v * Math.sin(pitch) - z * Math.cos(pitch)) * 48 * zoom, depth: v * Math.cos(pitch) + z * Math.sin(pitch) };
          };
          expect(projectSurface2D(prepared, project).map(({ path, depth }) => ({ path, depth }))).toEqual(reference(mesh, project));
        }
      }
    });
  }
  it("projects shared vertices once and preserves inspection centroids", () => {
    const mesh = [[{ x1: -5, x2: -5, height: 0 }, { x1: -5, x2: 5, height: 1 }],
      [{ x1: 5, x2: -5, height: 0.5 }, { x1: 5, x2: 5, height: 0.25 }]];
    const inspected: number[][] = [];
    const prepared = prepareSurface2D(mesh, "good", (x, y) => inspected.push([x, y]));
    let calls = 0;
    const result = projectSurface2D(prepared, (x, y, depth) => { calls++; return { x, y, depth }; });
    result.forEach((item) => item.inspect());
    expect(calls).toBe(4);
    expect(inspected).toEqual([[5 / 3, -5 / 3], [-5 / 3, 5 / 3]]);
    expect(result.map((item) => item.id)).toEqual(["good-0-0-0", "good-0-0-1"]);
    expect(projectSurface2D(prepareSurface2D([], "good", () => {}), () => { throw new Error("Empty mesh"); })).toEqual([]);
  });
});
