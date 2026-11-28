const fallbackJitters = [1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2];

export function choleskyDecompose(
  matrix: Float64Array,
  n: number,
  baseJitter = 0,
): { lower: Float64Array; jitter: number } {
  if (!Number.isFinite(baseJitter) || baseJitter < 0) throw new Error("Invalid Cholesky jitter.");
  const lower = new Float64Array(n * n);
  for (const jitter of [baseJitter, ...fallbackJitters.filter((value) => value > baseJitter)]) {
    let positiveDefinite = true;
    rows: for (let i = 0; i < n; i++) {
      const row = i * n;
      for (let j = 0; j <= i; j++) {
        const columnRow = j * n;
        let sum = matrix[row + j];
        if (i === j) sum += jitter;
        for (let k = 0; k < j; k++) sum -= lower[row + k] * lower[columnRow + k];
        if (i === j) {
          if (!(sum > 0) || !Number.isFinite(sum)) {
            positiveDefinite = false;
            break rows;
          }
          lower[row + i] = Math.sqrt(sum);
        } else {
          lower[row + j] = sum / lower[columnRow + j];
        }
      }
    }
    if (positiveDefinite) return { lower, jitter };
  }
  throw new Error("Cholesky decomposition failed after adding diagonal jitter.");
}

export function solveLower(lower: Float64Array, n: number, rhs: Float64Array): Float64Array {
  const solution = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const row = i * n;
    let sum = rhs[i];
    for (let j = 0; j < i; j++) sum -= lower[row + j] * solution[j];
    solution[i] = sum / lower[row + i];
  }
  return solution;
}

export function solveUpperFromLowerTranspose(lower: Float64Array, n: number, rhs: Float64Array): Float64Array {
  const solution = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = rhs[i];
    for (let j = i + 1; j < n; j++) sum -= lower[j * n + i] * solution[j];
    solution[i] = sum / lower[i * n + i];
  }
  return solution;
}

export function solveCholesky(lower: Float64Array, n: number, rhs: Float64Array): Float64Array {
  return solveUpperFromLowerTranspose(lower, n, solveLower(lower, n, rhs));
}

export function choleskyLogDet(lower: Float64Array, n: number): number {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.log(lower[i * n + i]);
  return 2 * sum;
}
