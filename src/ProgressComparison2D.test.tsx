import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ProgressComparison2D } from "./ProgressComparison2D";
import { ProgressPlot } from "./ProgressPlot";
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

it("shows each constrained run at infinity until its first feasible trial", () => {
  const constraintPreset = "disk";
  const settings = { ...defaultModelSettings2D, priorWeight: 0 };
  const run = (count: number) => movePlayback2D(emptyPlayback2D(), count, 42, "multivariate", { ...settings, constraintPreset }).trials;
  const html = renderToStaticMarkup(<ProgressComparison2D trials={run(17)} seed={42} objectivePreset="multimodal" constraintPreset={constraintPreset} settings={settings} />);
  expect(html).toContain('<i aria-hidden="true"></i>Filling on');
  expect(html).toContain('<i aria-hidden="true"></i>Filling off');
  expect(html).toContain('<i aria-hidden="true"></i>Random');
  expect(html).toContain('/ 17 feasible');
  expect(html).not.toContain("Average regret");
  expect(html).toContain(">∞</text>");
  const infinityY = html.match(/<line class="grid"[^>]* y1="([^"]+)"/)?.[1];
  expect(infinityY).toBeDefined();
  for (const name of ["tpe", "third", "random"]) {
    expect(html).toContain(`${name}-progress-line`);
  }
  expect(html).toContain(`cy="${infinityY}" r="4" class="third-progress-point"`);
  expect(html).toContain(`cy="${infinityY}" r="5" class="random-progress-point"`);
  expect(html).not.toContain(`cy="${infinityY}" r="3" class="tpe-progress-point"`);

  const firstTrialHtml = renderToStaticMarkup(<ProgressComparison2D trials={run(1)} seed={42} objectivePreset="multimodal" constraintPreset={constraintPreset} settings={settings} />);
  expect(firstTrialHtml).toContain(">∞</text>");
  expect(firstTrialHtml).not.toMatch(/>[^<]*1e[+-]\d+<\/text>/);
  expect(firstTrialHtml).toContain("tpe-progress-point");
});

it("fits the log axis to the displayed series and expands it when smaller values appear", () => {
  const plot = (tpe: number[], random: number[]) => renderToStaticMarkup(
    <ProgressPlot title="Best so far" definition="" tpe={tpe} random={random} />,
  );
  const early = plot([0.4, 0.2], [3, 2]);
  expect(early).toContain(">1e-1</text>");
  expect(early).toContain(">1e+1</text>");
  expect(early).not.toContain("1e-12");
  const later = plot([0.4, 0.2, 0.0003], [3, 2, 1]);
  expect(later).toContain(">1e-4</text>");
  const zero = plot([0.4, 0], [3, 2]);
  expect(zero).toContain(">≤ 1e-2</text>");
  expect(zero).not.toMatch(/NaN|Infinity/);
});
