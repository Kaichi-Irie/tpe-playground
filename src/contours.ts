export interface ContourPoint { x1: number; x2: number; objective: number }
export interface ContourSegment { level: number; a: ContourPoint; b: ContourPoint }

// Split each cell along the same diagonal as the surface. Half-open crossings
// avoid duplicate vertices and division by zero on edges equal to the level.
export function objectiveContours(grid: readonly (readonly ContourPoint[])[], levels: readonly number[]): ContourSegment[] {
  const segments: ContourSegment[] = [];
  for (const level of levels) {
    for (let i = 0; i < grid.length - 1; i++) for (let j = 0; j < grid[i].length - 1; j++) {
      const corners = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
      for (const indices of [[0, 1, 2], [0, 2, 3]]) {
        const points: ContourPoint[] = [];
        for (let edge = 0; edge < 3; edge++) {
          const a = corners[indices[edge]], b = corners[indices[(edge + 1) % 3]];
          if ((a.objective < level) === (b.objective < level)) continue;
          const t = (level - a.objective) / (b.objective - a.objective);
          points.push({ x1: a.x1 + t * (b.x1 - a.x1), x2: a.x2 + t * (b.x2 - a.x2), objective: level });
        }
        if (points.length === 2 && (points[0].x1 !== points[1].x1 || points[0].x2 !== points[1].x2)) segments.push({ level, a: points[0], b: points[1] });
      }
    }
  }
  return segments;
}
