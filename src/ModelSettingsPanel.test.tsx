import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ModelSettingsPanel } from "./ModelSettingsPanel";
import { defaultModelSettings2D, settings2D } from "./tpe2d";

function renderPanel(status?: string) {
  return renderToStaticMarkup(
    <ModelSettingsPanel
      experiment={{ page: "2d", preset: "quadratic", mode: "multivariate" }}
      settings={defaultModelSettings2D}
      defaultSettings={defaultModelSettings2D}
      onChange={() => {}}
      seed={42}
      onNewSeed={() => {}}
      trialLimit={settings2D.count}
      widths={[]}
      domainWidth={10}
      status={status}
    />,
  );
}

it("renders playback status between Settings and the live controls when provided", () => {
  expect(renderPanel("Random start")).toMatch(/class="model-controls"><section class="responsive-settings">.*>Settings<\/button>.*<\/dialog><\/section><div class="model-status" aria-live="polite">Random start<\/div><section class="config live-model-controls /);
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
