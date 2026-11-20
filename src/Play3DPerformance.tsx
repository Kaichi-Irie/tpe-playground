import { memo, useMemo } from "react";
import type { TwoParamConstraintPreset } from "./twoParamConstraints";
import { currentRunLabel } from "./comparison";
import { ComparisonPanel } from "./ProgressComparison";
import { twoParamDefaultModelSettings, emptyTwoParamPlayback, findTwoParamObjectiveMinimum, moveTwoParamPlayback, twoParamSettings, type DensityMode, type TwoParamModelSettings, type TwoParamObjectivePreset, type TwoParamPlayback, type TwoParamTrial } from "./twoParamTpe";

const asMetricTrials = (values: readonly TwoParamTrial[]) => values.map((trial) => ({ id: trial.id, x: trial.x1, y: trial.value, feasible: trial.violation === 0 }));

export const Play3DPerformance = memo(function Play3DPerformance({ trials, proposals, seed, objectivePreset, constraintPreset = "none", mode = "multivariate", settings = twoParamDefaultModelSettings }: {
  trials: readonly TwoParamTrial[];
  proposals: Readonly<TwoParamPlayback["proposals"]>;
  seed: number;
  objectivePreset: TwoParamObjectivePreset;
  constraintPreset?: TwoParamConstraintPreset;
  mode?: DensityMode;
  settings?: TwoParamModelSettings;
}) {
  const minimum = useMemo(() => findTwoParamObjectiveMinimum(objectivePreset, constraintPreset), [objectivePreset, constraintPreset]);
  const randomTrials = useMemo(() => asMetricTrials(moveTwoParamPlayback(emptyTwoParamPlayback(), twoParamSettings.count, seed, "multivariate", {
    startupTrials: twoParamSettings.count, objectivePreset, constraintPreset,
  }).trials), [seed, objectivePreset, constraintPreset]);
  const { bandwidth, bandwidthRule = "constant", gamma, weights, priorWeight, startupTrials, candidates, infeasibleFilling: filling = true } = settings;
  const flippedTrials = useMemo(() => constraintPreset === "none" ? null : asMetricTrials(moveTwoParamPlayback(emptyTwoParamPlayback(), twoParamSettings.count, seed, mode, {
    bandwidth, bandwidthRule, gamma, weights, priorWeight, startupTrials, candidates, objectivePreset, constraintPreset, infeasibleFilling: !filling,
  }).trials), [seed, mode, bandwidth, bandwidthRule, gamma, weights, priorWeight, startupTrials, candidates, objectivePreset, constraintPreset, filling]);
  const currentTrials = asMetricTrials(trials);
  const constrained = flippedTrials ? {
    flippedLabel: filling ? "Filling off" : "Filling on",
    flippedTrials,
    feasibleCount: `${currentTrials.filter((trial) => trial.feasible).length} / ${trials.length} feasible`,
  } : undefined;
  return <ComparisonPanel trials={currentTrials} currentLabel={currentRunLabel(proposals, constraintPreset !== "none")} randomTrials={randomTrials} minimum={minimum} relative={false}
    approximate={constraintPreset === "none" && objectivePreset === "multimodal"} constrained={constrained} />;
});
