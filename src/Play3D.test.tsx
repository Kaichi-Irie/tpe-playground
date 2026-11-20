import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Play3D, { Play3DConstraintSettings } from "./Play3D";
import { twoParamSettings } from "./twoParamTpe";

it("starts a sequential Play 3D search with no observations and a preview of its first proposal", () => {
  const html = renderToStaticMarkup(<Play3D />);
  expect(html).toContain("Trial 0 / 200");
  expect(html).toContain('aria-label="Play 3D Trial progress"');
  expect(html).toContain('aria-label="Play 3D Search seed">0</output>');
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
  for (const label of ["Good fraction", "Bandwidth", "Scott", "Silverman", "settings-dialog", "Prior weight", "Startup trials", "Candidates", "Weights", "Reset model defaults", "Quadratic", "Rosenbrock"]) expect(html).toContain(label);
  expect(html).not.toContain("coming soon");
  expect(html).toContain("Density model");
  expect(html).toContain("Univariate");
  expect(html).toContain('id="trial-seek-help-play-3d">Seeking back discards later trials.</span>');
  expect(html).toContain('aria-describedby="trial-seek-help-play-3d"');
  expect(html).not.toContain('class="observation-target-play-3d');
});

it("describes random-only playback without a TPE start trial", () => {
  const sharedSettings = new URLSearchParams({ startupTrials: String(twoParamSettings.count) });
  const html = renderToStaticMarkup(<Play3D sharedSettings={sharedSettings} />);
  expect(html).toContain("Every trial in this search is random.");
  expect(html).not.toContain("Uniform random draw until TPE starts");
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
  expect(html).toContain("Share link");
});

it("shows the constraint selector with filling available only for an active preset", () => {
  const initial = renderToStaticMarkup(<Play3D />);
  expect(initial).toContain('<label for="constraint-preset-play-3d">Constraint</label>');
  expect(initial).toContain('<option value="none" selected="">None</option>');
  expect(initial).not.toContain('type="checkbox"');

  const active = renderToStaticMarkup(<Play3DConstraintSettings preset="disk" infeasibleFilling onPresetChange={() => {}} onFillingChange={() => {}} />);
  expect(active).toContain('<option value="disk" selected="">Small disk</option>');
  expect(active).toContain('type="checkbox" checked=""');
  expect(active).toContain('Infeasible filling');
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
