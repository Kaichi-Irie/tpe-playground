import { memo, useMemo, useState } from "react";
import { comparisonFloor, averageRegret, relativeBestSoFar, bestSoFar } from "./comparison";
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

export function ComparisonPanel({ trials, randomTrials, minimum, relative = true, approximate = false }: {
  trials: readonly Trial[];
  randomTrials: readonly Trial[];
  minimum: number;
  relative?: boolean;
  approximate?: boolean;
}) {
  const [metric, setMetric] = useState<"best" | "regret">("best");
  const random = randomTrials.slice(0, trials.length);
  const tpeBest = relative ? relativeBestSoFar(trials, minimum) : bestSoFar(trials).map((value) => Math.max(0, value - minimum));
  const randomBest = relative ? relativeBestSoFar(random, minimum) : bestSoFar(random).map((value) => Math.max(0, value - minimum));
  const tpeRegret = averageRegret(trials, minimum);
  const randomRegret = averageRegret(random, minimum);
  // Average regret can rise or fall. Bound it using only observed values.
  const positiveRegrets = [...tpeRegret, ...randomRegret].filter((value) => value > 0);
  const regretFloor = positiveRegrets.length
    ? Math.max(comparisonFloor, 10 ** Math.floor(Math.log10(Math.min(...positiveRegrets))))
    : comparisonFloor;
  const title = metric === "best" ? "Best so far" : "Average regret";
  const definition = metric === "best"
    ? relative ? "minᵢ≤ₜ [f(xᵢ) − f(x*)] / f(x*)" : "minᵢ≤ₜ [f(xᵢ) − f(x*)]"
    : "(1/t) Σᵢ₌₁ᵗ [f(xᵢ) − f(x*)]";
  const floor = metric === "best" ? comparisonFloor : regretFloor;
  return <section className="workspace comparison" aria-label="Search performance">
    <div className="section-heading"><h2>Performance</h2><PanelClose label="performance panel" /></div>
    <div className="comparison-toolbar">
      <div className="comparison-controls" role="group" aria-label="Comparison metric">
        <button type="button" aria-pressed={metric === "best"} onClick={() => setMetric("best")}>Best so far</button>
        <button type="button" aria-pressed={metric === "regret"} onClick={() => setMetric("regret")}>Average regret</button>
      </div>
      <Help key={metric} label={title}>
        <strong>{title}</strong><br />
        {metric === "best" ? relative ? "The smallest gap to the optimum found so far, relative to the optimum." : "The smallest gap to the optimum found so far. Absolute gaps support objectives whose minimum is zero." : "The average gap to the optimum across all evaluations so far."}<br />
        {definition}<br />
        {approximate && <>The optimum reference is numerically estimated.<br /></>}
        The vertical axis uses a logarithmic scale. Values ≤ {floor.toExponential(0)} are drawn at the bottom.
      </Help>
    </div>
    <ProgressPlot title={title} definition={definition}
      tpe={metric === "best" ? tpeBest : tpeRegret} random={metric === "best" ? randomBest : randomRegret}
      floor={floor} />
  </section>;
}
