import { memo, useMemo, useState } from "react";
import { averageRegret, relativeBestSoFar, bestSoFar, bestFeasibleSoFar } from "./comparison";
import { findObjectiveMinimum, type ObjectivePreset } from "./objectives";
import { PanelClose } from "./PanelClose";
import { Help } from "./Help";
import { ProgressPlot } from "./ProgressPlot";
import { trialLimit, defaults, runSearch, type Trial } from "./tpe";

export const ProgressComparison = memo(function ProgressComparison({ trials, seed, objectivePreset }: { trials: readonly Trial[]; seed: number; objectivePreset: ObjectivePreset }) {
  const minimum = useMemo(() => findObjectiveMinimum(objectivePreset), [objectivePreset]);
  const randomTrials = useMemo(() => runSearch(seed, trialLimit, 0, { ...defaults, startupTrials: trialLimit, objectivePreset }).trials, [seed, objectivePreset]);
  return <ComparisonPanel trials={trials} randomTrials={randomTrials} minimum={minimum.y} />;
});

type MetricTrial = Trial & { feasible?: boolean };

export function ComparisonPanel({ trials, randomTrials, minimum, relative = true, approximate = false, constrained }: {
  trials: readonly MetricTrial[];
  randomTrials: readonly MetricTrial[];
  constrained?: { currentLabel: string; flippedLabel: string; flippedTrials: readonly MetricTrial[]; feasibleCount: string };
  minimum: number;
  relative?: boolean;
  approximate?: boolean;
}) {
  const [selectedMetric, setMetric] = useState<"best" | "regret">("best");
  const metric = constrained ? "best" : selectedMetric;
  const random = randomTrials.slice(0, trials.length);
  const feasibleGap = (samples: readonly MetricTrial[]) => bestFeasibleSoFar(samples).map((value) => value === null ? null : Math.max(0, value - minimum));
  const bestGap = (samples: readonly MetricTrial[]) => constrained ? feasibleGap(samples) : relative
    ? relativeBestSoFar(samples, minimum)
    : bestSoFar(samples).map((value) => Math.max(0, value - minimum));
  const title = metric === "best" ? "Best so far" : "Average regret";
  const definition = constrained ? "Minimum f(xᵢ) − f(x*) over feasible trials through trial t." : metric === "best"
    ? relative ? "minᵢ≤ₜ [f(xᵢ) − f(x*)] / f(x*)" : "minᵢ≤ₜ [f(xᵢ) − f(x*)]"
    : "(1/t) Σᵢ₌₁ᵗ [f(xᵢ) − f(x*)]";
  return <section className="workspace comparison" aria-label="Search performance">
    <div className="section-heading"><h2>Performance</h2>{constrained && <span>{constrained.feasibleCount}</span>}<PanelClose label="performance panel" /></div>
    <div className="comparison-toolbar">
      <div className="comparison-controls" role="group" aria-label="Comparison metric">
        <button type="button" aria-pressed={metric === "best"} onClick={() => setMetric("best")}>Best so far</button>
        {!constrained && <button type="button" aria-pressed={metric === "regret"} onClick={() => setMetric("regret")}>Average regret</button>}
      </div>
      <Help key={metric} label={title}>
        <strong>{title}</strong><br />
        {constrained ? "∞ means no feasible trial has been found in that run. The reference is the constrained optimum." : metric === "best" ? relative ? "The smallest gap to the optimum found so far, relative to the optimum." : "The smallest gap to the optimum found so far." : "The average gap to the optimum across all evaluations so far."}<br />
        {definition}<br />
        {approximate && <>The optimum reference is numerically estimated.<br /></>}
        The logarithmic scale adjusts to the displayed history. Values below its lower bound are drawn at the bottom.
      </Help>
    </div>
    <ProgressPlot title={title} definition={definition}
      tpe={metric === "best" ? bestGap(trials) : averageRegret(trials, minimum)}
      random={metric === "best" ? bestGap(random) : averageRegret(random, minimum)}
      third={constrained && { label: constrained.flippedLabel, values: feasibleGap(constrained.flippedTrials.slice(0, trials.length)) }}
      currentLabel={constrained?.currentLabel} />
  </section>;
}
