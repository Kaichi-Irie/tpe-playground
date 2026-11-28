import { describe, expect, it } from "vitest";
import { choleskyDecompose, choleskyLogDet, solveCholesky, solveLower, solveUpperFromLowerTranspose } from "./linalg";

describe("Cholesky", () => {
  it("factors an SPD matrix and solves both triangular systems", () => {
    const matrix = Float64Array.of(4, 12, -16, 12, 37, -43, -16, -43, 98);
    const { lower, jitter } = choleskyDecompose(matrix, 3);
    expect(jitter).toBe(0);
    expect(lower).toEqual(Float64Array.of(2, 0, 0, 6, 1, 0, -8, 5, 3));
    expect(solveLower(lower, 3, Float64Array.of(2, 8, 11))).toEqual(Float64Array.of(1, 2, 3));
    expect(solveUpperFromLowerTranspose(lower, 3, Float64Array.of(-10, 17, 9))).toEqual(Float64Array.of(1, 2, 3));
    expect(solveCholesky(lower, 3, Float64Array.of(-20, -43, 192))).toEqual(Float64Array.of(1, 2, 3));
    expect(choleskyLogDet(lower, 3)).toBeCloseTo(Math.log(36), 14);
  });

  it("adds the smallest fallback jitter that works and preserves the input", () => {
    const matrix = Float64Array.of(1, 1, 1, 1);
    const { lower, jitter } = choleskyDecompose(matrix, 2);
    expect(jitter).toBe(1e-8);
    expect(matrix).toEqual(Float64Array.of(1, 1, 1, 1));
    expect(lower[0]).toBeCloseTo(Math.sqrt(1 + jitter), 14);
    expect(lower[2] ** 2 + lower[3] ** 2).toBeCloseTo(1 + jitter, 14);
    expect(choleskyLogDet(lower, 2)).toBeCloseTo(Math.log(jitter * (2 + jitter)), 7);

    expect(choleskyDecompose(Float64Array.of(-5e-7), 1).jitter).toBe(1e-6);
    expect(choleskyDecompose(matrix, 2, 1e-6).jitter).toBe(1e-6);
    expect(() => choleskyDecompose(Float64Array.of(-1), 1)).toThrow(/Cholesky/);
  });
});
