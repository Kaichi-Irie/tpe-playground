import { memo, useMemo } from "react";
import type { ConstraintPreset2D } from "./constraints2D";
import { ComparisonPanel } from "./ProgressComparison";
import { defaultModelSettings2D, emptyPlayback2D, findObjectiveMinimum2D, movePlayback2D, settings2D, type DensityMode, type ModelSettings2D, type ObjectivePreset2D, type Trial2D } from "./tpe2d";

const asMetricTrials = (values: readonly Trial2D[]) => values.map((trial) => ({ id: trial.id, x: trial.x1, y: trial.value, feasible: trial.violation === 0 }));

export const ProgressComparison2D = memo(function ProgressComparison2D({ trials, seed, objectivePreset, constraintPreset = "none", mode = "multivariate", settings = defaultModelSettings2D }: {
  trials: readonly Trial2D[];
  seed: number;
  objectivePreset: ObjectivePreset2D;
  constraintPreset?: ConstraintPreset2D;
  mode?: DensityMode;
  settings?: ModelSettings2D;
}) {
  const minimum = useMemo(() => findObjectiveMinimum2D(objectivePreset, constraintPreset), [objectivePreset, constraintPreset]);
  const randomTrials = useMemo(() => asMetricTrials(movePlayback2D(emptyPlayback2D(), settings2D.count, seed, "multivariate", {
    startupTrials: settings2D.count, objectivePreset, constraintPreset,
  }).trials), [seed, objectivePreset, constraintPreset]);
  const { bandwidth, bandwidthRule = "constant", gamma, weights, priorWeight, startupTrials, candidates, infeasibleFilling: filling = true } = settings;
  const flippedTrials = useMemo(() => constraintPreset === "none" ? null : asMetricTrials(movePlayback2D(emptyPlayback2D(), settings2D.count, seed, mode, {
    bandwidth, bandwidthRule, gamma, weights, priorWeight, startupTrials, candidates, objectivePreset, constraintPreset, infeasibleFilling: !filling,
  }).trials), [seed, mode, bandwidth, bandwidthRule, gamma, weights, priorWeight, startupTrials, candidates, objectivePreset, constraintPreset, filling]);
  const currentTrials = asMetricTrials(trials);
  const constrained = flippedTrials ? {
    currentLabel: filling ? "Filling on" : "Filling off",
    flippedLabel: filling ? "Filling off" : "Filling on",
    flippedTrials,
    feasibleCount: `${currentTrials.filter((trial) => trial.feasible).length} / ${trials.length} feasible`,
  } : undefined;
  return <ComparisonPanel trials={currentTrials} randomTrials={randomTrials} minimum={minimum} relative={false}
    approximate={constraintPreset === "none" && objectivePreset === "multimodal"} constrained={constrained} />;
});
