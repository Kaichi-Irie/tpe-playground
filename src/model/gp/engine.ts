import { logSqrtTwoPi, normalCdf, normalPdf } from "../normal";
import { randomSample, validateRandomSeed } from "../numpyRandom";
import { dataKey, freezeData, historyKeyFor } from "../provenance";
import type { Observation, Parameter, Point, Problem } from "../types";
import { sampleUniformPoint, validateObservations, validateProblem } from "../validation";
import { buildKernelMatrix, euclideanDistance, kernelValue } from "./kernels";
import { choleskyDecompose, choleskyLogDet, solveCholesky, solveLower } from "./linalg";
import type { FittedGpModel, GpConfig, GpPrediction, GpProposalTrace, GpSnapshot, ResolvedGpConfig } from "./types";

export type { FittedGpModel } from "./types";

const goldenRatio = (Math.sqrt(5) - 1) / 2;

function validateGpProblem(problem: Problem): void {
  if (problem.parameters.length !== 1 && problem.parameters.length !== 2) {
    throw new Error("GP requires one or two parameters.");
  }
  if (problem.directions.length !== 1 || !["minimize", "maximize"].includes(problem.directions[0])) {
    throw new Error("GP requires one objective with a valid direction.");
  }
  if (problem.constraintCount !== 0) throw new Error("GP does not support constraints.");
  validateProblem(problem, "Invalid GP search space.");
}

function minimumSpan({ parameters }: Problem): number {
  return Math.min(...parameters.map(({ low, high }) => high - low));
}

export function defaultGpLengthScale(problem: Problem): number {
  validateGpProblem(problem);
  return Math.max(Number.MIN_VALUE, minimumSpan(problem) / 5);
}

export function resolveGpConfig(problem: Problem, config: GpConfig = {}): ResolvedGpConfig {
  const defaultLengthScale = defaultGpLengthScale(problem);
  const {
    kernel = "matern52", acquisition = "ucb", lengthScaleRule = "auto",
    lengthScale = defaultLengthScale, beta = 2, xi = 0.01, noise = 0.01, startupTrials = 10,
  } = config;

  if (kernel !== "matern52" && kernel !== "rbf") throw new Error("Invalid GP kernel.");
  if (acquisition !== "ucb" && acquisition !== "ei") throw new Error("Invalid GP acquisition.");
  if (lengthScaleRule !== "auto" && lengthScaleRule !== "manual") throw new Error("Invalid GP lengthScaleRule.");
  if (!Number.isFinite(lengthScale) || lengthScale <= 0) throw new Error("Invalid GP lengthScale.");
  for (const [name, value] of Object.entries({ beta, xi, noise })) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid GP ${name}.`);
  }
  if (!Number.isInteger(startupTrials) || startupTrials < 1 || startupTrials > 10000) {
    throw new Error("Invalid GP startupTrials.");
  }
  return freezeData({ kernel, acquisition, lengthScaleRule, lengthScale, beta: beta + 0, xi: xi + 0, noise: noise + 0, startupTrials });
}

function provenance(problem: Problem, observations: readonly Observation[], config: ResolvedGpConfig) {
  return {
    version: 1 as const,
    problem: {
      id: problem.id,
      directions: [...problem.directions],
      constraintCount: 0,
      parameters: problem.parameters.map(({ id, low, high }) => ({ id, low: low + 0, high: high + 0 })),
    },
    config,
    historyKey: historyKeyFor(problem, observations),
    inputTrialIds: observations.map(({ id }) => id + 0),
  };
}

function dot(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function standardizedValue(value: number, mean: number, std: number): number {
  const delta = value - mean;
  return Number.isFinite(delta) ? delta / std : value / std - mean / std;
}

function objectiveStatistics(values: readonly number[]) {
  if (values.length === 0) return { yMean: 0, yStd: 1, bestValue: null };
  if (values.length === 1) return { yMean: values[0], yStd: 1, bestValue: values[0] };

  let scale = 1;
  let bestValue = values[0];
  let largest = values[0];
  for (const value of values) {
    scale = Math.max(scale, Math.abs(value));
    bestValue = Math.min(bestValue, value);
    largest = Math.max(largest, value);
  }

  const n = values.length;
  const scaledMean = values.reduce((sum, value) => sum + value / scale, 0) / n;
  const yMean = Math.min(largest, Math.max(bestValue, scaledMean * scale));
  const variance = values.reduce((sum, value) => sum + standardizedValue(value, yMean, scale) ** 2, 0) / n;
  // Population standard deviation is bounded by the largest absolute objective.
  const yStd = Math.max(1e-6, Math.min(1, Math.sqrt(variance)) * scale);
  return { yMean: yMean + 0, yStd, bestValue };
}

function standardizedTargets(snapshot: Pick<GpSnapshot, "observations" | "yMean" | "yStd">, direction: number) {
  return Float64Array.from(snapshot.observations, ({ value }) =>
    standardizedValue(direction * value, snapshot.yMean, snapshot.yStd));
}

function factorTrainingMatrix(
  coords: readonly (readonly number[])[],
  config: ResolvedGpConfig,
  lengthScale: number,
  targets: Float64Array,
) {
  const n = coords.length;
  let lower: Float64Array;
  if (config.noise * config.noise === Infinity) {
    // At this scale the unit signal contributes below floating-point precision.
    lower = new Float64Array(n * n);
    for (let i = 0; i < n; i++) lower[i * n + i] = config.noise;
  } else {
    const matrix = buildKernelMatrix(coords, config.kernel, lengthScale, config.noise);
    lower = choleskyDecompose(matrix, n).lower;
  }
  const alpha = solveCholesky(lower, n, targets);
  const likelihood = -0.5 * (dot(targets, alpha) + choleskyLogDet(lower, n)) - n * logSqrtTwoPi;
  return { lower, alpha, likelihood };
}

interface Scored<T> {
  position: number;
  score: number;
  value: T;
}

function goldenSection<T>(
  low: number,
  high: number,
  iterations: number,
  evaluate: (position: number) => Scored<T>,
): Scored<T> {
  let left = evaluate(high - goldenRatio * (high - low));
  let right = evaluate(low + goldenRatio * (high - low));
  for (let i = 1; i < iterations; i++) {
    if (left.score < right.score) {
      low = left.position;
      left = right;
      right = evaluate(low + goldenRatio * (high - low));
    } else {
      high = right.position;
      right = left;
      left = evaluate(high - goldenRatio * (high - low));
    }
  }
  return left.score >= right.score ? left : right;
}

function fitTrainingMatrix(
  coords: readonly (readonly number[])[],
  span: number,
  config: ResolvedGpConfig,
  targets: Float64Array,
) {
  const evaluate = (lengthScale: number) => ({
    lengthScale,
    ...factorTrainingMatrix(coords, config, lengthScale, targets),
  });
  if (config.lengthScaleRule === "manual") return evaluate(config.lengthScale);
  if (coords.length < 2) return evaluate(Math.max(Number.MIN_VALUE, span / 5));

  const shortest = Math.max(Number.MIN_VALUE, span * 0.05);
  const longest = Math.min(Number.MAX_VALUE, span * 1.5);
  const low = Math.log(shortest);
  const high = Math.log(longest);
  const scoreAt = (position: number) => {
    const value = evaluate(Math.max(shortest, Math.min(longest, Math.exp(position))));
    return { position, score: value.likelihood, value };
  };
  const gridSize = 11;
  const gridPosition = (i: number) => low + (high - low) * (i / (gridSize - 1));
  let bestIndex = 0;
  let best = scoreAt(low);
  for (let i = 1; i < gridSize; i++) {
    const candidate = scoreAt(gridPosition(i));
    if (candidate.score > best.score) {
      best = candidate;
      bestIndex = i;
    }
  }
  const refined = goldenSection(gridPosition(Math.max(0, bestIndex - 1)),
    gridPosition(Math.min(gridSize - 1, bestIndex + 1)), 6, scoreAt);
  return refined.score > best.score ? refined.value : best.value;
}

function pointCoordinates(point: Point, parameters: readonly Parameter[]): number[] {
  return parameters.map(({ id }) => {
    const value = point[id];
    if (!Object.hasOwn(point, id) || !Number.isFinite(value)) throw new Error("Invalid GP prediction point.");
    return value;
  });
}

function gridCoordinate({ low, high }: Parameter, index: number, lastIndex: number): number {
  return index === lastIndex ? high : Math.min(high, low + (high - low) * (index / lastIndex));
}

interface Candidate {
  coords: readonly number[];
  prediction: GpPrediction;
}

const compareCandidates = (a: Candidate, b: Candidate) => b.prediction.acquisition - a.prediction.acquisition;

function optimize1D(parameter: Parameter, evaluate: (coords: readonly number[]) => Candidate): Candidate {
  const last = 200;
  const grid = Array.from({ length: last + 1 }, (_, i) => evaluate([gridCoordinate(parameter, i, last)]));
  const peaks = grid.slice(1, last).filter((candidate, i) =>
    compareCandidates(candidate, grid[i]) < 0 && compareCandidates(candidate, grid[i + 2]) <= 0)
    .sort(compareCandidates).slice(0, 3);
  let best = [grid[0], grid[last], ...peaks].sort(compareCandidates)[0];

  // Boundary candidates also get a one-sided refinement interval.
  for (const candidate of [grid[0], ...peaks, grid[last]]) {
    const index = grid.indexOf(candidate);
    const low = grid[Math.max(0, index - 1)].coords[0];
    const high = grid[Math.min(last, index + 1)].coords[0];
    const refined = goldenSection(low, high, 12, (position) => {
      const value = evaluate([position]);
      return { position, score: value.prediction.acquisition, value };
    }).value;
    if (compareCandidates(refined, best) < 0) best = refined;
  }
  return best;
}

function optimize2D(
  parameters: readonly Parameter[],
  seed: number,
  evaluate: (coords: readonly number[]) => Candidate,
): Candidate {
  const [x, y] = parameters;
  const last = 24;
  const candidates: Candidate[] = [];
  for (let i = 0; i <= last; i++) {
    for (let j = 0; j <= last; j++) {
      candidates.push(evaluate([gridCoordinate(x, i, last), gridCoordinate(y, j, last)]));
    }
  }
  for (let i = 0; i < 64; i++) {
    candidates.push(evaluate(parameters.map(({ low, high }, axis) =>
      Math.min(high, low + (high - low) * randomSample(seed, 2 * i + axis)))));
  }

  const top = candidates.sort(compareCandidates).slice(0, 4);
  let best = top[0];
  for (const start of top) {
    let current = start;
    const steps = parameters.map(({ low, high }) => (high - low) / 25);
    const tolerances = parameters.map(({ low, high }) => Math.max(1e-4, Number.EPSILON * (high - low)));
    while (steps.some((step, axis) => step >= tolerances[axis])) {
      let neighbor = current;
      for (const [axis, { low, high }] of parameters.entries()) {
        if (steps[axis] < tolerances[axis]) continue;
        for (const sign of [-1, 1]) {
          const coords = [...current.coords];
          coords[axis] = Math.max(low, Math.min(high, coords[axis] + sign * steps[axis]));
          if (coords[axis] === current.coords[axis]) continue;
          const trial = evaluate(coords);
          if (compareCandidates(trial, neighbor) < 0) neighbor = trial;
        }
      }
      if (neighbor === current) {
        steps[0] /= 2;
        steps[1] /= 2;
      }
      current = neighbor;
    }
    if (compareCandidates(current, best) < 0) best = current;
  }
  return best;
}

function expectedImprovement(improvement: number, std: number): number {
  if (std <= 1e-12) return Math.max(0, improvement);
  const z = improvement / std;
  // Use improvement directly in the first term to avoid overflow in the standardized ratio.
  const cdf = normalCdf(z);
  return Math.max(0, (cdf === 0 ? 0 : improvement * cdf) + std * normalPdf(z));
}

function modelRuntime(
  snapshot: GpSnapshot,
  { lower, alpha }: ReturnType<typeof factorTrainingMatrix>,
): FittedGpModel {
  const { problem, config, observations, resolvedLengthScale, yMean, yStd, bestValue } = snapshot;
  const { parameters } = problem;
  const direction = problem.directions[0] === "minimize" ? 1 : -1;
  const n = observations.length;
  const covariance = (a: readonly number[], b: readonly number[]) =>
    kernelValue(config.kernel, euclideanDistance(a, b), resolvedLengthScale);
  const conditionAt = (coords: readonly number[]) => {
    const cross = Float64Array.from(observations, (observation) => covariance(coords, observation.coords));
    return { mean: dot(cross, alpha), projected: solveLower(lower, n, cross) };
  };
  const objectiveMean = (mean: number) => direction * (yMean + yStd * mean);
  const evaluate = (coords: readonly number[]): Candidate => {
    const conditioned = conditionAt(coords);
    const mean = objectiveMean(conditioned.mean);
    const std = yStd * Math.sqrt(Math.max(0, 1 - dot(conditioned.projected, conditioned.projected)));
    let acquisition: number;
    if (config.acquisition === "ucb") {
      acquisition = -direction * mean + config.beta * std;
    } else if (bestValue === null) {
      acquisition = std;
    } else {
      acquisition = expectedImprovement(bestValue - direction * mean - config.xi * yStd, std);
    }
    return { coords, prediction: { mean, std, acquisition } };
  };

  return Object.freeze<FittedGpModel>({
    snapshot,
    predict(points) {
      return points.map((point) => evaluate(pointCoordinates(point, parameters)).prediction);
    },
    samplePosterior(points, count, seed) {
      validateRandomSeed(seed);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid GP posterior sample count.");
      if (count === 0) return [];
      const coords = points.map((point) => pointCoordinates(point, parameters));
      const conditioned = coords.map(conditionAt);
      const size = coords.length;
      const matrix = new Float64Array(size * size);
      for (let i = 0; i < size; i++) {
        for (let j = 0; j <= i; j++) {
          const value = covariance(coords[i], coords[j]) - dot(conditioned[i].projected, conditioned[j].projected);
          matrix[i * size + j] = value;
          matrix[j * size + i] = value;
        }
      }
      const factor = choleskyDecompose(matrix, size, 1e-6).lower;
      const normals = new Float64Array(size);
      return Array.from({ length: count }, (_, draw) => {
        // Each draw uses the same normal variates across kernel and hyperparameter changes.
        const offset = draw * (size + size % 2);
        for (let i = 0; i < size; i += 2) {
          const radius = Math.sqrt(-2 * Math.log1p(-randomSample(seed, offset + i)));
          const angle = 2 * Math.PI * randomSample(seed, offset + i + 1);
          normals[i] = radius * Math.cos(angle);
          if (i + 1 < size) normals[i + 1] = radius * Math.sin(angle);
        }
        return conditioned.map(({ mean }, i) => {
          let value = mean;
          for (let j = 0; j <= i; j++) value += factor[i * size + j] * normals[j];
          return objectiveMean(value);
        });
      });
    },
    propose(seed) {
      validateRandomSeed(seed);
      const { coords, prediction } = parameters.length === 1
        ? optimize1D(parameters[0], evaluate)
        : optimize2D(parameters, seed, evaluate);
      return freezeData({
        version: 1, method: "gp", seed, problem, config,
        historyKey: snapshot.historyKey, inputTrialIds: snapshot.inputTrialIds,
        modelId: snapshot.id, resolvedLengthScale, prediction,
        selected: Object.fromEntries(parameters.map(({ id }, i) => [id, coords[i] + 0])),
      });
    },
  });
}

function fitResolvedGp(problem: Problem, input: readonly Observation[], config: ResolvedGpConfig): FittedGpModel {
  const direction = problem.directions[0] === "minimize" ? 1 : -1;
  const observations = input.map(({ id, params, objectives }) => ({
    id: id + 0,
    coords: problem.parameters.map((parameter) => params[parameter.id] + 0),
    value: objectives[0] + 0,
  }));
  const statistics = objectiveStatistics(observations.map(({ value }) => direction * value + 0));
  const targets = standardizedTargets({ observations, ...statistics }, direction);
  const fit = fitTrainingMatrix(observations.map(({ coords }) => coords), minimumSpan(problem), config, targets);
  const context = provenance(problem, input, config);
  const snapshot: GpSnapshot = freezeData({
    ...context,
    id: dataKey(["gp", context.problem, config, context.historyKey]),
    ...statistics,
    observations,
    resolvedLengthScale: fit.lengthScale,
    logMarginalLikelihood: input.length === 0 ? null : fit.likelihood,
  });
  return modelRuntime(snapshot, fit);
}

export function fitGp(problem: Problem, observations: readonly Observation[], config?: GpConfig): FittedGpModel {
  const resolved = resolveGpConfig(problem, config);
  validateObservations(problem, observations);
  return fitResolvedGp(problem, observations, resolved);
}

/** Reconstruct the runtime from a trusted snapshot produced by fitGp. */
export function restoreGpModel(input: GpSnapshot): FittedGpModel {
  if (input.version !== 1) throw new Error("Unsupported GP snapshot version.");
  const snapshot = freezeData(structuredClone(input));
  const direction = snapshot.problem.directions[0] === "minimize" ? 1 : -1;
  const targets = standardizedTargets(snapshot, direction);
  const fit = factorTrainingMatrix(snapshot.observations.map(({ coords }) => coords),
    snapshot.config, snapshot.resolvedLengthScale, targets);
  return modelRuntime(snapshot, fit);
}

export function proposeGp(
  problem: Problem,
  observations: readonly Observation[],
  config: GpConfig | undefined,
  seed: number,
): GpProposalTrace {
  validateRandomSeed(seed);
  const resolved = resolveGpConfig(problem, config);
  validateObservations(problem, observations);
  if (observations.length >= resolved.startupTrials) return fitResolvedGp(problem, observations, resolved).propose(seed);
  return freezeData({
    ...provenance(problem, observations, resolved),
    method: "random", reason: "startup", seed,
    selected: sampleUniformPoint(problem, seed, observations.length),
  });
}
