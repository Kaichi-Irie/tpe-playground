export interface TwoParamSurfaceVertex { x1: number; x2: number; height: number }

// Display-only sampling: retain domain edges even when stride does not divide the grid.
// Heights are prepared once, independently of camera motion.
export function twoParamSurfaceMesh<T extends { x1: number; x2: number }>(grid: readonly (readonly T[])[], stride: number, height: (point: T) => number): TwoParamSurfaceVertex[][] {
  if (!Number.isInteger(stride) || stride < 1) throw new Error("Invalid surface stride.");
  return grid.filter((_, i) => i % stride === 0 || i === grid.length - 1).map((row) =>
    row.filter((_, j) => j % stride === 0 || j === row.length - 1).map((point) => ({ x1: point.x1, x2: point.x2, height: height(point) })),
  );
}

// Keep static geometry sorted across trial updates; only merge it with changed layers.
export function mergeDepthSorted<T extends { depth: number }>(fixed: readonly T[], changing: readonly T[]): T[] {
  const result: T[] = [];
  let i = 0, j = 0;
  while (i < fixed.length && j < changing.length) {
    result.push(fixed[i].depth <= changing[j].depth ? fixed[i++] : changing[j++]);
  }
  while (i < fixed.length) result.push(fixed[i++]);
  while (j < changing.length) result.push(changing[j++]);
  return result;
}
