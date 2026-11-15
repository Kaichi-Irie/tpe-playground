import type { SurfaceVertex2D } from "./surfaceMesh2D";

interface SurfaceTriangle2D {
  id: string;
  a: number;
  b: number;
  c: number;
  inspect: () => void;
}
export interface PreparedSurface2D {
  vertices: SurfaceVertex2D[];
  triangles: SurfaceTriangle2D[];
  className: string;
}
export interface ProjectedPoint2D { x: number; y: number; depth: number }

// Topology, centroids and inspection callbacks depend on the mesh, not camera.
export function prepareSurface2D(mesh: SurfaceVertex2D[][], key: string, inspect: (x1: number, x2: number) => void): PreparedSurface2D {
  const vertices = mesh.flat();
  const offsets: number[] = [];
  let offset = 0;
  for (const row of mesh) { offsets.push(offset); offset += row.length; }
  const triangles: SurfaceTriangle2D[] = [];
  for (let i = 0; i < mesh.length - 1; i++) for (let j = 0; j < mesh[i].length - 1; j++) {
    const corners = [offsets[i] + j, offsets[i + 1] + j, offsets[i + 1] + j + 1, offsets[i] + j + 1];
    for (const [part, indices] of [[0, [0, 1, 2]], [1, [0, 2, 3]]] as const) {
      const [a, b, c] = indices.map((k) => corners[k]);
      const x1 = (vertices[a].x1 + vertices[b].x1 + vertices[c].x1) / 3;
      const x2 = (vertices[a].x2 + vertices[b].x2 + vertices[c].x2) / 3;
      triangles.push({ id: `${key}-${i}-${j}-${part}`, a, b, c, inspect: () => inspect(x1, x2) });
    }
  }
  return { vertices, triangles, className: `surface-${key}` };
}

export function projectSurface2D(surface: PreparedSurface2D, project: (x1: number, x2: number, height: number) => ProjectedPoint2D) {
  const points = surface.vertices.map((p) => project(p.x1, p.x2, p.height));
  // A shared vertex previously ran toFixed once for every incident triangle.
  // Keep the exact original one-decimal coordinates, formatting each only once.
  const coordinates = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  return surface.triangles.map(({ id, a, b, c, inspect }) => ({
    id, inspect, className: surface.className,
    depth: (points[a].depth + points[b].depth + points[c].depth) / 3,
    path: `M${coordinates[a]}L${coordinates[b]}L${coordinates[c]}Z`,
  }));
}
