import type { BandwidthRule } from "./bandwidth";

export type Point = Readonly<Record<string, number>>;
export type DensityMode = "univariate" | "multivariate";
export type WeightStrategy = "uniform" | "recency" | "ei";
export interface Parameter { readonly id: string; readonly low: number; readonly high: number }
export interface Problem {
  readonly id: string;
  readonly parameters: readonly Parameter[];
  readonly directions: readonly ("minimize" | "maximize")[];
  readonly constraintCount: number;
}
export interface Observation {
  readonly id: number;
  readonly params: Point;
  readonly objectives: readonly number[];
  readonly constraints: readonly number[];
}
export interface TpeConfig {
  readonly mode: DensityMode;
  readonly bandwidth: number;
  readonly bandwidthRule?: BandwidthRule;
  readonly gamma: number;
  readonly weights: WeightStrategy;
  readonly priorWeight: number;
  readonly startupTrials: number;
  readonly candidates: number;
}
export interface WeightedTrial { readonly trialId: number; readonly weight: number }
export interface Partition {
  readonly kind: "single-objective";
  readonly threshold: number;
  readonly good: readonly WeightedTrial[];
  readonly bad: readonly WeightedTrial[];
}
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
  // Preserve the existing educational model: full-space density, bounded draws.
  readonly normalization: "full-space";
  readonly sampling: "condition-mixture-on-domain";
}
export interface GroupModel {
  readonly id: string;
  readonly parameterIds: readonly string[];
  readonly good: DensitySnapshot;
  readonly bad: DensitySnapshot;
}
export interface ModelSnapshot {
  readonly version: 1;
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
  readonly version: 1;
  readonly seed: number;
  readonly config: TpeConfig;
  readonly problem: Problem;
  readonly historyKey: string;
  readonly inputTrialIds: readonly number[];
  readonly selected: Point;
}
export type ProposalTrace = ProposalContext & (
  { readonly method: "random"; readonly reason: "startup" } |
  { readonly method: "tpe"; readonly modelId: string; readonly groups: readonly GroupTrace[] }
);
export type RandomSource = () => number;
