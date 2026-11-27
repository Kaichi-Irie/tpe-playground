// Adapted from Optuna v5.1.0. See ../normal.ts for source and license notices.
import { erf, logNdtr, logSqrtTwoPi, normalLeftTail } from "../normal";

export { erf, logNdtr } from "../normal";

export function logGaussMass(a: number, b: number): number {
  if (a === b) return -Infinity;
  // Near zero the erf difference avoids cancellation against the CDF's 1/2.
  if (a >= -1 && b <= 1) return Math.log(0.5 * (erf(b / Math.SQRT2) - erf(a / Math.SQRT2)));
  if (a >= 0) return logGaussMass(-b, -a);
  if (b <= 0) {
    const upper = logNdtr(b);
    return upper + Math.log(-Math.expm1(logNdtr(a) - upper));
  }
  return Math.log1p(-normalLeftTail(a) - normalLeftTail(-b));
}

export function logTruncatedNormalPeak(mean: number, width: number, low: number, high: number): number {
  return -Math.log(width) - logSqrtTwoPi - logGaussMass((low - mean) / width, (high - mean) / width);
}

function logAddExp(a: number, b: number): number {
  return Math.max(a, b) + Math.log1p(Math.exp(-Math.abs(a - b)));
}

function ndtriExp(y: number): number {
  if (y >= 0) return Infinity;
  if (y === -Infinity) return -Infinity;

  // Reflect CDFs near one into the left tail before Newton iteration.
  const flipped = y > -0.01;
  const target = flipped ? Math.log(-Math.expm1(y)) : y;
  let x = target < -5
    ? -Math.sqrt(-2 * (target + logSqrtTwoPi))
    : -(Math.sqrt(3) / Math.PI) * Math.log(Math.expm1(-target));

  for (let i = 0; i < 100; i++) {
    const logCdf = logNdtr(x);
    const logPdf = -0.5 * x ** 2 - logSqrtTwoPi;
    const step = (logCdf - target) * Math.exp(logCdf - logPdf);
    x -= step;
    if (step === 0 || Math.abs(step) < 1e-8 * Math.abs(x)) break;
  }
  return flipped ? -x : x;
}

export function truncnormPpf(q: number, a: number, b: number): number {
  if (a === b) return NaN;
  if (q === 0) return a;
  if (q === 1) return b;

  // A very narrow interval around zero has effectively constant density.
  // Interpolate before adding its mass to 1/2 would round away its quantiles.
  if (a >= -1e-8 && b <= 1e-8) return a + q * (b - a);

  // Optuna uses its vectorized erf CDF for intervals straddling zero.
  const logMass = a < 0 && b > 0 && (a < -1 || b > 1)
    ? Math.log1p(-(0.5 + 0.5 * erf(a / Math.SQRT2)) - (0.5 + 0.5 * erf(-b / Math.SQRT2)))
    : logGaussMass(a, b);
  const z = a < 0
    ? ndtriExp(logAddExp(logNdtr(a), Math.log(q) + logMass))
    : -ndtriExp(logAddExp(logNdtr(-b), Math.log1p(-q) + logMass));
  return Math.max(a, Math.min(b, z));
}
