import type { Play3DSceneItem, Play3DSurfaceLayer } from "./Play3DCanvas";
import type { TwoParamSurfaceVertex } from "./twoParamSurfaceMesh";

interface TwoParamSurfaceTriangle {
  id: string;
  a: number;
  b: number;
  c: number;
  inspect: () => void;
  muted?: boolean;
}
interface TwoParamPreparedSurface {
  vertices: TwoParamSurfaceVertex[];
  triangles: TwoParamSurfaceTriangle[];
  layer: Play3DSurfaceLayer;
}
export interface TwoParamProjectedPoint { x: number; y: number; depth: number }

// Topology, centroids and inspection callbacks depend on the mesh, not camera.
export function prepareTwoParamSurface(mesh: TwoParamSurfaceVertex[][], layer: Play3DSurfaceLayer, inspect: (x1: number, x2: number) => void, feasible?: (x1: number, x2: number) => boolean): TwoParamPreparedSurface {
  const vertices = mesh.flat();
  const offsets: number[] = [];
  let offset = 0;
  for (const row of mesh) { offsets.push(offset); offset += row.length; }
  const triangles: TwoParamSurfaceTriangle[] = [];
  for (let i = 0; i < mesh.length - 1; i++) for (let j = 0; j < mesh[i].length - 1; j++) {
    const corners = [offsets[i] + j, offsets[i + 1] + j, offsets[i + 1] + j + 1, offsets[i] + j + 1];
    for (const [part, indices] of [[0, [0, 1, 2]], [1, [0, 2, 3]]] as const) {
      const [a, b, c] = indices.map((k) => corners[k]);
      const x1 = (vertices[a].x1 + vertices[b].x1 + vertices[c].x1) / 3;
      const x2 = (vertices[a].x2 + vertices[b].x2 + vertices[c].x2) / 3;
      triangles.push({ id: `${layer}-${i}-${j}-${part}`, a, b, c, muted: feasible && !feasible(x1, x2), inspect: () => inspect(x1, x2) });
    }
  }
  return { vertices, triangles, layer };
}

// Each shared vertex is projected once; triangles reference the projected values.
export function projectTwoParamSurface(surface: TwoParamPreparedSurface, project: (x1: number, x2: number, height: number) => TwoParamProjectedPoint): Play3DSceneItem[] {
  const points = surface.vertices.map((p) => project(p.x1, p.x2, p.height));
  return surface.triangles.map(({ id, a, b, c, inspect, muted }) => ({
    id, inspect, muted, kind: "triangle", layer: surface.layer,
    depth: (points[a].depth + points[b].depth + points[c].depth) / 3,
    points: [points[a].x, points[a].y, points[b].x, points[b].y, points[c].x, points[c].y],
  }));
}
