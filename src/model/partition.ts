import type { Observation, Partition, WeightStrategy } from "./types";

const goodCount = (n: number, gamma: number) => Math.min(n - 1, Math.max(1, Math.ceil(gamma * n)));

export function rankSplit<T extends { id: number }>(trials: readonly T[], gamma: number, value: (trial: T) => number) {
  if (trials.length < 2 || !Number.isFinite(gamma) || gamma <= 0 || gamma >= 1 || trials.some((trial) => !Number.isFinite(value(trial)))) throw new Error("Need finite observations and 0 < gamma < 1.");
  const sorted = [...trials].sort((a, b) => value(a) - value(b) || a.id - b.id);
  const count = goodCount(sorted.length, gamma);
  return { good: sorted.slice(0, count), bad: sorted.slice(count), threshold: value(sorted[count - 1]) / 2 + value(sorted[count]) / 2 };
}

export function validateWeightStrategy(strategy: string): asserts strategy is WeightStrategy {
  if (!["uniform", "recency", "ei", "optuna"].includes(strategy)) throw new Error("Unknown weight strategy.");
}

function weightedTrials(samples: readonly Observation[], value: (trial: Observation) => number, strategy: WeightStrategy, threshold?: number) {
  // Optuna feeds each estimator observations in trial order after splitting.
  const ordered = strategy === "optuna" ? [...samples].sort((a, b) => a.id - b.id) : samples;
  const weights = weightsFor(ordered, value, strategy, threshold);
  return ordered.map((trial, index) => ({ trialId: trial.id, weight: weights[index] }));
}

export function weightsFor<T extends { id: number }>(samples: readonly T[], value: (trial: T) => number, strategy: WeightStrategy = "uniform", threshold?: number): number[] {
  validateWeightStrategy(strategy);
  if (strategy === "ei" && !Number.isFinite(threshold)) throw new Error("EI weights need a finite split threshold.");
  if (samples.some((trial) => !Number.isFinite(value(trial)) || !Number.isFinite(trial.id))) throw new Error("Invalid observations.");
  if (strategy === "uniform") return samples.map(() => 1);
  const ranks = new Map([...samples].sort((a, b) => a.id - b.id).map((trial, index) => [trial.id, index + 1]));
  if (strategy === "optuna") {
    const rampCount = samples.length - 25;
    const start = 1 / samples.length;
    const step = rampCount > 1 ? (1 - start) / (rampCount - 1) : 0;
    return samples.map((trial) => {
      const rank = ranks.get(trial.id)!;
      if (rank > rampCount || (rampCount > 1 && rank === rampCount)) return 1;
      return start + (rank - 1) * step;
    });
  }
  const raw = samples.map((trial) => strategy === "ei" ? Math.max(0, threshold! - value(trial)) : ranks.get(trial.id)!);
  const total = raw.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(total)) throw new Error("Weights must have a finite sum.");
  return total > 0 ? raw.map((weight) => weight / total * samples.length) : samples.map(() => 1);
}

export function partitionSingleObjective(trials: readonly Observation[], gamma: number, strategy: WeightStrategy, direction: "minimize" | "maximize"): Partition {
  const value = (trial: Observation) => trial.objectives[0] * (direction === "minimize" ? 1 : -1);
  const split = rankSplit(trials, gamma, value);
  return {
    kind: "single-objective", threshold: split.threshold,
    good: weightedTrials(split.good, value, strategy, split.threshold),
    bad: weightedTrials(split.bad, value, strategy === "ei" ? "uniform" : strategy),
  };
}

export function totalViolation(constraints: readonly number[]): number {
  return constraints.reduce((sum, value) => sum + Math.max(0, value), 0);
}

export function partitionConstrainedSingleObjective(trials: readonly Observation[], gamma: number, strategy: WeightStrategy, direction: "minimize" | "maximize", infeasibleFilling = true): Extract<Partition, { kind: "constrained-single-objective" }> {
  if (strategy === "ei") throw new Error("EI weights are unavailable with constraints.");
  const value = (trial: Observation) => trial.objectives[0] * (direction === "minimize" ? 1 : -1);
  if (trials.length < 2 || !Number.isFinite(gamma) || gamma <= 0 || gamma >= 1) throw new Error("Need at least two observations and 0 < gamma < 1.");
  const nBelow = goodCount(trials.length, gamma);
  const violations = Object.fromEntries(trials.map((trial) => [trial.id, totalViolation(trial.constraints)]));
  const feasible = trials.filter((trial) => violations[trial.id] === 0).sort((a, b) => value(a) - value(b) || a.id - b.id);
  const infeasible = trials.filter((trial) => violations[trial.id] > 0).sort((a, b) => violations[a.id] - violations[b.id] || a.id - b.id);
  const filled = infeasibleFilling ? Math.max(0, nBelow - feasible.length) : 0;
  return {
    kind: "constrained-single-objective",
    nBelow, violations,
    feasibleTrialIds: feasible.map((trial) => trial.id),
    filledTrialIds: infeasible.slice(0, filled).map((trial) => trial.id),
    good: weightedTrials([...feasible.slice(0, nBelow), ...infeasible.slice(0, filled)], value, strategy),
    bad: weightedTrials([...feasible.slice(nBelow), ...infeasible.slice(filled)], value, strategy),
  };
}
