import type { Point, Problem } from "../types";

export type GpKernel = "matern52" | "rbf";
export type GpAcquisition = "ucb" | "ei";
export type GpLengthScaleRule = "auto" | "manual";

export interface GpConfig {
  readonly kernel?: GpKernel;
  readonly acquisition?: GpAcquisition;
  readonly lengthScaleRule?: GpLengthScaleRule;
  /** Manual length scale in the original coordinate units. */
  readonly lengthScale?: number;
  readonly beta?: number;
  /** Expected improvement offset in standardized objective units. */
  readonly xi?: number;
  /** Observation noise standard deviation in standardized objective units. */
  readonly noise?: number;
  readonly startupTrials?: number;
}

export type ResolvedGpConfig = Required<GpConfig>;

export interface GpPrediction {
  readonly mean: number;
  readonly std: number;
  readonly acquisition: number;
}

export interface GpSnapshot {
  readonly version: 1;
  readonly id: string;
  readonly problem: Problem;
  readonly config: ResolvedGpConfig;
  readonly inputTrialIds: readonly number[];
  readonly historyKey: string;
  readonly resolvedLengthScale: number;
  readonly yMean: number;
  readonly yStd: number;
  /** Best objective in minimization-oriented units. */
  readonly bestValue: number | null;
  readonly observations: readonly {
    readonly id: number;
    /** Original coordinate units, in declared parameter order. */
    readonly coords: readonly number[];
    readonly value: number;
  }[];
  readonly logMarginalLikelihood: number | null;
}

interface GpProposalContext {
  readonly version: 1;
  readonly seed: number;
  readonly problem: Problem;
  readonly config: ResolvedGpConfig;
  readonly historyKey: string;
  readonly inputTrialIds: readonly number[];
  readonly selected: Point;
}

export type GpProposalTrace = GpProposalContext & (
  | { readonly method: "random"; readonly reason: "startup" }
  | {
    readonly method: "gp";
    readonly modelId: string;
    readonly resolvedLengthScale: number;
    readonly prediction: GpPrediction;
  }
);

export interface FittedGpModel {
  readonly snapshot: GpSnapshot;
  predict(points: readonly Point[]): GpPrediction[];
  samplePosterior(points: readonly Point[], count: number, seed: number): number[][];
  propose(seed: number): GpProposalTrace;
}
