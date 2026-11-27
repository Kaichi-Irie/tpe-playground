import { randomSample } from "./numpyRandom";
import type { Observation, Parameter, Point, Problem } from "./types";

// Engines validate their own dimension, objective and constraint policies.
export function validateProblem(problem: Problem, message = "Invalid search space."): void {
  const { parameters } = problem;
  if (!parameters.length || new Set(parameters.map((p) => p.id)).size !== parameters.length
    || parameters.some(({ id, low, high }) => typeof id !== "string" || !id
      || !Number.isFinite(low) || !Number.isFinite(high) || low >= high || !Number.isFinite(high - low))) {
    throw new Error(message);
  }
}

export function inParameterRange(value: number, { low, high }: Parameter): boolean {
  return Number.isFinite(value) && value >= low && value <= high;
}

export function isBoxPoint(point: Point, parameters: readonly Parameter[], requireOwnCoordinates = true): boolean {
  return Object.keys(point).length === parameters.length && parameters.every((parameter) =>
    (!requireOwnCoordinates || Object.hasOwn(point, parameter.id)) && inParameterRange(point[parameter.id], parameter));
}

export function validateObservations(
  problem: Problem,
  observations: readonly Observation[],
  { message = "Invalid observations.", requireOwnCoordinates = true } = {},
): void {
  const ids = new Set<number>();
  for (const { id, params, objectives, constraints } of observations) {
    if (!Number.isInteger(id) || id < 0 || ids.has(id)
      || objectives.length !== problem.directions.length || !Array.from(objectives).every(Number.isFinite)
      || constraints.length !== problem.constraintCount || !Array.from(constraints).every(Number.isFinite)
      || !Number.isFinite(constraints.reduce((sum, value) => sum + Math.max(0, value), 0))
      || !isBoxPoint(params, problem.parameters, requireOwnCoordinates)) {
      throw new Error(message);
    }
    ids.add(id);
  }
}

export function sampleUniformPoint(problem: Problem, seed: number, trialCount: number): Point {
  const offset = trialCount * problem.parameters.length;
  return Object.fromEntries(problem.parameters.map(({ id, low, high }, i) =>
    [id, low + (high - low) * randomSample(seed, offset + i)]));
}
