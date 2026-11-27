import type { CovarianceEllipse2D, Eigen2x2, Matrix2x2, Vector2 } from "./types";

export function decomposeSymmetric2x2(matrix: Matrix2x2, minEigenvalue = 1e-16): Eigen2x2 {
  const a = matrix[0][0];
  const b = 0.5 * (matrix[0][1] + matrix[1][0]);
  const c = matrix[1][1];
  const trace = a + c;
  const diff = a - c;
  const disc = Math.hypot(diff, 2 * b);
  const eigenvalues: Vector2 = [
    Math.max(minEigenvalue, 0.5 * (trace + disc)),
    Math.max(minEigenvalue, 0.5 * (trace - disc)),
  ];
  if (Math.abs(b) <= 1e-15 * Math.max(1, Math.abs(a), Math.abs(c))) {
    return a >= c
      ? { eigenvalues, eigenvectors: [[1, 0], [0, 1]], angle: 0 }
      : { eigenvalues, eigenvectors: [[0, 1], [-1, 0]], angle: Math.PI / 2 };
  }
  const angle = 0.5 * Math.atan2(2 * b, diff);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { eigenvalues, eigenvectors: [[cos, sin], [-sin, cos]], angle };
}

function rotate([v1, v2]: Eigen2x2["eigenvectors"], [x, y]: Vector2): Vector2 {
  return [v1[0] * x + v2[0] * y, v1[1] * x + v2[1] * y];
}

export function applyInvSqrtCovariance({ eigenvalues: [l1, l2], eigenvectors }: Eigen2x2, [x, y]: Vector2): Vector2 {
  const [v1, v2] = eigenvectors;
  return rotate(eigenvectors, [
    (v1[0] * x + v1[1] * y) / Math.sqrt(l1),
    (v2[0] * x + v2[1] * y) / Math.sqrt(l2),
  ]);
}

export function applySqrtCovariance({ eigenvalues: [l1, l2], eigenvectors }: Eigen2x2, [x, y]: Vector2): Vector2 {
  return rotate(eigenvectors, [Math.sqrt(l1) * x, Math.sqrt(l2) * y]);
}

export function buildCovarianceEllipse(center: Vector2, sigma: number, eigen: Eigen2x2): CovarianceEllipse2D {
  const [l1, l2] = eigen.eigenvalues;
  // Keep unrepresentably large radii finite for snapshot serialization.
  const major = Math.min(Number.MAX_VALUE, sigma * Math.sqrt(l1));
  const minor = Math.min(Number.MAX_VALUE, sigma * Math.sqrt(l2));
  return {
    center,
    ...eigen,
    radii1Sigma: [major, minor],
    radii2Sigma: [Math.min(Number.MAX_VALUE, 2 * major), Math.min(Number.MAX_VALUE, 2 * minor)],
  };
}
