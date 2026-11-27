import type { Observation, Parameter, Point, Problem } from "../types";
import type { BandwidthRule } from "./bandwidth";

export type DensityMode = "univariate" | "multivariate";
export type WeightStrategy = "uniform" | "recency" | "ei" | "optuna";
export interface TpeConfig {
  readonly mode: DensityMode;
  readonly bandwidth: number;
  readonly bandwidthRule?: BandwidthRule;
  readonly gamma: number;
  readonly weights: WeightStrategy;
  readonly priorWeight: number;
  readonly startupTrials: number;
  readonly candidates: number;
  readonly infeasibleFilling?: boolean;
}
export interface WeightedTrial { readonly trialId: number; readonly weight: number }
export type Partition = {
  readonly good: readonly WeightedTrial[];
  readonly bad: readonly WeightedTrial[];
} & (
  { readonly kind: "single-objective"; readonly threshold: number } |
  {
    readonly kind: "constrained-single-objective";
    readonly nBelow: number;
    readonly feasibleTrialIds: readonly number[];
    readonly violations: Readonly<Record<number, number>>;
    readonly filledTrialIds: readonly number[];
  }
);
export interface Kernel {
  readonly source: { readonly kind: "observation"; readonly trialId: number } | { readonly kind: "prior" };
  readonly center: Point;
  readonly bandwidths: Point;
  readonly observationWeight: number;
  readonly mixtureWeight: number;
}
export interface DensitySnapshot {
  readonly parameters: readonly Parameter[];
  readonly kernels: readonly Kernel[];
  readonly normalization: "truncated-box";
  readonly sampling: "truncated-components";
}
export interface GroupModel {
  readonly id: string;
  readonly parameterIds: readonly string[];
  readonly good: DensitySnapshot;
  readonly bad: DensitySnapshot;
}
export interface ModelSnapshot {
  readonly version: 2;
  readonly id: string;
  readonly problem: Problem;
  readonly config: TpeConfig;
  readonly inputTrialIds: readonly number[];
  readonly historyKey: string;
  readonly partition: Partition;
  readonly groups: readonly GroupModel[];
}
export interface Evaluation { readonly logL: number; readonly logG: number; readonly score: number }
export interface GroupTrace {
  readonly groupId: string;
  readonly parameterIds: readonly string[];
  readonly candidates: readonly (Evaluation & { readonly params: Point })[];
  readonly selectedIndex: number;
}
interface ProposalContext {
  readonly version: 2;
  readonly seed: number;
  readonly config: TpeConfig;
  readonly problem: Problem;
  readonly historyKey: string;
  readonly inputTrialIds: readonly number[];
  readonly selected: Point;
}
export type ProposalTrace = ProposalContext & (
  { readonly method: "random"; readonly reason: "startup" | "no-feasible-good" } |
  { readonly method: "tpe"; readonly modelId: string; readonly groups: readonly GroupTrace[] }
);
