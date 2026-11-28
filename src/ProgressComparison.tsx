import { memo, useMemo, useState } from "react";
import { averageRegret, relativeBestSoFar, bestSoFar, bestFeasibleSoFar, currentRunLabel } from "./comparison";
import { findObjectiveMinimum, type ObjectivePreset } from "./objectives";
import { PanelClose } from "./PanelClose";
import { Help } from "./Help";
import { HelpMath } from "./HelpMath";
import { ProgressPlot } from "./ProgressPlot";
import type { SamplerId } from "./samplers";
import { trialLimit, defaults, runSearch, type Proposal, type Trial } from "./oneParamTpe";

export const ProgressComparison = memo(function ProgressComparison({ trials, proposals, randomOnly, seed, objectivePreset, currentSampler = "tpe", currentLabel }: { trials: readonly Trial[]; proposals?: readonly Proposal[]; randomOnly: boolean; seed: number; objectivePreset: ObjectivePreset; currentSampler?: SamplerId; currentLabel?: string }) {
  const minimum = useMemo(() => findObjectiveMinimum(objectivePreset), [objectivePreset]);
  const randomTrials = useMemo(() => runSearch(seed, trialLimit, 0, { ...defaults, startupTrials: trialLimit, objectivePreset }).trials, [seed, objectivePreset]);
  return <ComparisonPanel trials={trials} currentSampler={currentSampler} currentLabel={currentLabel ?? currentRunLabel(proposals ?? [], randomOnly)} randomTrials={randomTrials} minimum={minimum.y} />;
});

type MetricTrial = Trial & { feasible?: boolean };

export function ComparisonPanel({ trials, currentLabel, currentSampler = "tpe", randomTrials, minimum, relative = true, approximate = false, constrained }: {
  trials: readonly MetricTrial[];
  currentLabel: string;
  currentSampler?: SamplerId;
  randomTrials: readonly MetricTrial[];
  constrained?: { flippedLabel: string; flippedTrials: readonly MetricTrial[]; feasibleCount: string };
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
  const gap = String.raw`\bigl[f(x_i)-f(x^*)\bigr]`;
  const definitionTex = constrained ? String.raw`\min_{i\le t,\ x_i\ \mathrm{feasible}}${gap}` : metric === "best"
    ? relative ? String.raw`\min_{i\le t}\frac{f(x_i)-f(x^*)}{f(x^*)}` : String.raw`\min_{i\le t}${gap}`
    : String.raw`\frac1t\sum_{i=1}^{t}${gap}`;
  return <section className="workspace comparison" aria-label="Search performance">
    <div className="section-heading"><h2>Performance</h2>{constrained && <span>{constrained.feasibleCount}</span>}<PanelClose label="performance panel" /></div>
    <div className="comparison-toolbar">
      <div className="comparison-controls" role="group" aria-label="Comparison metric">
        <button type="button" aria-pressed={metric === "best"} onClick={() => setMetric("best")}>Best so far</button>
        {!constrained && <button type="button" aria-pressed={metric === "regret"} onClick={() => setMetric("regret")}>Average regret</button>}
      </div>
      <Help key={metric} label={title}>
        <strong>{title}</strong><br />
        {constrained ? "The smallest gap to the constrained optimum among feasible trials so far:" : metric === "best" ? relative ? "The smallest gap to the optimum found so far, relative to the optimum:" : "The smallest gap to the optimum found so far:" : "The average gap to the optimum across all evaluations so far:"}
        <HelpMath tex={definitionTex} />
        {constrained && <>∞ means no feasible trial has been found in that run.<br /></>}
        {approximate && <>The optimum reference is numerically estimated.<br /></>}
        The logarithmic scale adjusts to the displayed history. Values below its lower bound are drawn at the bottom.
      </Help>
    </div>
    <ProgressPlot title={title} definition={definition}
      tpe={metric === "best" ? bestGap(trials) : averageRegret(trials, minimum)}
      random={metric === "best" ? bestGap(random) : averageRegret(random, minimum)}
      third={constrained && { label: constrained.flippedLabel, values: feasibleGap(constrained.flippedTrials.slice(0, trials.length)) }}
      currentLabel={currentLabel} currentSampler={currentSampler} />
  </section>;
}
