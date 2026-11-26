import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import Play3D, { Play3DConstraintSettings, buildPlay3DCandidateScene } from "./Play3D";
import * as twoParam from "./twoParamTpe";

it("starts a sequential Play 3D search with no observations and a preview of its first proposal", () => {
  const html = renderToStaticMarkup(<Play3D />);
  expect(html).toContain("Trial 0 / 200");
  expect(html).toContain('aria-label="Play 3D Trial progress"');
  expect(html).toContain('<button type="button" class="playback-speed" aria-label="Play 3D Playback speed: 1x"');
  expect(html).toMatch(/<button class="play" aria-label="Play"[^>]*data-guide-target="true"[^>]*aria-describedby="play-guide-text-play-3d"/);
  expect(html).toContain('aria-label="Play 3D Search seed">42</output>');
  expect(html).toContain('aria-label="Play 3D Bandwidth rule"');
  expect(html).not.toMatch(/aria-label="2[D] /);
  expect(html).toMatch(/<select id="prior-weight-play-3d"[^>]*>.*<option value="1" selected="">1<\/option>/);
  expect(html).toContain("<span>Random start · 1 / 10</span>");
  expect(html).toMatch(/role="tooltip"[^>]*>Initial random exploration · 1 \/ 10\. Uniform random draw/);
  expect(html).toContain('class="model-status" aria-live="polite"');
  expect(html).not.toContain('class="canvas-status"');
  expect(html).toContain("Uniform random draw until TPE starts at trial 11.");
  expect(html).toContain("Next evaluation ·");
  expect(html).toContain('class="scaling-content"><h3>How to read this view</h3>');
  expect(html).toContain("KDEs appear after 2 observations.");
  expect(html).toContain("Next trial");
  expect(html).toContain("Previous trial");
  expect(html).toContain('<p id="play-guide-text-play-3d">Press Play, or step forward with →, to evaluate trials one at a time.</p>');
  expect(html).not.toContain('id="lab-guide-text"');
  expect(html).not.toContain("Resample");
  expect(html).toContain("Performance");
  expect(html).toContain("Objective height scale");
  expect(html).toContain("Log1p");
  expect(html).toContain("Estimated optimum ·");
  expect(html).toContain('class="scene-canvas-play-3d"');
  expect(html).toContain("About Play 3D density model");
  expect(html).toContain("keeping each (x₁, x₂) pair together.");
  expect(html).toContain("each coordinate has its own KDE and candidate draw.");
  for (const label of ["Good fraction", "Bandwidth", "Scott", "settings-dialog", "Prior weight", "Startup trials", "Candidates", "Weights", "Reset model defaults", "Quadratic", "Rosenbrock"]) expect(html).toContain(label);
  expect(html).not.toContain("coming soon");
  expect(html).toContain("Density model");
  expect(html).toContain("Univariate");
  expect(html).toContain('id="trial-seek-help-play-3d">Seeking back discards later trials.</span>');
  expect(html).toContain('aria-describedby="trial-seek-help-play-3d"');
  expect(html).not.toContain('class="observation-target-play-3d');
  expect(html).toContain('class="layer candidates" aria-pressed="true"');
  expect(html).not.toContain('class="candidates-play-3d"');
});

it("describes random-only playback without a TPE start trial", () => {
  const sharedSettings = new URLSearchParams({ startupTrials: String(twoParam.twoParamSettings.count) });
  const html = renderToStaticMarkup(<Play3D sharedSettings={sharedSettings} />);
  expect(html).toContain("Every trial in this search is random.");
  expect(html).not.toContain("Uniform random draw until TPE starts");
});

it("labels unfitted observations as unclassified and describes the random fallback", () => {
  const settings = { constraintPreset: "disk", startupTrials: 2, priorWeight: 0, infeasibleFilling: false } as const;
  const playback = twoParam.moveTwoParamPlayback(twoParam.emptyTwoParamPlayback(), 2, 50, "multivariate", settings);
  // Server rendering cannot step playback, so initialize the component at trial 2.
  const initialPlayback = vi.spyOn(twoParam, "emptyTwoParamPlayback").mockReturnValueOnce(playback);
  try {
    const sharedSettings = new URLSearchParams("seed=50&constraint=disk&startupTrials=2&priorWeight=0&infeasibleFilling=false");
    const html = renderToStaticMarkup(<Play3D sharedSettings={sharedSettings} />);
    expect(html).toContain('aria-label="Trial 1 · Unclassified · Infeasible');
    expect(html).toContain('aria-label="Trial 2 · Unclassified · Infeasible');
    expect(html).toContain("KDEs appear after 2 observations if Good has trials or a prior.");
    expect(html).toContain("adjust the target Good size and reshape ℓ and g.");
    expect(html).toContain("There is no Good group yet. The next trial is a uniform random draw.");
  } finally {
    initialPlayback.mockRestore();
  }
});

it("does not build the closed comparison panel", () => {
  const html = renderToStaticMarkup(<Play3D />);
  expect(html).toContain("Performance");
  expect(html).not.toContain('aria-label="Search performance"');
});

it("starts a shared Play 3D search at trial zero with the linked density mode and settings", () => {
  const sharedSettings = new URLSearchParams("preset=rosenbrock&seed=7&mode=univariate&startupTrials=5&gamma=0.5");
  const html = renderToStaticMarkup(<Play3D sharedSettings={sharedSettings} />);
  expect(html).toContain("Trial 0 / 200");
  expect(html).toContain("<span>Random start · 1 / 5</span>");
  expect(html).toMatch(/role="tooltip"[^>]*>Initial random exploration · 1 \/ 5\./);
  expect(html).toContain('value="rosenbrock" selected=""');
  expect(html).toContain('value="univariate" selected=""');
  expect(html).toContain('aria-label="Play 3D Search seed">7</output>');
  expect(html).toContain('aria-valuetext="50 percent"');
  expect(html).toContain('Share<span class="share-search-link-word"> link</span>');
});

it("shows the constraint selector with filling available only for an active preset", () => {
  const initial = renderToStaticMarkup(<Play3D />);
  expect(initial).toContain('<label for="constraint-preset-play-3d">Constraint</label>');
  expect(initial).toContain('<option value="none" selected="">None</option>');
  expect(initial).not.toContain('type="checkbox"');

  const active = renderToStaticMarkup(<Play3DConstraintSettings preset="disk" infeasibleFilling onPresetChange={() => {}} onFillingChange={() => {}} />);
  expect(active).toContain('<option value="disk" selected="">Small disk</option>');
  expect(active).toContain('type="checkbox" checked=""');
  expect(active).toContain("Infeasible filling");
  expect(active).toContain("Good takes feasible trials first. With filling on, the least-violating infeasible trials, those closest to the feasible region, fill open slots. With filling off, Good can fall short of its target size.");
  expect(active).toContain('1.5%');
});

it("starts a shared constrained Play 3D search with the linked constraint and filling", () => {
  const sharedSettings = new URLSearchParams("constraint=band&infeasibleFilling=false");
  const html = renderToStaticMarkup(<Play3D sharedSettings={sharedSettings} />);
  expect(html).toContain("Trial 0 / 200");
  expect(html).toContain('<option value="band" selected="">Thin band</option>');
  expect(html).toContain('<input type="checkbox"/> Infeasible filling');
  expect(html).not.toContain('id="constraint-hint-text-play-3d"');
});

it("replaces EI weights when a shared link turns a constraint on", () => {
  const sharedSettings = new URLSearchParams("constraint=disk&weights=ei");
  const html = renderToStaticMarkup(<Play3D sharedSettings={sharedSettings} />);
  expect(html).toContain('<option value="uniform" selected="">Uniform</option>');
  expect(html).toContain('<option value="ei" disabled="">');
});

it("describes candidate sampling per coordinate in the univariate proposal", () => {
  const playback = twoParam.moveTwoParamPlayback(twoParam.emptyTwoParamPlayback(), 2, 0, "univariate", { startupTrials: 2, candidates: 8 });
  const initialPlayback = vi.spyOn(twoParam, "emptyTwoParamPlayback").mockReturnValueOnce(playback);
  try {
    const sharedSettings = new URLSearchParams("mode=univariate&startupTrials=2&candidates=8");
    const html = renderToStaticMarkup(<Play3D sharedSettings={sharedSettings} />);
    expect(html).toContain("Drew 8 candidates per coordinate from ℓ and picked the highest ℓ/g for each.");
    expect(html).toContain('class="candidates-play-3d" role="group" tabindex="0" aria-label="TPE candidates · 8 x₁ and 8 x₂ axis samples · arrow keys inspect candidates · Selected candidates · x₁ #');
    expect(html).toContain("axis ticks show per-coordinate candidates and dashed floor lines combine their winners.");
  } finally {
    initialPlayback.mockRestore();
  }
});

it("summarizes joint candidates in multivariate TPE proposals", () => {
  const playback = twoParam.moveTwoParamPlayback(twoParam.emptyTwoParamPlayback(), 2, 0, "multivariate", { startupTrials: 2, candidates: 8 });
  const initialPlayback = vi.spyOn(twoParam, "emptyTwoParamPlayback").mockReturnValueOnce(playback);
  try {
    const sharedSettings = new URLSearchParams("mode=multivariate&startupTrials=2&candidates=8");
    const html = renderToStaticMarkup(<Play3D sharedSettings={sharedSettings} />);
    expect(html).toContain('class="candidates-play-3d" role="group" tabindex="0" aria-label="TPE candidates · 8 joint samples · arrow keys inspect candidates · Selected candidate ');
    expect(html).toContain("floor dots show sampled candidates and the ringed anchor marks the winner.");
  } finally {
    initialPlayback.mockRestore();
  }
});

it("builds distinct multivariate, univariate, random, and hidden candidate scene items", () => {
  const project = (x1: number, x2: number, height: number) => ({ x: x1 * 10, y: x2 * 10 - height * 20, depth: x1 + x2 + height * 10 });
  const inspect = () => {};

  const startup = twoParam.proposeTwoParamTrial([], 42, "multivariate");
  expect(buildPlay3DCandidateScene(startup, true, project, inspect).items).toEqual([]);

  const multiHistory = twoParam.moveTwoParamPlayback(twoParam.emptyTwoParamPlayback(), 2, 42, "multivariate", { startupTrials: 2, candidates: 6 });
  const multiProposal = twoParam.proposeTwoParamTrial(multiHistory.trials, 42, "multivariate", { startupTrials: 2, candidates: 6 });
  const multiScene = buildPlay3DCandidateScene(multiProposal, true, project, inspect);
  expect(multiScene.items).toHaveLength(6);
  expect(multiScene.items.every((item) => item.kind === "candidate")).toBe(true);
  expect(multiScene.hitTargets).toHaveLength(6);
  expect(multiScene.items.filter((item) => item.kind === "candidate" && item.selected)).toHaveLength(1);
  expect(multiScene.defaultInspectorIndex).toBe(multiProposal.selectedCandidateIndex);
  expect(buildPlay3DCandidateScene(multiProposal, false, project, inspect)).toEqual({
    items: [],
    hitTargets: [],
    inspectorEntries: [],
    defaultInspectorIndex: 0,
  });

  const uniHistory = twoParam.moveTwoParamPlayback(twoParam.emptyTwoParamPlayback(), 2, 42, "univariate", { startupTrials: 2, candidates: 6 });
  const uniProposal = twoParam.proposeTwoParamTrial(uniHistory.trials, 42, "univariate", { startupTrials: 2, candidates: 6 });
  const uniScene = buildPlay3DCandidateScene(uniProposal, true, project, inspect);
  const axisItems = uniScene.items.filter((item) => item.kind === "axis-candidate");
  const guides = uniScene.items.filter((item) => item.kind === "guide");
  const anchors = uniScene.items.filter((item) => item.kind === "floor-anchor");
  expect(uniScene.items.some((item) => item.kind === "candidate")).toBe(false);
  expect(axisItems).toHaveLength(12);
  expect(axisItems.filter((item) => item.selected)).toHaveLength(2);
  expect(uniScene.hitTargets).toHaveLength(12);
  expect(guides.length).toBeGreaterThan(2);
  const x1Guides = guides.filter((item) => item.id.startsWith("candidate-guide-x1-"));
  const x2Guides = guides.filter((item) => item.id.startsWith("candidate-guide-x2-"));
  expect(x1Guides[0].points.slice(0, 2)).toEqual([uniProposal.x1 * 10, -50]);
  expect(x1Guides[x1Guides.length - 1].points.slice(2, 4)).toEqual([uniProposal.x1 * 10, uniProposal.x2 * 10]);
  expect(x1Guides[0].dashOffset).toBe(0);
  expect(x1Guides[1].dashOffset).toBeCloseTo(Math.hypot(x1Guides[0].points[2] - x1Guides[0].points[0], x1Guides[0].points[3] - x1Guides[0].points[1]), 10);
  expect(x2Guides[0].points.slice(0, 2)).toEqual([-50, uniProposal.x2 * 10]);
  expect(x2Guides[x2Guides.length - 1].points.slice(2, 4)).toEqual([uniProposal.x1 * 10, uniProposal.x2 * 10]);
  expect(anchors).toHaveLength(1);
  expect(anchors[0]).toMatchObject({ x: uniProposal.x1 * 10, y: uniProposal.x2 * 10, depth: uniProposal.x1 + uniProposal.x2 + 0.028 });
  expect(uniScene.inspectorEntries).toHaveLength(13);
  expect(uniScene.inspectorEntries[0].id).toBe("candidate-winners");
});

it("states the feasible share only for an active constraint", () => {
  const none = renderToStaticMarkup(<Play3DConstraintSettings preset="none" infeasibleFilling onPresetChange={() => {}} onFillingChange={() => {}} />);
  expect(none).toContain("The whole search domain is feasible.");
  expect(none).not.toContain("of the domain is feasible");
  expect(none).toContain("Changing the constraint restarts the search.");

  const disk = renderToStaticMarkup(<Play3DConstraintSettings preset="disk" infeasibleFilling onPresetChange={() => {}} onFillingChange={() => {}} />);
  expect(disk).toContain("of the domain is feasible. Changing the constraint restarts the search.");
});

it("defaults the View mode group to 3D and keeps the original scene help", () => {
  const html = renderToStaticMarkup(<Play3D />);
  expect(html).toContain('role="group" aria-label="View mode"><button aria-pressed="true">3D</button><button aria-pressed="false">Top</button>');
  expect(html).toContain('aria-label="Interactive 3D landscape and KDE surfaces"');
  expect(html).toContain("Objective / Density · 1");
  expect(html).toContain('id="view-help" class="sr-only">Drag to rotate');
});

it("renders clipped markers, 2D axes and contextual help in Top view", () => {
  const html = renderToStaticMarkup(<Play3D initialViewMode="top" />);
  expect(html).toContain('role="group" aria-label="View mode"><button aria-pressed="false">3D</button><button aria-pressed="true">Top</button>');
  expect(html).toContain('class="scene-play-3d is-top"');
  expect(html).toContain('aria-label="Interactive top-down objective and density contours"');
  expect(html).toContain('aria-label="Zoom out" disabled=""');
  expect(html).toContain('id="view-help" class="sr-only">Hover or tap to inspect coordinates');
  expect(html).toContain("Hover or tap the map to inspect coordinates and values.");
  expect(html).toContain("Stronger shading marks higher values within each fitted layer.");
  expect(html).toContain(">x₁</text>");
  expect(html).toContain(">x₂</text>");
  expect(html).toContain(">−2.5</text>");
  expect(html).toMatch(/<g clip-path="url\(#[^"]+\)">.*class="optimum-play-3d"/);
  expect(html).not.toContain("Objective height scale");
  expect(html).not.toContain("Objective / Density · 1");
});
