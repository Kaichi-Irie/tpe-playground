import { describe, expect, it } from "vitest";
import { applyInvSqrtCovariance, applySqrtCovariance, buildCovarianceEllipse, decomposeSymmetric2x2 } from "./eigen";
import type { Matrix2x2, Vector2 } from "./types";

describe("symmetric 2×2 eigendecomposition", () => {
  const diagonalCases: { matrix: Matrix2x2; values: Vector2; vectors: Matrix2x2; angle: number }[] = [
    { matrix: [[1, 0], [0, 1]], values: [1, 1], vectors: [[1, 0], [0, 1]], angle: 0 },
    { matrix: [[4, 0], [0, 2]], values: [4, 2], vectors: [[1, 0], [0, 1]], angle: 0 },
    { matrix: [[2, 0], [0, 4]], values: [4, 2], vectors: [[0, 1], [-1, 0]], angle: Math.PI / 2 },
    { matrix: [[7, 0], [0, 7]], values: [7, 7], vectors: [[1, 0], [0, 1]], angle: 0 },
  ];
  it.each(diagonalCases)("uses a deterministic basis for $matrix", ({ matrix, values, vectors, angle }) => {
    expect(decomposeSymmetric2x2(matrix)).toEqual({ eigenvalues: values, eigenvectors: vectors, angle });
  });

  it.each([1, -1])("reconstructs a rotated matrix with off-diagonal sign %i", (sign) => {
    const matrix: Matrix2x2 = [[5, sign * 2], [sign * 2, 3]];
    const eigen = decomposeSymmetric2x2(matrix);
    const { eigenvalues: [l1, l2], eigenvectors: [v1, v2], angle } = eigen;
    expect(l1).toBeGreaterThan(l2);
    expect(angle).toBeCloseTo(Math.atan2(v1[1], v1[0]), 14);
    expect(sign * angle).toBeGreaterThan(0);
    expect(Math.hypot(...v1)).toBeCloseTo(1, 14);
    expect(Math.hypot(...v2)).toBeCloseTo(1, 14);
    expect(v1[0] * v2[0] + v1[1] * v2[1]).toBeCloseTo(0, 14);
    matrix.forEach((row, i) => row.forEach((value, j) => {
      expect(l1 * v1[i] * v1[j] + l2 * v2[i] * v2[j]).toBeCloseTo(value, 14);
    }));

    // Sampling uses B D z. Convert the world-space vector to eigenbasis coordinates first.
    const v: Vector2 = [3, -1];
    const z: Vector2 = [v1[0] * v[0] + v1[1] * v[1], v2[0] * v[0] + v2[1] * v[1]];
    const result = applyInvSqrtCovariance(eigen, applySqrtCovariance(eigen, z));
    expect(result[0]).toBeCloseTo(v[0], 14);
    expect(result[1]).toBeCloseTo(v[1], 14);
  });

  it("averages asymmetric off-diagonals and floors near-singular eigenvalues", () => {
    expect(decomposeSymmetric2x2([[4, 3], [1, 4]])).toEqual(decomposeSymmetric2x2([[4, 2], [2, 4]]));
    expect(decomposeSymmetric2x2([[1, 1], [1, 1]]).eigenvalues).toEqual([2, 1e-16]);
    expect(decomposeSymmetric2x2([[0, 0], [0, 1e-20]], 1e-10).eigenvalues).toEqual([1e-10, 1e-10]);
  });

  it("reports one- and two-sigma radii in eigenvalue order", () => {
    const eigen = decomposeSymmetric2x2([[1, 0], [0, 9]]);
    expect(buildCovarianceEllipse([1, -2], 0.5, eigen)).toEqual({
      ...eigen, center: [1, -2], radii1Sigma: [1.5, 0.5], radii2Sigma: [3, 1],
    });
  });
});
