import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { defaults, runSearch, trialLimit } from "./oneParamTpe";
import { ProgressComparison } from "./ProgressComparison";

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
