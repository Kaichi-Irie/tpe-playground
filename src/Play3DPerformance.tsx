import { memo, useMemo } from "react";
import type { TwoParamConstraintPreset } from "./twoParamConstraints";
import { currentRunLabel } from "./comparison";
import { ComparisonPanel } from "./ProgressComparison";
import { PanelClose } from "./PanelClose";
import { getSampler, type SamplerId } from "./samplers";
import type { TwoParamCmaEsProposal, TwoParamCmaEsSettings } from "./twoParamCmaEs";
import { twoParamDefaultModelSettings, emptyTwoParamPlayback, findTwoParamObjectiveMinimum, moveTwoParamPlayback, twoParamSettings, type DensityMode, type TwoParamModelSettings, type TwoParamObjectivePreset, type TwoParamPlayback, type TwoParamTrial } from "./twoParamTpe";

const asMetricTrials = (values: readonly TwoParamTrial[]) => values.map((trial) => ({ id: trial.id, x: trial.x1, y: trial.value, feasible: trial.violation === 0 }));

export const Play3DPerformance = memo(function Play3DPerformance({ trials, proposals, seed, objectivePreset, constraintPreset = "none", mode = "multivariate", settings = twoParamDefaultModelSettings, sampler = "tpe" }: {
  trials: readonly TwoParamTrial[];
  proposals: readonly (TwoParamPlayback["proposals"][number] | TwoParamCmaEsProposal)[];
  seed: number;
  objectivePreset: TwoParamObjectivePreset;
  constraintPreset?: TwoParamConstraintPreset;
  mode?: DensityMode;
  settings?: TwoParamModelSettings;
  sampler?: SamplerId;
  cmaEsSettings?: TwoParamCmaEsSettings;
}) {
  const samplerDef = getSampler(sampler);
  const unsupported = !samplerDef.supportsConstraints && constraintPreset !== "none";
  const minimum = useMemo(() => unsupported ? 0 : findTwoParamObjectiveMinimum(objectivePreset, constraintPreset), [unsupported, objectivePreset, constraintPreset]);
  const randomTrials = useMemo(() => unsupported ? [] : asMetricTrials(moveTwoParamPlayback(emptyTwoParamPlayback(), twoParamSettings.count, seed, "multivariate", {
    startupTrials: twoParamSettings.count, objectivePreset, constraintPreset,
  }).trials), [unsupported, seed, objectivePreset, constraintPreset]);
  const { bandwidth, bandwidthRule = "constant", gamma, weights, priorWeight, startupTrials, candidates, infeasibleFilling: filling = true } = settings;
  const flippedTrials = useMemo(() => constraintPreset === "none" || unsupported ? null : asMetricTrials(moveTwoParamPlayback(emptyTwoParamPlayback(), twoParamSettings.count, seed, mode, {
    bandwidth, bandwidthRule, gamma, weights, priorWeight, startupTrials, candidates, objectivePreset, constraintPreset, infeasibleFilling: !filling,
  }).trials), [unsupported, seed, mode, bandwidth, bandwidthRule, gamma, weights, priorWeight, startupTrials, candidates, objectivePreset, constraintPreset, filling]);
  if (unsupported) return <section className="workspace comparison" aria-label="Search performance">
    <div className="section-heading"><h2>Performance</h2><PanelClose label="performance panel" /></div>
    <p>{samplerDef.label} does not support constraints. Remove the constraint to compare {samplerDef.label} with Random.</p>
  </section>;
  const currentTrials = asMetricTrials(trials);
  const constrained = flippedTrials ? {
    flippedLabel: filling ? "Filling off" : "Filling on",
    flippedTrials,
    feasibleCount: `${currentTrials.filter((trial) => trial.feasible).length} / ${trials.length} feasible`,
  } : undefined;
  const currentLabel = sampler === "cmaes" ? samplerDef.label
    : currentRunLabel(proposals.filter((proposal) => proposal.method !== "cmaes"), startupTrials >= twoParamSettings.count, constrained ? filling : undefined);
  return <ComparisonPanel trials={currentTrials} currentLabel={currentLabel} currentSampler={sampler} randomTrials={randomTrials} minimum={minimum} relative={false}
    approximate={constraintPreset === "none" && objectivePreset === "multimodal"} constrained={constrained} />;
});
