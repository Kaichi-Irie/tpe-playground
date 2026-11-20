import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ProgressComparison2D } from "./ProgressComparison2D";
import { defaultModelSettings2D, emptyPlayback2D, findObjectiveMinimum2D, movePlayback2D, objectivePresets2D, settings2D } from "./tpe2d";

it("uses a reproducible random baseline sharing startup observations for every 2D objective", () => {
  for (const objectivePreset of Object.keys(objectivePresets2D) as (keyof typeof objectivePresets2D)[]) {
    const random = movePlayback2D(emptyPlayback2D(), 200, 42, "multivariate", { startupTrials: settings2D.count, objectivePreset });
    const search = movePlayback2D(emptyPlayback2D(), 12, 42, "multivariate", { objectivePreset });
    expect(search.trials.slice(0, 10)).toEqual(random.trials.slice(0, 10));
    const minimum = findObjectiveMinimum2D(objectivePreset);
    expect(Number.isFinite(minimum)).toBe(true);
    expect(search.trials.every((trial) => trial.value >= minimum - 1e-10)).toBe(true);
    const html = renderToStaticMarkup(<ProgressComparison2D trials={search.trials} seed={42} objectivePreset={objectivePreset} />);
    expect(html).toContain("Performance");
    expect(html).toContain("Best so far");
    expect(html).toContain("Average regret");
    expect(html).toContain("Random search");
    expect(html).toContain("Shown through trial 12");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  }
});

it("compares three constrained runs and omits lines before their first feasible trial", () => {
  const constraintPreset = "disk";
  const settings = { ...defaultModelSettings2D, priorWeight: 0 };
  const run = (count: number) => movePlayback2D(emptyPlayback2D(), count, 42, "multivariate", { ...settings, constraintPreset }).trials;
  const html = renderToStaticMarkup(<ProgressComparison2D trials={run(17)} seed={42} objectivePreset="multimodal" constraintPreset={constraintPreset} settings={settings} />);
  expect(html).toContain('<i aria-hidden="true"></i>Filling on');
  expect(html).toContain('<i aria-hidden="true"></i>Filling off');
  expect(html).toContain('<i aria-hidden="true"></i>Random');
  expect(html).toContain('/ 17 feasible');
  expect(html).not.toContain("Average regret");
  expect(html).toContain("tpe-progress-line");
  expect(html).not.toContain("third-progress-line");
  expect(html).not.toContain("random-progress-line");
  const completeHtml = renderToStaticMarkup(<ProgressComparison2D trials={run(200)} seed={42} objectivePreset="multimodal" constraintPreset={constraintPreset} settings={settings} />);
  expect(completeHtml).toContain("third-progress-line");
  expect(completeHtml).toContain("random-progress-line");
});
