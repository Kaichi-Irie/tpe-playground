import type { CmaEsSnapshot, CovarianceEllipse2D } from "./model/cmaes/types";
import type { Play3DSceneItem } from "./Play3DCanvas";
import type { TwoParamProjectedPoint } from "./projectTwoParamSurface";
import type { TwoParamSurfaceVertex } from "./twoParamSurfaceMesh";

type Project = (x1: number, x2: number, height: number) => TwoParamProjectedPoint;
type Sample = Pick<TwoParamSurfaceVertex, "x1" | "x2">;
type Triangle = readonly [TwoParamSurfaceVertex, TwoParamSurfaceVertex, TwoParamSurfaceVertex];

const ringRadii = [0.35, 0.7, 1, 1.35, 1.7, 2, 2.4, 2.8, 3.2];
const ringLevels = [2, 1] as const;
const topLevels = [2.6, 2, 1.5, 1, 0.5];
const relativeDensity = (radius: number) => Math.exp(-0.5 * radius * radius);
const directions = (steps: number) => Array.from({ length: steps }, (_, index) => {
  const angle = 2 * Math.PI * index / steps;
  return [Math.cos(angle), Math.sin(angle)] as const;
});
const meshDirections = directions(36);
const topDirections = directions(72);
const bounds = [
  ["x1", -5, 1], ["x1", 5, -1], ["x2", -5, 1], ["x2", 5, -1],
] as const;
const inBox = ({ x1, x2 }: Sample) => x1 >= -5 && x1 <= 5 && x2 >= -5 && x2 <= 5;

function sampleRing(ellipse: CovarianceEllipse2D, radius: number, angles: typeof meshDirections): TwoParamSurfaceVertex[] {
  const { center: [m1, m2], eigenvectors: [v1, v2], radii1Sigma: [r1, r2] } = ellipse;
  const height = relativeDensity(radius);
  return angles.map(([cos, sin]) => ({
    x1: m1 + radius * (r1 * cos * v1[0] + r2 * sin * v2[0]),
    x2: m2 + radius * (r1 * cos * v1[1] + r2 * sin * v2[1]),
    height,
  }));
}

function gaussianLogRatio(ellipse: CovarianceEllipse2D, { x1, x2 }: Sample) {
  const { center: [m1, m2], eigenvectors: [v1, v2], radii1Sigma: [r1, r2] } = ellipse;
  const dx = x1 - m1, dy = x2 - m2;
  const u = (dx * v1[0] + dy * v1[1]) / r1;
  const v = (dx * v2[0] + dy * v2[1]) / r2;
  return -0.5 * (u * u + v * v);
}

function clipTriangle(triangle: Triangle, ellipse: CovarianceEllipse2D): readonly Triangle[] {
  if (triangle.every(inBox)) return [triangle];
  // Intersect in parameter space so the cut stays on the box wall at any camera angle.
  let polygon: readonly TwoParamSurfaceVertex[] = triangle;
  for (const [axis, wall, side] of bounds) {
    const clipped: TwoParamSurfaceVertex[] = [];
    let a = polygon[polygon.length - 1];
    for (const b of polygon) {
      const da = side * (a[axis] - wall), db = side * (b[axis] - wall);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        const point = { x1: a.x1 + t * (b.x1 - a.x1), x2: a.x2 + t * (b.x2 - a.x2), [axis]: wall };
        clipped.push({ ...point, height: Math.exp(gaussianLogRatio(ellipse, point)) });
      }
      if (db >= 0) clipped.push(b);
      a = b;
    }
    if (clipped.length < 3) return [];
    polygon = clipped;
  }
  return polygon.slice(2).map((c, index) => [polygon[0], polygon[index + 1], c]);
}

export function buildCmaEsBell(ellipse: CovarianceEllipse2D): Triangle[] {
  const peak = { x1: ellipse.center[0], x2: ellipse.center[1], height: 1 };
  const rings = ringRadii.map((radius) => sampleRing(ellipse, radius, meshDirections));
  const triangles: Triangle[] = [];
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    const inner = rings[i - 1];
    for (let j = 0; j < ring.length; j++) {
      const next = (j + 1) % ring.length;
      triangles.push(...clipTriangle([inner?.[j] ?? peak, ring[j], ring[next]], ellipse));
      if (inner) triangles.push(...clipTriangle([inner[j], ring[next], inner[next]], ellipse));
    }
  }
  return triangles;
}

function clipRingEdge(a: Sample, b: Sample): readonly [number, number] | undefined {
  let start = 0, end = 1;
  for (const [axis, wall, side] of bounds) {
    const da = side * (a[axis] - wall), db = side * (b[axis] - wall);
    if (da < 0 && db < 0) return undefined;
    if (da < 0) start = Math.max(start, da / (da - db));
    if (db < 0) end = Math.min(end, da / (da - db));
  }
  return start < end ? [start, end] : undefined;
}

export function buildCmaEsScene(
  snapshot: CmaEsSnapshot,
  bell: readonly Triangle[],
  project: Project,
  isTop: boolean,
  distributionVisible: boolean,
  meanVisible: boolean,
  onInspect: (label: string) => void,
): Play3DSceneItem[] {
  const { ellipse } = snapshot;
  const items: Play3DSceneItem[] = [];
  const mean = project(...ellipse.center, 0);

  if (distributionVisible && isTop) {
    for (const level of topLevels) {
      const points = sampleRing(ellipse, level, topDirections).flatMap(({ x1, x2 }) => {
        const { x, y } = project(x1, x2, 0);
        return [x, y];
      });
      items.push({ id: `gauss-band-${level}`, kind: "ellipse-fill", points, alpha: 0.14, depth: mean.depth });
    }
  }

  if (distributionVisible) {
    const logPeak = -Math.log(2 * Math.PI) - Math.log(ellipse.radii1Sigma[0]) - Math.log(ellipse.radii1Sigma[1]);
    const projected = new Map<TwoParamSurfaceVertex, TwoParamProjectedPoint>();
    for (const [index, triangle] of bell.entries()) {
      const [a, b, c] = triangle.map((vertex) => {
        let point = projected.get(vertex);
        if (!point) {
          point = project(vertex.x1, vertex.x2, vertex.height);
          projected.set(vertex, point);
        }
        return point;
      });
      items.push({
        id: `cmaes-${index}`, kind: "triangle", layer: "cmaes",
        points: [a.x, a.y, b.x, b.y, c.x, c.y],
        depth: (a.depth + b.depth + c.depth) / 3,
        inspect: () => {
          const [a, b, c] = triangle;
          const x1 = (a.x1 + b.x1 + c.x1) / 3;
          const x2 = (a.x2 + b.x2 + c.x2) / 3;
          const logRatio = gaussianLogRatio(ellipse, { x1, x2 });
          onInspect(`CMA-ES N(m, σ²C) · x₁ = ${x1.toFixed(2)}, x₂ = ${x2.toFixed(2)} · rel. density = ${Math.exp(logRatio).toPrecision(4)} · log p(x) = ${(logPeak + logRatio).toPrecision(4)}`);
        },
      });
    }

    for (const sigmaLevel of ringLevels) {
      const ring = sampleRing(ellipse, sigmaLevel, isTop ? topDirections : meshDirections);
      const footprint = ring.flatMap(({ x1, x2 }) => {
        const { x, y } = project(x1, x2, 0);
        return [x, y];
      });
      footprint.push(footprint[0], footprint[1]);
      items.push({ id: `ellipse-${sigmaLevel}`, kind: "ellipse-segment", sigmaLevel, points: footprint, depth: mean.depth, footprint: !isTop });
      if (isTop) continue;

      const raised = ring.map(({ x1, x2, height }) => project(x1, x2, height));
      let distance = 0;
      for (let i = 0; i < ring.length; i++) {
        const next = (i + 1) % ring.length;
        const a = raised[i], b = raised[next];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const edge = clipRingEdge(ring[i], ring[next]);
        if (edge) {
          const [t0, t1] = edge;
          items.push({
            id: `gauss-ring-${sigmaLevel}-${i}`, kind: "ellipse-segment", sigmaLevel,
            points: [a.x + t0 * (b.x - a.x), a.y + t0 * (b.y - a.y), a.x + t1 * (b.x - a.x), a.y + t1 * (b.y - a.y)],
            depth: a.depth + (t0 + t1) / 2 * (b.depth - a.depth) + 0.02,
            // Keep the dash phase continuous across separately depth-sorted edges.
            dashOffset: -(distance + t0 * length),
          });
        }
        distance += length;
      }
    }
    if (!isTop) {
      const peak = project(...ellipse.center, 1);
      items.push({ id: "cmaes-peak-drop", kind: "mean-drop", points: [mean.x, mean.y, peak.x, peak.y], depth: (mean.depth + peak.depth) / 2 });
    }
  }

  if (meanVisible) {
    const path = snapshot.meanPath.map(({ x1, x2 }) => project(x1, x2, 0));
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      items.push({ id: `mean-path-${i}`, kind: "mean-path", points: [a.x, a.y, b.x, b.y], depth: (a.depth + b.depth) / 2 + 0.01 });
    }
    for (let i = 0; i < path.length - 1; i++) {
      const point = path[i];
      items.push({ ...point, id: `mean-step-${i}`, kind: "mean-step", depth: point.depth + 0.02 });
    }
    items.push({ ...mean, id: "cmaes-mean", kind: "mean-marker", depth: mean.depth + 0.03 });
  }
  return items;
}
