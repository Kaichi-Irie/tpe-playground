import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Play3DPerformance } from "./Play3DPerformance";
import { ProgressPlot } from "./ProgressPlot";
import { emptyTwoParamCmaEsPlayback, moveTwoParamCmaEsPlayback, twoParamCmaEsDefaults } from "./twoParamCmaEs";
import { twoParamDefaultModelSettings, emptyTwoParamPlayback, findTwoParamObjectiveMinimum, moveTwoParamPlayback, twoParamObjectivePresets, twoParamSettings } from "./twoParamTpe";

it.each([0, 5])("labels default Play 3D performance as TPE at trial %i", (step) => {
  const seed = 42;
  const run = moveTwoParamPlayback(emptyTwoParamPlayback(), step, seed);
  const html = renderToStaticMarkup(<Play3DPerformance {...run} seed={seed} objectivePreset="multimodal" />);
  expect(html).toContain('class="comparison-tpe"><i aria-hidden="true"></i>TPE');
  expect(html).toContain("Best so far: TPE versus Random search");
});

it("compares CMA-ES with Random and explains the constraint limitation", () => {
  const run = moveTwoParamCmaEsPlayback(emptyTwoParamCmaEsPlayback(), 12, 42, twoParamCmaEsDefaults, "rosenbrock");
  const render = (constraintPreset: "none" | "disk") => renderToStaticMarkup(
    <Play3DPerformance {...run} seed={42} objectivePreset="rosenbrock" sampler="cmaes" cmaEsSettings={twoParamCmaEsDefaults} constraintPreset={constraintPreset} />,
  );
  const unconstrained = render("none");
  expect(unconstrained).toContain("Best so far: CMA-ES versus Random search");
  expect(unconstrained).toContain("CMA-ES is solid green.");
  expect(unconstrained).toContain('data-sampler="cmaes" style="--comparison-current:var(--sampler-cmaes)"');
  const constrained = render("disk");
  expect(constrained).toContain("CMA-ES does not support constraints. Remove the constraint to compare CMA-ES with Random.");
  expect(constrained).not.toContain('class="progress-panel"');
});

it("uses a reproducible random baseline sharing startup observations for every Play 3D objective", () => {
  for (const objectivePreset of Object.keys(twoParamObjectivePresets) as (keyof typeof twoParamObjectivePresets)[]) {
    const random = moveTwoParamPlayback(emptyTwoParamPlayback(), 200, 42, "multivariate", { startupTrials: twoParamSettings.count, objectivePreset });
    const search = moveTwoParamPlayback(emptyTwoParamPlayback(), 12, 42, "multivariate", { objectivePreset });
    expect(search.trials.slice(0, 10)).toEqual(random.trials.slice(0, 10));
    const minimum = findTwoParamObjectiveMinimum(objectivePreset);
    expect(Number.isFinite(minimum)).toBe(true);
    expect(search.trials.every((trial) => trial.value >= minimum - 1e-10)).toBe(true);
    const html = renderToStaticMarkup(<Play3DPerformance {...search} seed={42} objectivePreset={objectivePreset} />);
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
  const run = (count: number) => moveTwoParamPlayback(emptyTwoParamPlayback(), count, 42, "multivariate", { ...settings, constraintPreset });
  const render = (count: number) => renderToStaticMarkup(<Play3DPerformance {...run(count)} seed={42} objectivePreset="multimodal" constraintPreset={constraintPreset} settings={settings} />);
  const html = render(10);
  expect(html).toContain('<i aria-hidden="true"></i>Filling on');
  expect(html).toContain('<i aria-hidden="true"></i>Filling off');
  expect(html).toContain('<i aria-hidden="true"></i>Random');
  expect(html).toContain("0 / 10 feasible");
  expect(html).not.toContain("Average regret");
  expect(html).toContain(">∞</text>");
  const infinityY = html.match(/<line class="grid"[^>]* y1="([^"]+)"/)?.[1];
  expect(infinityY).toBeDefined();
  for (const name of ["tpe", "third", "random"]) {
    expect(html).toContain(`${name}-progress-line`);
  }
  expect(html).toContain(`cy="${infinityY}" r="4" class="third-progress-point"`);
  expect(html).toContain(`cy="${infinityY}" r="5" class="random-progress-point"`);
  expect(html).toContain(`cy="${infinityY}" r="3" class="tpe-progress-point"`);
  const atFirstFeasible = render(11);
  expect(atFirstFeasible).toContain("1 / 11 feasible");
  expect(atFirstFeasible).not.toContain(`cy="${infinityY}" r="3" class="tpe-progress-point"`);

  const beforeComparisonsFeasible = render(63);
  const atComparisonsFeasible = render(64);
  for (const marker of [
    `cy="${infinityY}" r="4" class="third-progress-point"`,
    `cy="${infinityY}" r="5" class="random-progress-point"`,
  ]) {
    expect(beforeComparisonsFeasible).toContain(marker);
    expect(atComparisonsFeasible).not.toContain(marker);
  }

  const firstTrialHtml = render(1);
  expect(firstTrialHtml).toContain(">∞</text>");
  expect(firstTrialHtml).not.toMatch(/>[^<]*1e[+-]\d+<\/text>/);
  expect(firstTrialHtml).toContain("tpe-progress-point");
});

it("labels the current constrained run from its TPE proposals and the comparison from the current setting", () => {
  const seed = 42;
  const constraintPreset = "disk";
  const on = { ...twoParamDefaultModelSettings, constraintPreset, startupTrials: 2, infeasibleFilling: true } as const;
  const off = { ...on, infeasibleFilling: false };
  const start = moveTwoParamPlayback(emptyTwoParamPlayback(), 2, seed, "multivariate", on);
  const uniformOn = moveTwoParamPlayback(start, 4, seed, "multivariate", on);
  const uniformOff = moveTwoParamPlayback(start, 4, seed, "multivariate", off);
  const mixed = moveTwoParamPlayback(uniformOn, 5, seed, "multivariate", off);
  const render = (run: typeof mixed, settings = off) => renderToStaticMarkup(
    <Play3DPerformance {...run} seed={seed} objectivePreset="multimodal" constraintPreset={constraintPreset} settings={settings} />,
  );

  expect(render(emptyTwoParamPlayback(), on)).toContain('class="comparison-tpe"><i aria-hidden="true"></i>Filling on');
  expect(render(start)).toContain('class="comparison-tpe"><i aria-hidden="true"></i>Filling off');
  expect(render(uniformOn)).toContain('class="comparison-tpe"><i aria-hidden="true"></i>Filling on');
  expect(render(uniformOff)).toContain('class="comparison-tpe"><i aria-hidden="true"></i>Filling off');
  const html = render(mixed);
  expect(html).toContain('class="comparison-tpe"><i aria-hidden="true"></i>This run (mixed settings)');
  expect(html).toContain('class="comparison-third"><i aria-hidden="true"></i>Filling on');
  expect(html).toContain("Best so far: This run (mixed settings), Filling on, Random");
});

it.each(["none", "disk"] as const)("labels all-random Play 3D history with constraint %s", (constraintPreset) => {
  const seed = 42;
  const settings = { ...twoParamDefaultModelSettings, startupTrials: twoParamSettings.count };
  const run = moveTwoParamPlayback(emptyTwoParamPlayback(), 12, seed, "multivariate", { ...settings, constraintPreset });
  const html = renderToStaticMarkup(
    <Play3DPerformance {...run} seed={seed} objectivePreset="multimodal" constraintPreset={constraintPreset} settings={settings} />,
  );
  expect(html).toContain('class="comparison-tpe"><i aria-hidden="true"></i>Random only');
  expect(html).toContain("Best so far: Random only");
  expect(html).toContain("Random only is solid blue.");
});

it("fits the log axis to the displayed series and expands it when smaller values appear", () => {
  const plot = (tpe: number[], random: number[]) => renderToStaticMarkup(
    <ProgressPlot title="Best so far" definition="" tpe={tpe} random={random} currentLabel="TPE" />,
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
