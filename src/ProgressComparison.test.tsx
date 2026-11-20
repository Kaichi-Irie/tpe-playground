import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { defaults, runSearch, trialLimit } from "./oneParamTpe";
import { ProgressComparison } from "./ProgressComparison";

it("labels Play 2D performance as random only when all proposals are random", () => {
  const seed = 42;
  const objectivePreset = "multimodal";
  const run = runSearch(seed, 12, 0, { ...defaults, startupTrials: trialLimit, objectivePreset });
  const html = renderToStaticMarkup(<ProgressComparison {...run} seed={seed} objectivePreset={objectivePreset} />);
  expect(html).toContain('class="comparison-tpe"><i aria-hidden="true"></i>Random only');
  expect(html).toContain("Best so far: Random only versus Random search");
  expect(html).toContain("Random only is solid blue.");
});
