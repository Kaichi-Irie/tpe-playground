import type { Point, Problem } from "../types";

export interface CmaEsConfig {
  readonly sigma0?: number;
  readonly populationSize?: number;
  readonly x0?: Point;
}

export interface ResolvedCmaEsConfig {
  readonly sigma0: number;
  readonly populationSize: number;
  readonly x0: Point;
}

export type Vector2 = readonly [number, number];
export type Matrix2x2 = readonly [Vector2, Vector2];

export interface Eigen2x2 {
  readonly eigenvalues: Vector2;
  readonly eigenvectors: readonly [Vector2, Vector2];
  readonly angle: number;
}

export interface CovarianceEllipse2D {
  readonly center: Vector2;
  readonly angle: number;
  readonly radii1Sigma: Vector2;
  readonly radii2Sigma: Vector2;
  readonly eigenvalues: Vector2;
  readonly eigenvectors: readonly [Vector2, Vector2];
}

export interface CmaEsSnapshot {
  readonly version: 1;
  readonly id: string;
  readonly problem: Problem;
  readonly config: ResolvedCmaEsConfig;
  readonly inputTrialIds: readonly number[];
  readonly historyKey: string;
  readonly generation: number;
  readonly generationProgress: number;
  readonly mean: Point;
  readonly sigma: number;
  readonly covariance: Matrix2x2;
  readonly pc: Vector2;
  readonly ps: Vector2;
  readonly ellipse: CovarianceEllipse2D;
  readonly meanPath: readonly Point[];
  readonly currentGenerationTrialIds: readonly number[];
  readonly lastGenerationTrialIds: readonly number[];
}

export interface CmaEsProposalTrace {
  readonly version: 1;
  readonly method: "cmaes";
  readonly modelId: string;
  readonly seed: number;
  readonly problem: Problem;
  readonly config: ResolvedCmaEsConfig;
  readonly historyKey: string;
  readonly inputTrialIds: readonly number[];
  readonly generation: number;
  readonly indexInGeneration: number;
  readonly resampleAttempts: number;
  readonly clamped: boolean;
  readonly selected: Point;
}
