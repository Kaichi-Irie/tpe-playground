import type { Observation, Partition, WeightStrategy } from "./types";

export function rankSplit<T extends { id: number }>(trials: readonly T[], gamma: number, value: (trial: T) => number) {
  if (trials.length < 2 || !Number.isFinite(gamma) || gamma <= 0 || gamma >= 1 || trials.some((trial) => !Number.isFinite(value(trial)))) throw new Error("Need finite observations and 0 < gamma < 1.");
  const sorted = [...trials].sort((a, b) => value(a) - value(b) || a.id - b.id);
  const count = Math.min(sorted.length - 1, Math.max(1, Math.ceil(gamma * sorted.length)));
  return { good: sorted.slice(0, count), bad: sorted.slice(count), threshold: value(sorted[count - 1]) / 2 + value(sorted[count]) / 2 };
}

export function weightsFor<T extends { id: number }>(samples: readonly T[], value: (trial: T) => number, strategy: WeightStrategy = "uniform", threshold?: number): number[] {
  if (!["uniform", "recency", "ei"].includes(strategy)) throw new Error("Unknown weight strategy.");
  if (strategy === "ei" && !Number.isFinite(threshold)) throw new Error("EI weights need a finite split threshold.");
  if (samples.some((trial) => !Number.isFinite(value(trial)) || !Number.isFinite(trial.id))) throw new Error("Invalid observations.");
  if (strategy === "uniform") return samples.map(() => 1);
  const ranks = new Map([...samples].sort((a, b) => a.id - b.id).map((trial, index) => [trial.id, index + 1]));
  const raw = samples.map((trial) => strategy === "ei" ? Math.max(0, threshold! - value(trial)) : ranks.get(trial.id)!);
  const total = raw.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(total)) throw new Error("Weights must have a finite sum.");
  return total > 0 ? raw.map((weight) => weight / total * samples.length) : samples.map(() => 1);
}

export function partitionSingleObjective(trials: readonly Observation[], gamma: number, strategy: WeightStrategy, direction: "minimize" | "maximize"): Partition {
  const value = (trial: Observation) => trial.objectives[0] * (direction === "minimize" ? 1 : -1);
  const split = rankSplit(trials, gamma, value);
  const weighted = (samples: readonly Observation[], weights: WeightStrategy) => {
    const values = weightsFor(samples, value, weights, split.threshold);
    return samples.map((trial, index) => ({ trialId: trial.id, weight: values[index] }));
  };
  return { kind: "single-objective", threshold: split.threshold, good: weighted(split.good, strategy), bad: weighted(split.bad, strategy === "ei" ? "uniform" : strategy) };
}
