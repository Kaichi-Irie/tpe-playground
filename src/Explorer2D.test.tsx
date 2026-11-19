import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Explorer2D from "./Explorer2D";

it("starts a sequential 2D search with no observations and a preview of its first proposal", () => {
  const html = renderToStaticMarkup(<Explorer2D />);
  expect(html).toContain("Trial 0 / 200");
  expect(html).toContain("Initial random exploration · 1 / 10");
  expect(html).toContain("Next (x₁, x₂) =");
  expect(html).toContain("Next evaluation ·");
  expect(html).toContain("KDEs appear after 2 observations.");
  expect(html).toContain("Next trial");
  expect(html).toContain("Previous trial");
  expect(html).toContain("Play");
  expect(html).not.toContain("Resample");
  expect(html).toContain("Performance");
  expect(html).toContain("Objective height scale");
  expect(html).toContain("Log1p");
  expect(html).toContain("Estimated optimum ·");
  expect(html).toContain('class="scene-canvas-2d"');
  expect(html).toContain("About 2D density model");
  expect(html).toContain("preserving their pairing");
  for (const label of ["Good fraction", "Bandwidth", "Scott", "Silverman", "settings-dialog", "Prior weight", "Startup trials", "Candidates", "Weights", "Reset model defaults", "Quadratic", "Rosenbrock"]) expect(html).toContain(label);
  expect(html).not.toContain("coming soon");
  expect(html).toContain("Density model");
  expect(html).toContain("Univariate");
  expect(html).toContain("preserve observations");
  expect(html).not.toContain('class="observation-target-2d');
});

it("does not build the closed comparison panel", () => {
  const html = renderToStaticMarkup(<Explorer2D />);
  expect(html).toContain("Performance");
  expect(html).not.toContain('aria-label="Search performance"');
});

it("starts a shared Play 3D search at trial zero with the linked density mode and settings", () => {
  const sharedSettings = new URLSearchParams("preset=rosenbrock&seed=7&mode=univariate&startupTrials=5&gamma=0.5");
  const html = renderToStaticMarkup(<Explorer2D sharedSettings={sharedSettings} />);
  expect(html).toContain("Trial 0 / 200");
  expect(html).toContain("Initial random exploration · 1 / 5");
  expect(html).toContain('value="rosenbrock" selected=""');
  expect(html).toContain('value="univariate" selected=""');
  expect(html).toContain('aria-label="2D Search seed">7</output>');
  expect(html).toContain('aria-valuetext="50 percent"');
  expect(html).toContain("Share link");
});
