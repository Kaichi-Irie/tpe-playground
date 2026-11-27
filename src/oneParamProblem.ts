import type { Observation, Problem } from "./model/types";

export interface Trial { id: number; x: number; y: number }
export const trialLimit = 200;
export const domain = [-5, 5] as const;

export const oneParamProblem: Problem = { id: "multimodal", parameters: [{ id: "x", low: domain[0], high: domain[1] }], directions: ["minimize"], constraintCount: 0 };
export const oneParamObservations = (trials: readonly Trial[]): Observation[] => trials.map((t) => ({ id: t.id, params: { x: t.x }, objectives: [t.y], constraints: [] }));
