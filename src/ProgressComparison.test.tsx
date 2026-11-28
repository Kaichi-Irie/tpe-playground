import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { defaults, runSearch, trialLimit } from "./oneParamTpe";
import { ComparisonPanel, ProgressComparison } from "./ProgressComparison";

it.each([0, 5])("labels default Play 2D performance as TPE at trial %i", (step) => {
  const seed = 42;
  const objectivePreset = "multimodal";
  const run = runSearch(seed, step, 0, { ...defaults, objectivePreset });
  const html = renderToStaticMarkup(<ProgressComparison {...run} randomOnly={false} seed={seed} objectivePreset={objectivePreset} />);
  expect(html).toContain('class="comparison-tpe"><i aria-hidden="true"></i>TPE');
  expect(html).toContain("Best so far: TPE versus Random search");
});

it("labels Play 2D performance as random only when configured for random search with no TPE proposals", () => {
  const seed = 42;
  const objectivePreset = "multimodal";
  const run = runSearch(seed, 12, 0, { ...defaults, startupTrials: trialLimit, objectivePreset });
  const html = renderToStaticMarkup(<ProgressComparison {...run} randomOnly seed={seed} objectivePreset={objectivePreset} />);
  expect(html).toContain('class="comparison-tpe"><i aria-hidden="true"></i>Random only');
  expect(html).toContain("Best so far: Random only versus Random search");
  expect(html).toContain("Random only is solid blue.");
});

it("keeps the Play 2D TPE label when the current setting changes to random only after a TPE proposal", () => {
  const seed = 42;
  const objectivePreset = "multimodal";
  const run = runSearch(seed, 12, 0, { ...defaults, objectivePreset });
  const html = renderToStaticMarkup(<ProgressComparison {...run} randomOnly seed={seed} objectivePreset={objectivePreset} />);
  expect(html).toContain('class="comparison-tpe"><i aria-hidden="true"></i>TPE');
});

it.each([
  ["Current run", "cmaes", "cmaes", "green"],
  ["CMA-ES", undefined, "tpe", "blue"],
] as const)("colors the %s series from the sampler ID", (currentLabel, currentSampler, sampler, color) => {
  const html = renderToStaticMarkup(<ComparisonPanel trials={[]} randomTrials={[]} minimum={1} currentLabel={currentLabel} currentSampler={currentSampler} />);
  expect(html).toContain(`data-sampler="${sampler}" style="--comparison-current:var(--sampler-${sampler})"`);
  expect(html).toContain(`${currentLabel} is solid ${color}.`);
});

it.each(["GP", "Random only"])("renders the Play 2D %s performance series in purple", (currentLabel) => {
  const html = renderToStaticMarkup(<ProgressComparison trials={[{ id: 1, x: 0, y: 3 }]}
    currentSampler="gp" currentLabel={currentLabel} randomOnly={currentLabel === "Random only"} seed={42} objectivePreset="multimodal" />);
  expect(html).toContain('data-sampler="gp" style="--comparison-current:var(--sampler-gp)"');
  expect(html).toContain(`${currentLabel} is solid purple.`);
});
