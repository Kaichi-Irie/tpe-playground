import { domain, fitOneParamModel, type Trial, type WeightStrategy } from "./oneParamTpe";
import { getObjective, type ObjectivePreset } from "./objectives";
import { createLogDensity } from "./model/density";
import { logTruncatedNormalPeak } from "./model/truncnorm";
import type { Kernel } from "./model/types";

export interface ExplanationExample {
  label: string;
  trials: readonly Trial[];
  objectivePreset: ObjectivePreset;
}
export interface ExplanationSettings {
  gamma: number;
  bandwidth: number;
  priorWeight: number;
  weights: Exclude<WeightStrategy, "optuna">;
  candidates: number;
  seed: number;
}
export const explanationDefaults: ExplanationSettings = {
  gamma: 0.3, bandwidth: 0.55, priorWeight: 4, weights: "uniform", candidates: 8, seed: 50,
};
export const explanationCandidateLimit = 40;
export const fixedExample: ExplanationExample = {
  label: "10 observations · one decision",
  objectivePreset: "multimodal",
  trials: [-4.4, 3.0, -2.0, 0.8, 4.2, -0.5, 1.8, -3.0, 3.8, 0.3].map((x, i) => ({
    id: i + 1, x, y: getObjective("multimodal").evaluate(x),
  })),
};
export const explanationGrid = Array.from({ length: 301 }, (_, i) => -5 + i / 30);

export function kernelContribution(kernel: Kernel, x: number): number {
  if (x < domain[0] || x > domain[1] || kernel.mixtureWeight === 0) return 0;
  const h = kernel.bandwidths.x;
  const center = kernel.center.x;
  return Math.exp(Math.log(kernel.mixtureWeight) + logTruncatedNormalPeak(center, h, ...domain) - 0.5 * ((x - center) / h) ** 2);
}

// Reuse the optimizer's snapshots and proposal trace; the lesson has no second TPE implementation.
export function buildExplanation(example: ExplanationExample, settings: ExplanationSettings) {
  const model = fitOneParamModel(example.trials, settings.priorWeight, {
    ...settings, bandwidthRule: "constant", startupTrials: 2, objectivePreset: example.objectivePreset,
    // Keep the explanation's draw batch stable as the learner changes the visible prefix.
    candidates: Math.max(explanationCandidateLimit, settings.candidates),
  });
  const { partition } = model.snapshot;
  if (partition.kind !== "single-objective") throw new Error("The Lab requires an unconstrained partition.");
  const group = model.snapshot.groups[0];
  const good = createLogDensity(group.good), bad = createLogDensity(group.bad);
  const trace = model.propose(settings.seed);
  if (trace.method !== "tpe") throw new Error("Explanation requires a fitted TPE proposal.");
  const candidates = trace.groups[0].candidates.slice(0, settings.candidates);
  const selectedIndex = candidates.reduce((best, candidate, i) => candidate.score > candidates[best].score ? i : best, 0);
  return {
    group, partition,
    logRatios: explanationGrid.map((x) => good({ x }) - bad({ x })),
    goodDensity: explanationGrid.map((x) => Math.exp(good({ x }))),
    badDensity: explanationGrid.map((x) => Math.exp(bad({ x }))),
    candidates,
    selectedIndex,
  };
}

export function evaluateExplanation(example: ExplanationExample, settings: ExplanationSettings): Trial {
  const data = buildExplanation(example, settings);
  const x = data.candidates[data.selectedIndex].params.x;
  return { id: Math.max(...example.trials.map((trial) => trial.id)) + 1, x, y: getObjective(example.objectivePreset).evaluate(x) };
}

// Switch to a labeled logarithmic display when linear ratios would hide detail.
export function acquisitionPlot(logRatios: readonly number[], scores: readonly number[]) {
  const maximum = Math.max(...logRatios, ...scores);
  const logarithmic = maximum > 20;
  const transform = (value: number) => logarithmic
    ? Math.max(0, value) + Math.log1p(Math.exp(-Math.abs(value)))
    : Math.exp(value - maximum);
  const scale = logarithmic ? transform(maximum) : 1;
  return { logarithmic, curve: logRatios.map((value) => transform(value) / scale), candidates: scores.map((value) => transform(value) / scale) };
}

// Fill the largest uncovered interval, retaining the learner's inputs exactly.
export function completeInitialInputs(inputs: readonly number[], preset: ObjectivePreset): Trial[] {
  if (inputs.length > 10 || inputs.some((x) => !Number.isFinite(x) || x < -5 || x > 5)) {
    throw new Error("Choose up to ten finite inputs between -5 and 5.");
  }
  const xs = [...inputs];
  while (xs.length < 10) {
    const boundaries = [-5, ...xs.slice().sort((a, b) => a - b), 5];
    let widest = 0;
    for (let i = 1; i < boundaries.length - 1; i++) {
      if (boundaries[i + 1] - boundaries[i] > boundaries[widest + 1] - boundaries[widest]) widest = i;
    }
    xs.push(Math.round((boundaries[widest] + boundaries[widest + 1]) * 5) / 10);
  }
  return xs.map((x, i) => ({ id: i + 1, x, y: getObjective(preset).evaluate(x) }));
}

// Select an exact rank even when division rounds upward before ceil(gamma * n).
export function fractionForCount(count: number, total: number) {
  const gamma = count / total;
  return Math.ceil(gamma * total) > count ? gamma - Number.EPSILON : gamma;
}

// Translate a grid height to the rank split used by the optimizer.
export function splitAtThreshold(trials: readonly Trial[], value: number) {
  if (trials.length < 2 || !Number.isFinite(value) || trials.some((trial) => !Number.isFinite(trial.y))) {
    throw new Error("A split needs at least two finite observations and a finite height.");
  }
  const sorted = trials.map((trial) => trial.y).sort((a, b) => a - b);
  // Snap to a rank boundary, using the optimizer's exact midpoint convention.
  // A nearby tap can select even a very narrow gap between observations.
  let count = 1;
  let threshold = sorted[0] / 2 + sorted[1] / 2;
  for (let index = 2; index < sorted.length; index++) {
    const boundary = sorted[index - 1] / 2 + sorted[index] / 2;
    if (Math.abs(boundary - value) < Math.abs(threshold - value)) {
      count = index;
      threshold = boundary;
    }
  }
  return { gamma: fractionForCount(count, trials.length), threshold };
}
