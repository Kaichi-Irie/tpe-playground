import { memo, useMemo } from "react";
import { ComparisonPanel } from "./ProgressComparison";
import { emptyPlayback2D, findObjectiveMinimum2D, movePlayback2D, settings2D, type ObjectivePreset2D, type Trial2D } from "./tpe2d";

export const ProgressComparison2D = memo(function ProgressComparison2D({ trials, seed, objectivePreset }: {
  trials: readonly Trial2D[];
  seed: number;
  objectivePreset: ObjectivePreset2D;
}) {
  const minimum = useMemo(() => findObjectiveMinimum2D(objectivePreset), [objectivePreset]);
  const randomTrials = useMemo(() => movePlayback2D(emptyPlayback2D(), settings2D.count, seed, "multivariate", { startupTrials: settings2D.count, objectivePreset }).trials, [seed, objectivePreset]);
  const asMetricTrials = (values: readonly Trial2D[]) => values.map((trial) => ({ id: trial.id, x: trial.x1, y: trial.value }));
  return <ComparisonPanel trials={asMetricTrials(trials)} randomTrials={asMetricTrials(randomTrials)} minimum={minimum} relative={false} approximate={objectivePreset === "multimodal"} />;
});
