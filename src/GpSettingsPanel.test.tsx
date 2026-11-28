import { renderToStaticMarkup } from "react-dom/server";
import type { ChangeEvent, ReactElement } from "react";
import { expect, it, vi } from "vitest";
import { applyOptunaGpPreset, gpDefaults, type GpSettings } from "./gpSettings";
import { GpSettingsPanel } from "./GpSettingsPanel";
import type { SamplerSettingsShell } from "./SamplerSettingsShell";

function renderPanel(settings: GpSettings = gpDefaults, onChange = vi.fn()) {
  let shell!: ReactElement<React.ComponentProps<typeof SamplerSettingsShell>>;
  function Capture() {
    shell = GpSettingsPanel({
      experiment: { page: "play-2d", preset: "multimodal", sampler: "gp", gpSettings: settings },
      resolvedLengthScale: 2.75, onChange, seed: 42, onNewSeed: () => {}, trialLimit: 200,
    });
    return shell;
  }
  const html = renderToStaticMarkup(<Capture />);
  return { html, shell: shell.props, onChange };
}

it("renders the shared settings dialog with GP model and search controls", () => {
  const { html } = renderPanel();
  for (const text of ["GP model", "Kernel", "Matérn 5/2", "RBF", "Acquisition", "UCB (LCB)", "EI (Expected Improvement)", "Length scale rule", "Auto (MLE)", "Observation noise σₙ", "Startup trials", "Search seed", "Optuna preset", "Share", "LogEI"]) {
    expect(html).toContain(text);
  }
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Reset model defaults"/);
  expect(html).toContain("Auto · 2.75");
  expect(html).toContain("Auto rule · MLE");
  expect(html).toContain("Explore β");
});

it("applies and resets the Optuna preset while preserving the dormant manual scale and beta", () => {
  const settings = { ...gpDefaults, lengthScaleRule: "manual", lengthScale: 1.5, beta: 3 } as const;
  const { shell, onChange } = renderPanel(settings);
  shell.onOptunaPreset();
  expect(onChange).toHaveBeenLastCalledWith(applyOptunaGpPreset(settings));
  const applied = renderPanel(onChange.mock.lastCall![0], onChange);
  expect(applied.shell.isOptunaPreset).toBe(true);
  expect(applied.html).toContain("Explore ξ");
  expect(applied.html).not.toContain("Explore β");
  applied.shell.onReset();
  expect(onChange).toHaveBeenLastCalledWith(gpDefaults);
});

it("switches Auto to Manual when the length scale slider changes", () => {
  const { shell, onChange } = renderPanel();
  const live = shell.liveControls as ReactElement<{ children: ReactElement<{ children: ReactElement<{ onChange: (event: ChangeEvent<HTMLInputElement>) => void }>[] }>[] }>;
  const lengthInput = live.props.children[0].props.children[1];
  lengthInput.props.onChange({ target: { value: "3.25" } } as ChangeEvent<HTMLInputElement>);
  const next = { ...gpDefaults, lengthScaleRule: "manual", lengthScale: 3.25 } as const;
  expect(onChange).toHaveBeenCalledWith(next);
  expect(renderPanel(next).html).toContain("Manual rule");
});
