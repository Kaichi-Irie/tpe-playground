import { trialLimit, type Trial } from "./tpe";

// Only evaluated observations contribute; there is no value before trial 1.
export function bestSoFar(trials: readonly Trial[]): number[] {
  let best = Infinity;
  return trials.map((trial) => {
    if (!Number.isFinite(trial.y)) throw new Error("Objective values must be finite.");
    best = Math.min(best, trial.y);
    return best;
  });
}

export function bestFeasibleSoFar(trials: readonly { y: number; feasible?: boolean }[]): (number | null)[] {
  let best: number | null = null;
  return trials.map(({ y, feasible }) => {
    if (feasible) best = best === null ? y : Math.min(best, y);
    return best;
  });
}

export const comparisonFloor = 1e-12;
export function relativeBestSoFar(trials: readonly Trial[], minimum: number): number[] {
  if (!Number.isFinite(minimum) || minimum <= 0) throw new Error("Need a finite positive minimum.");
  return bestSoFar(trials).map((value) => Math.max(0, value - minimum) / minimum);
}

function cumulativeRegret(trials: readonly Trial[], minimum: number): number[] {
  if (!Number.isFinite(minimum)) throw new Error("Need a finite minimum.");
  let total = 0;
  return trials.map((trial) => {
    if (!Number.isFinite(trial.y)) throw new Error("Objective values must be finite.");
    total += Math.max(0, trial.y - minimum);
    if (!Number.isFinite(total)) throw new Error("Regret must be finite.");
    return total;
  });
}

export function averageRegret(trials: readonly Trial[], minimum: number): number[] {
  return cumulativeRegret(trials, minimum).map((value, index) => value / (index + 1));
}

// The upper bound includes all displayed values; values at or below the
// positive log floor share the bottom coordinate without changing the data.
export function comparisonAxis(upperValue: number, floor = comparisonFloor) {
  if (!Number.isFinite(upperValue) || upperValue < 0 || !Number.isFinite(floor) || floor <= 0) {
    throw new Error("Need a finite nonnegative upper value and a positive finite floor.");
  }
  const lowerExponent = Math.log10(floor);
  const upperExponent = Math.max(lowerExponent + 1, Math.ceil(Math.log10(Math.max(upperValue, floor))));
  const normalize = (value: number) => (Math.log10(Math.max(value, floor)) - lowerExponent) / (upperExponent - lowerExponent);
  const ticks: number[] = [];
  const stride = Math.max(1, Math.ceil((upperExponent - lowerExponent) / 4));
  for (let exponent = lowerExponent; exponent < upperExponent; exponent += stride) ticks.push(10 ** exponent);
  ticks.push(10 ** upperExponent);
  return { normalize, ticks };
}

// Keep early history readable without rescaling the horizontal axis every trial.
export function comparisonTrialAxis(count: number) {
  const upper = Math.min(trialLimit, Math.max(10, Math.ceil(count / 10) * 10));
  const stride = upper <= 20 ? 5 : upper <= 100 ? 10 * Math.ceil(upper / 50) : 50;
  const ticks = [1];
  for (let trial = stride; trial <= upper - stride / 2; trial += stride) ticks.push(trial);
  ticks.push(upper);
  return { upper, ticks };
}
