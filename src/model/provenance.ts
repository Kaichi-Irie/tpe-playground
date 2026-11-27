import type { Observation, Problem } from "./types";

export function freezeData<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeData);
    Object.freeze(value);
  }
  return value;
}

// Cache/provenance key, not a security hash. Includes values, not just trial IDs.
export function dataKey(value: unknown): string {
  const text = JSON.stringify(value);
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}

export function historyKeyFor(problem: Problem, observations: readonly Observation[]): string {
  return dataKey(observations.map((t) => [t.id, problem.parameters.map((p) => t.params[p.id]), t.objectives, t.constraints]));
}
