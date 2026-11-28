import type { GpKernel } from "./types";

const sqrtFive = Math.sqrt(5);

export function kernelValue(kind: GpKernel, distance: number, lengthScale: number): number {
  const r = distance / lengthScale;
  if (kind === "rbf") return Math.exp(-0.5 * r * r);
  const s = sqrtFive * r;
  // Beyond this radius the exponential underflows, including after the polynomial factor.
  if (s > 800) return 0;
  return (1 + s + (s * s) / 3) * Math.exp(-s);
}

export function euclideanDistance(a: readonly number[], b: readonly number[]): number {
  if (a.length === 1) return Math.abs(a[0] - b[0]);
  if (a.length === 2) return Math.hypot(a[0] - b[0], a[1] - b[1]);
  return Math.hypot(...a.map((value, i) => value - b[i]));
}

export function buildKernelMatrix(
  coords: readonly (readonly number[])[],
  kind: GpKernel,
  lengthScale: number,
  noiseStd: number,
): Float64Array {
  const n = coords.length;
  const matrix = new Float64Array(n * n);
  const diagonal = 1 + noiseStd * noiseStd;
  for (let i = 0; i < n; i++) {
    matrix[i * n + i] = diagonal;
    for (let j = 0; j < i; j++) {
      const covariance = kernelValue(kind, euclideanDistance(coords[i], coords[j]), lengthScale);
      matrix[i * n + j] = covariance;
      matrix[j * n + i] = covariance;
    }
  }
  return matrix;
}
