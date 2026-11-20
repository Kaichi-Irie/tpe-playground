import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Play3DPerformance } from "./Play3DPerformance";
import { ProgressPlot } from "./ProgressPlot";
import { twoParamDefaultModelSettings, emptyTwoParamPlayback, findTwoParamObjectiveMinimum, moveTwoParamPlayback, twoParamObjectivePresets, twoParamSettings } from "./twoParamTpe";

it("uses a reproducible random baseline sharing startup observations for every Play 3D objective", () => {
  for (const objectivePreset of Object.keys(twoParamObjectivePresets) as (keyof typeof twoParamObjectivePresets)[]) {
    const random = moveTwoParamPlayback(emptyTwoParamPlayback(), 200, 42, "multivariate", { startupTrials: twoParamSettings.count, objectivePreset });
    const search = moveTwoParamPlayback(emptyTwoParamPlayback(), 12, 42, "multivariate", { objectivePreset });
    expect(search.trials.slice(0, 10)).toEqual(random.trials.slice(0, 10));
    const minimum = findTwoParamObjectiveMinimum(objectivePreset);
    expect(Number.isFinite(minimum)).toBe(true);
    expect(search.trials.every((trial) => trial.value >= minimum - 1e-10)).toBe(true);
    const html = renderToStaticMarkup(<Play3DPerformance trials={search.trials} seed={42} objectivePreset={objectivePreset} />);
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
  const settings = { ...twoParamDefaultModelSettings, priorWeight: 0 };
  const run = (count: number) => moveTwoParamPlayback(emptyTwoParamPlayback(), count, 42, "multivariate", { ...settings, constraintPreset }).trials;
  const html = renderToStaticMarkup(<Play3DPerformance trials={run(17)} seed={42} objectivePreset="multimodal" constraintPreset={constraintPreset} settings={settings} />);
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

  const firstTrialHtml = renderToStaticMarkup(<Play3DPerformance trials={run(1)} seed={42} objectivePreset="multimodal" constraintPreset={constraintPreset} settings={settings} />);
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
