import { randomSample, validateRandomSeed } from "../numpyRandom";
import type { Observation, Parameter, Point, Problem } from "../types";
import { applyInvSqrtCovariance, applySqrtCovariance, buildCovarianceEllipse, decomposeSymmetric2x2 } from "./eigen";
import type { CmaEsConfig, CmaEsProposalTrace, CmaEsSnapshot, Matrix2x2, ResolvedCmaEsConfig, Vector2 } from "./types";

const dimension = 2;
const maxResampleAttempts = 100;
const randomStride = 2 * (maxResampleAttempts + 1);
const minEigenvalue = 1e-16;
const maxEigenvalue = 1e16;
const minSigma = 1e-12;
type Axes = readonly [Parameter, Parameter];

export const defaultCmaEsPopulationSize = 4 + Math.floor(3 * Math.log(dimension));

export function defaultCmaEsSigma0(problem: Problem): number {
  const span = Math.min(...problem.parameters.map(({ low, high }) => high - low));
  return Math.max(Number.MIN_VALUE, span / 6);
}

function validateProblem(problem: Problem): asserts problem is Problem & { parameters: Axes } {
  if (problem.parameters.length !== dimension) throw new Error("CMA-ES requires exactly two parameters.");
  const [first, second] = problem.parameters;
  if (first.id === second.id || problem.parameters.some(({ id, low, high }) =>
    typeof id !== "string" || !id || !Number.isFinite(low) || !Number.isFinite(high)
    || low >= high || !Number.isFinite(high - low))) {
    throw new Error("Invalid CMA-ES search space.");
  }
  if (problem.directions.length !== 1 || !["minimize", "maximize"].includes(problem.directions[0])) {
    throw new Error("CMA-ES requires one minimize or maximize objective.");
  }
  if (problem.constraintCount > 0) throw new Error("CMA-ES does not support constrained problems.");
  if (problem.constraintCount !== 0) throw new Error("Invalid CMA-ES constraint count.");
}

function toVector(point: Point, [x, y]: Axes): Vector2 {
  return [point[x.id], point[y.id]];
}

function toPoint([x, y]: Vector2, [first, second]: Axes): Point {
  return { [first.id]: x, [second.id]: y };
}

function inRange(value: number, { low, high }: Parameter): boolean {
  return Number.isFinite(value) && value >= low && value <= high;
}

function isBoxPoint(point: Point, axes: Axes): boolean {
  return Object.keys(point).length === dimension
    && axes.every((axis) => Object.hasOwn(point, axis.id) && inRange(point[axis.id], axis));
}

function clampToBox([x, y]: Vector2, [first, second]: Axes): Vector2 {
  return [
    Math.min(first.high, Math.max(first.low, x)),
    Math.min(second.high, Math.max(second.low, y)),
  ];
}

function resolveConfig(problem: Problem, axes: Axes, config: CmaEsConfig): ResolvedCmaEsConfig {
  const {
    sigma0 = defaultCmaEsSigma0(problem),
    populationSize = defaultCmaEsPopulationSize,
    x0 = toPoint([
      axes[0].low + (axes[0].high - axes[0].low) / 2,
      axes[1].low + (axes[1].high - axes[1].low) / 2,
    ], axes),
  } = config;
  if (!Number.isFinite(sigma0) || sigma0 <= 0) throw new Error("Invalid CMA-ES sigma0.");
  if (!Number.isInteger(populationSize) || populationSize < 4 || populationSize > 1000) {
    throw new Error("Invalid CMA-ES populationSize. Expected an integer from 4 to 1000.");
  }
  if (!x0 || !isBoxPoint(x0, axes)) throw new Error("Invalid CMA-ES x0. Expected a point inside the search space.");
  return { sigma0, populationSize, x0: toPoint(toVector(x0, axes), axes) };
}

export function resolveCmaEsConfig(problem: Problem, config: CmaEsConfig = {}): ResolvedCmaEsConfig {
  validateProblem(problem);
  return resolveConfig(problem, problem.parameters, config);
}

function validateCmaEsInput(problem: Problem, observations: readonly Observation[], config: CmaEsConfig) {
  validateProblem(problem);
  const axes = problem.parameters;
  const resolved = resolveConfig(problem, axes, config);
  const ids = new Set<number>();
  for (const { id, params, objectives, constraints } of observations) {
    if (!Number.isInteger(id) || id < 0 || ids.has(id) || objectives.length !== 1
      || !Number.isFinite(objectives[0]) || constraints.length !== 0 || !isBoxPoint(params, axes)) {
      throw new Error("Invalid CMA-ES observations.");
    }
    ids.add(id);
  }
  return { axes, resolved };
}

function freezeData<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeData);
    Object.freeze(value);
  }
  return value;
}

// Provenance key for serialized model inputs, matching the TPE key format.
function dataKey(value: unknown): string {
  const text = JSON.stringify(value);
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}

function strategyParameters(populationSize: number) {
  const n = dimension;
  const mu = Math.floor(populationSize / 2);
  const rawWeights = Array.from({ length: mu }, (_, i) => Math.log((populationSize + 1) / 2) - Math.log(i + 1));
  const sum = rawWeights.reduce((total, weight) => total + weight, 0);
  const weights = rawWeights.map((weight) => weight / sum);
  const muEff = 1 / weights.reduce((total, weight) => total + weight ** 2, 0);
  const cSigma = (muEff + 2) / (n + muEff + 5);
  const dSigma = 1 + 2 * Math.max(0, Math.sqrt((muEff - 1) / (n + 1)) - 1) + cSigma;
  const cc = (4 + muEff / n) / (n + 4 + 2 * muEff / n);
  const c1 = 2 / ((n + 1.3) ** 2 + muEff);
  const cMu = Math.min(1 - c1, 2 * (muEff - 2 + 1 / muEff) / ((n + 2) ** 2 + muEff));
  const chi = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n ** 2));
  return {
    weights, cSigma, dSigma, cc, c1, cMu, chi,
    sigmaPathScale: Math.sqrt(cSigma * (2 - cSigma) * muEff),
    covariancePathScale: Math.sqrt(cc * (2 - cc) * muEff),
  };
}

interface ReplayState {
  readonly mean: Vector2;
  readonly sigma: number;
  readonly covariance: Matrix2x2;
  readonly pc: Vector2;
  readonly ps: Vector2;
}

function conditionCovariance(matrix: Matrix2x2): Matrix2x2 {
  const { eigenvalues: [major, minor], eigenvectors: [[x, y]] } = decomposeSymmetric2x2(matrix, minEigenvalue);
  if (major <= maxEigenvalue && minor > minEigenvalue) return matrix;
  const l1 = Math.min(maxEigenvalue, major);
  const l2 = Math.min(maxEigenvalue, minor);
  const offDiagonal = (l1 - l2) * x * y;
  return [[l1 * x ** 2 + l2 * y ** 2, offDiagonal], [offDiagonal, l1 * y ** 2 + l2 * x ** 2]];
}

function standardizedStep([x, y]: Vector2, [mx, my]: Vector2, sigma: number): Vector2 {
  const dx = x - mx;
  const dy = y - my;
  // Leave headroom for outer products when replaying a large jump at a tiny sigma.
  const divisor = Math.max(sigma, Math.abs(dx) / 1e140, Math.abs(dy) / 1e140);
  return [dx / divisor, dy / divisor];
}

function addScaledStep(mean: number, sigma: number, step: number): number {
  const displacement = sigma * step;
  // A displacement can overflow even when adding it to the mean fits.
  return Number.isFinite(displacement) ? mean + displacement : sigma * (mean / sigma + step);
}

function updateGeneration(
  { mean, sigma, covariance, pc, ps }: ReplayState,
  selected: readonly Vector2[],
  axes: Axes,
  generation: number,
  maxSigma: number,
  { weights, cSigma, dSigma, cc, c1, cMu, chi, sigmaPathScale, covariancePathScale }: ReturnType<typeof strategyParameters>,
): ReplayState {
  const [anchorX, anchorY] = selected[0];
  let offsetX = 0;
  let offsetY = 0;
  let rankXX = 0;
  let rankXY = 0;
  let rankYY = 0;
  selected.forEach((point, i) => {
    const weight = weights[i];
    offsetX += weight * (point[0] - anchorX);
    offsetY += weight * (point[1] - anchorY);
    const [dx, dy] = standardizedStep(point, mean, sigma);
    rankXX += weight * dx * dx;
    rankXY += weight * dx * dy;
    rankYY += weight * dy * dy;
  });
  const meanNew = clampToBox([anchorX + offsetX, anchorY + offsetY], axes);
  const step = standardizedStep(meanNew, mean, sigma);
  const [wx, wy] = applyInvSqrtCovariance(decomposeSymmetric2x2(covariance, minEigenvalue), step);
  const psNew: Vector2 = [(1 - cSigma) * ps[0] + sigmaPathScale * wx, (1 - cSigma) * ps[1] + sigmaPathScale * wy];
  const psNorm = Math.hypot(...psNew);
  const pathCorrection = Math.sqrt(1 - (1 - cSigma) ** (2 * (generation + 1)));
  const hSigma = psNorm / pathCorrection < (1.4 + 2 / (dimension + 1)) * chi ? 1 : 0;
  const pcNew: Vector2 = [
    (1 - cc) * pc[0] + hSigma * covariancePathScale * step[0],
    (1 - cc) * pc[1] + hSigma * covariancePathScale * step[1],
  ];
  const delta = (1 - hSigma) * cc * (2 - cc);
  const retain = 1 - c1 - cMu + c1 * delta;
  const offDiagonal = retain * covariance[0][1] + c1 * pcNew[0] * pcNew[1] + cMu * rankXY;
  const covarianceNew = conditionCovariance([
    [retain * covariance[0][0] + c1 * pcNew[0] ** 2 + cMu * rankXX, offDiagonal],
    [offDiagonal, retain * covariance[1][1] + c1 * pcNew[1] ** 2 + cMu * rankYY],
  ]);
  const sigmaNew = Math.max(minSigma, Math.min(maxSigma, sigma * Math.exp((cSigma / dSigma) * (psNorm / chi - 1))));
  return { mean: meanNew, sigma: sigmaNew, covariance: covarianceNew, pc: pcNew, ps: psNew };
}

export interface FittedCmaEsModel {
  readonly snapshot: CmaEsSnapshot;
  propose(seed: number): CmaEsProposalTrace;
  logDensity(points: readonly Point[]): number[];
}

function modelRuntime(snapshot: CmaEsSnapshot): FittedCmaEsModel {
  const { problem, config, historyKey, inputTrialIds, generation, generationProgress, sigma, ellipse } = snapshot;
  const axes: Axes = [problem.parameters[0], problem.parameters[1]];
  const [mx, my] = ellipse.center;
  const [l1, l2] = ellipse.eigenvalues;
  const logNormalizingFactor = -Math.log(2 * Math.PI) - 2 * Math.log(sigma) - 0.5 * (Math.log(l1) + Math.log(l2));
  return {
    snapshot,
    logDensity(points: readonly Point[]): number[] {
      return points.map((point) => {
        const [x, y] = toVector(point, axes);
        // Divide before subtraction only if the difference overflows.
        const dx = Number.isFinite(x - mx) ? (x - mx) / sigma : x / sigma - mx / sigma;
        const dy = Number.isFinite(y - my) ? (y - my) / sigma : y / sigma - my / sigma;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return -Infinity;
        const norm = Math.hypot(...applyInvSqrtCovariance(ellipse, [dx, dy]));
        return Number.isFinite(norm) ? logNormalizingFactor - norm * (norm / 2) : -Infinity;
      });
    },
    propose(seed: number): CmaEsProposalTrace {
      validateRandomSeed(seed);
      const offset = inputTrialIds.length * randomStride;
      let candidate: Vector2 = ellipse.center;
      let resampleAttempts = 0;
      let clamped = false;
      for (let attempt = 0; attempt <= maxResampleAttempts; attempt++) {
        resampleAttempts = attempt;
        const u1 = randomSample(seed, offset + attempt * 2);
        const u2 = randomSample(seed, offset + attempt * 2 + 1);
        const radius = Math.sqrt(-2 * Math.log(1 - u1));
        const angle = 2 * Math.PI * u2;
        const [dx, dy] = applySqrtCovariance(ellipse, [radius * Math.cos(angle), radius * Math.sin(angle)]);
        candidate = [addScaledStep(mx, sigma, dx), addScaledStep(my, sigma, dy)];
        if (inRange(candidate[0], axes[0]) && inRange(candidate[1], axes[1])) break;
        clamped = attempt === maxResampleAttempts;
      }
      return freezeData({
        version: 1, method: "cmaes", modelId: snapshot.id, seed, problem, config, historyKey, inputTrialIds,
        generation, indexInGeneration: generationProgress, resampleAttempts, clamped,
        selected: toPoint(clamped ? clampToBox(candidate, axes) : candidate, axes),
      });
    },
  };
}

export function restoreCmaEsModel(snapshot: CmaEsSnapshot): FittedCmaEsModel {
  return modelRuntime(freezeData(structuredClone(snapshot)));
}

export function fitCmaEs(problem: Problem, observations: readonly Observation[], config: CmaEsConfig = {}): FittedCmaEsModel {
  const { axes, resolved } = validateCmaEsInput(problem, observations, config);
  const { populationSize, sigma0, x0 } = resolved;
  const generation = Math.floor(observations.length / populationSize);
  const direction = problem.directions[0] === "minimize" ? 1 : -1;
  const strategy = strategyParameters(populationSize);
  const maxSpan = Math.max(...axes.map(({ low, high }) => high - low));
  const maxSigma = Math.min(Number.MAX_VALUE, 1e6 * maxSpan);
  let state: ReplayState = { mean: toVector(x0, axes), sigma: sigma0, covariance: [[1, 0], [0, 1]], pc: [0, 0], ps: [0, 0] };
  const meanPath = [x0];
  for (let g = 0; g < generation; g++) {
    const selected = observations.slice(g * populationSize, (g + 1) * populationSize)
      .sort((a, b) => direction * (a.objectives[0] - b.objectives[0]) || a.id - b.id)
      .slice(0, strategy.weights.length)
      .map(({ params }) => toVector(params, axes));
    state = updateGeneration(state, selected, axes, g, maxSigma, strategy);
    meanPath.push(toPoint(state.mean, axes));
  }
  const inputTrialIds = observations.map(({ id }) => id);
  const historyKey = dataKey(observations.map(({ id, params, objectives, constraints }) =>
    [id, toVector(params, axes), objectives, constraints]));
  const generationStart = generation * populationSize;
  const { mean, sigma, covariance, pc, ps } = state;
  return modelRuntime(freezeData({
    version: 1, id: dataKey(["cmaes", problem, resolved, historyKey]),
    problem: structuredClone(problem), config: resolved, inputTrialIds, historyKey,
    generation, generationProgress: observations.length % populationSize,
    mean: meanPath[generation], sigma, covariance, pc, ps, meanPath,
    ellipse: buildCovarianceEllipse(mean, sigma, decomposeSymmetric2x2(covariance, minEigenvalue)),
    currentGenerationTrialIds: inputTrialIds.slice(generationStart),
    lastGenerationTrialIds: inputTrialIds.slice(Math.max(0, generationStart - populationSize), generationStart),
  }));
}

export function proposeCmaEs(
  problem: Problem, observations: readonly Observation[], config: CmaEsConfig, seed: number,
): CmaEsProposalTrace {
  return fitCmaEs(problem, observations, config).propose(seed);
}
