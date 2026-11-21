import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ModelSettingsPanel } from "./ModelSettingsPanel";
import { applyOptunaPreset } from "./searchSettings";
import { twoParamDefaultModelSettings, twoParamSettings } from "./twoParamTpe";

function renderPanel(status?: string, props: Partial<React.ComponentProps<typeof ModelSettingsPanel>> = {}) {
  return renderToStaticMarkup(
    <ModelSettingsPanel
      experiment={{ page: "play-3d", preset: "quadratic", mode: "multivariate", constraint: "none" }}
      settings={twoParamDefaultModelSettings}
      defaultSettings={twoParamDefaultModelSettings}
      onChange={() => {}}
      seed={42}
      onNewSeed={() => {}}
      trialLimit={twoParamSettings.count}
      widths={[]}
      domainWidth={10}
      status={status}
      {...props}
    />,
  );
}

it("uses the supplied filling default independently of EI availability", () => {
  const settings = { ...twoParamDefaultModelSettings, infeasibleFilling: false };
  const disabledReset = /<button[^>]*disabled=""[^>]*aria-label="Reset model defaults"/;
  expect(renderPanel(undefined, { settings, disableEi: true })).toMatch(disabledReset);
  const defaultSettings = { ...twoParamDefaultModelSettings, infeasibleFilling: true };
  expect(renderPanel(undefined, { settings, defaultSettings })).not.toMatch(disabledReset);
  expect(renderPanel(undefined, { defaultSettings })).toMatch(disabledReset);
});

it("renders playback status between Settings and the live controls when provided", () => {
  const html = renderPanel("Random start");
  const settingsButton = html.indexOf(">Settings</button>");
  const status = html.indexOf('class="model-status"');
  const liveControls = html.indexOf('class="config live-model-controls');

  expect(settingsButton).toBeGreaterThanOrEqual(0);
  expect(status).toBeGreaterThan(settingsButton);
  expect(liveControls).toBeGreaterThan(status);
  expect(html.slice(status, liveControls)).toContain("Random start");
  expect(renderPanel()).not.toContain('class="model-status"');
});

it("keeps dialog actions in the footer and the seed in Experiment", () => {
  const html = renderPanel();

  const heading = html.match(/class="settings-dialog-heading">([\s\S]*?)<\/div>/)?.[1];
  expect(heading).toMatch(/^<h2[^>]*>Settings<\/h2><button[^>]*aria-label="Close settings"[^>]*>×<\/button>$/);

  const footer = html.match(/class="settings-dialog-footer">([\s\S]*?)<\/div>/)?.[1];
  expect(footer).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Reset model defaults"/);
  expect(footer).toMatch(/Share<span class="share-search-link-word"> link<\/span><\/button>/);

  const experiment = html.match(/<legend>Experiment<\/legend>([\s\S]*?)<\/fieldset>/)?.[1];
  expect(experiment).toContain('<output aria-label="Search seed">42</output>');
  expect(experiment).toContain("New seed");

  const model = html.match(/<legend>Model<\/legend>([\s\S]*?)<\/fieldset>/)?.[1];
  expect(model).toContain('aria-label="About bandwidth rule"');

  const bandwidth = html.match(/aria-label="About bandwidth"[^>]*>ⓘ<\/button><span[^>]*role="tooltip"[^>]*>([\s\S]*?)<\/span><\/span>/)?.[1];
  expect(bandwidth).toContain("Width of each Gaussian kernel.");
  expect(bandwidth).not.toContain("magic clipping");

  const search = html.match(/<legend>Search<\/legend>([\s\S]*?)<\/fieldset>/)?.[1];
  expect(search).toContain("Startup trials");
  expect(search).toContain("Candidates");
  expect(search).not.toContain("Search seed");
});

it("marks only the guided slider as the coachmark target", () => {
  const html = renderToStaticMarkup(
    <ModelSettingsPanel
      experiment={{ page: "play-3d", preset: "quadratic", mode: "multivariate", constraint: "none" }}
      settings={twoParamDefaultModelSettings}
      defaultSettings={twoParamDefaultModelSettings}
      onChange={() => {}}
      seed={42}
      onNewSeed={() => {}}
      trialLimit={twoParamSettings.count}
      widths={[]}
      domainWidth={10}
      guide={{ id: "gamma", describedBy: "play-guide-text-play-3d" }}
    />,
  );

  expect(html).toMatch(/<input id="gamma"[^>]*data-guide-target="true"[^>]*aria-describedby="play-guide-text-play-3d"/);
  const bandwidth = html.match(/<input id="bandwidth"[^>]*>/)?.[0];
  expect(bandwidth).toBeDefined();
  expect(bandwidth).not.toMatch(/data-guide-target|aria-describedby/);
});

it("explains candidate sampling and Good for constrained univariate searches", () => {
  const html = renderPanel(undefined, {
    experiment: { page: "play-3d", preset: "quadratic", mode: "univariate", constraint: "disk" },
  });
  expect(html).toContain("Draws this many candidates per coordinate from ℓ and picks the highest ℓ/g for each.");
  expect(html).toContain("The prior can be the only Good kernel.");
  expect(html).toContain("Sets the target size of Good. Feasible trials rank first by objective. Infeasible filling uses the least-violating trials to fill empty slots.");
  const unconstrained = renderPanel();
  expect(unconstrained).toContain("Draws this many candidates from ℓ per trial and picks the highest ℓ/g.");
  expect(unconstrained).toContain("rounded up, and leaves at least one trial in Bad.");
});

it("disables the Optuna preset when it matches and shows each coordinate's observation width range", () => {
  const settings = applyOptunaPreset({ bandwidth: 0.73 });
  const widths = [
    { label: "x₁", values: [4, 2, 3, 2] },
    { label: "x₂", values: [1, 3, 1, 2] },
  ];
  const html = renderPanel(undefined, { settings, widths });
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Optuna preset<\/button>/);
  expect(html).toContain("x₁ 2.00–4.00 · x₂ 1.00–3.00");
  expect(html).toMatch(/<input id="bandwidth"[^>]*value="2.5"/);
  expect(renderPanel(undefined, { settings: { ...settings, gamma: 0.2 } }))
    .toMatch(/<button type="button">Optuna preset<\/button>/);
});

it("labels the neighbor bandwidth rule as Optuna on one short line", () => {
  const html = renderPanel(undefined, { settings: applyOptunaPreset(twoParamDefaultModelSettings), widths: [{ label: "x₁", values: [0.5, 1] }] });
  expect(html).toContain('<option value="neighbor" selected="">Optuna</option>');
  expect(html).toContain('<span class="bandwidth-mode">Optuna rule · Good KDE</span>');
  expect(html).not.toContain("Neighbor");
});
