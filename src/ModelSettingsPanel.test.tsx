import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ModelSettingsPanel } from "./ModelSettingsPanel";
import { defaultModelSettings2D, settings2D } from "./tpe2d";

function renderPanel(status?: string, props: Partial<React.ComponentProps<typeof ModelSettingsPanel>> = {}) {
  return renderToStaticMarkup(
    <ModelSettingsPanel
      experiment={{ page: "2d", preset: "quadratic", mode: "multivariate", constraint: "none" }}
      settings={defaultModelSettings2D}
      defaultSettings={defaultModelSettings2D}
      onChange={() => {}}
      seed={42}
      onNewSeed={() => {}}
      trialLimit={settings2D.count}
      widths={[]}
      domainWidth={10}
      status={status}
      {...props}
    />,
  );
}

it("uses the supplied filling default independently of EI availability", () => {
  const settings = { ...defaultModelSettings2D, infeasibleFilling: false };
  const disabledReset = /<button[^>]*disabled=""[^>]*aria-label="Reset model defaults"/;
  expect(renderPanel(undefined, { settings, disableEi: true })).toMatch(disabledReset);
  const defaultSettings = { ...defaultModelSettings2D, infeasibleFilling: true };
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
  expect(footer).toMatch(/Share link<\/button>/);

  const experiment = html.match(/<legend>Experiment<\/legend>([\s\S]*?)<\/fieldset>/)?.[1];
  expect(experiment).toContain('<output aria-label="Search seed">42</output>');
  expect(experiment).toContain("New seed");

  const model = html.match(/<legend>Model<\/legend>([\s\S]*?)<\/fieldset>/)?.[1];
  expect(model).toContain('aria-label="About bandwidth rule"');

  const bandwidth = html.match(/aria-label="About bandwidth"[^>]*>ⓘ<\/button><span[^>]*>([^<]*)<\/span>/)?.[1];
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
      experiment={{ page: "2d", preset: "quadratic", mode: "multivariate", constraint: "none" }}
      settings={defaultModelSettings2D}
      defaultSettings={defaultModelSettings2D}
      onChange={() => {}}
      seed={42}
      onNewSeed={() => {}}
      trialLimit={settings2D.count}
      widths={[]}
      domainWidth={10}
      guide={{ id: "gamma", describedBy: "play-guide-text-2d" }}
    />,
  );

  expect(html).toMatch(/<input id="gamma"[^>]*data-guide-target="true"[^>]*aria-describedby="play-guide-text-2d"/);
  const bandwidth = html.match(/<input id="bandwidth"[^>]*>/)?.[0];
  expect(bandwidth).toBeDefined();
  expect(bandwidth).not.toMatch(/data-guide-target|aria-describedby/);
});
