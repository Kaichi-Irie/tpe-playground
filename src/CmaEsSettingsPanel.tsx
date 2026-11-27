import { useId, type ReactNode } from "react";
import { Help } from "./Help";
import { HelpMath } from "./HelpMath";
import { ResponsiveSettings } from "./ResponsiveSettings";
import { ShareSearchLink } from "./ShareSearchLink";
import type { ShareExperiment } from "./shareSearch";
import { cmaEsPopulationSizeRange, cmaEsSigma0Range, cmaEsX0Range, matchesOptunaCmaEsPreset, optunaCmaEsPreset, twoParamCmaEsDefaults, type TwoParamCmaEsSettings } from "./twoParamCmaEs";

interface Props {
  children: ReactNode;
  experiment: Extract<ShareExperiment, { sampler: "cmaes" }>;
  settings: TwoParamCmaEsSettings;
  onChange: (settings: TwoParamCmaEsSettings) => void;
  seed: number;
  onNewSeed: () => void;
  status: string;
}

const meanOptions = Array.from(
  { length: (cmaEsX0Range.max - cmaEsX0Range.min) / cmaEsX0Range.step + 1 },
  (_, index) => cmaEsX0Range.min + index * cmaEsX0Range.step,
);
const populationOptions = Array.from(
  { length: cmaEsPopulationSizeRange.max - cmaEsPopulationSizeRange.min + 1 },
  (_, index) => cmaEsPopulationSizeRange.min + index,
);

export function CmaEsSettingsPanel({ children, experiment, settings, onChange, seed, onNewSeed, status }: Props) {
  const id = useId();
  const { sigma0, populationSize, x0 } = settings;
  const populationText = populationSize === twoParamCmaEsDefaults.populationSize ? "6 · Auto" : String(populationSize);
  const changeSigma = (value: number) => onChange({ ...settings, sigma0: value });
  const changePopulation = (value: number) => onChange({ ...settings, populationSize: value });
  return <div className="model-controls cmaes-model-controls">
    <ResponsiveSettings footer={<>
      <button type="button" className="settings-reset" disabled={matchesOptunaCmaEsPreset(settings)} onClick={() => onChange(twoParamCmaEsDefaults)}>Reset</button>
      <span className="settings-preset-action">
        <button type="button" disabled={matchesOptunaCmaEsPreset(settings)} onClick={() => onChange(optunaCmaEsPreset)}>Optuna preset</button>
        <Help label="Optuna preset">
          Optuna’s CmaEsSampler defaults correspond to <HelpMath inline tex="\sigma_0=\mathrm{span}/6" /> (rounded to 1.67 here),
          {" "}<HelpMath inline tex="\lambda=6" /> in two dimensions, and <HelpMath inline tex="x_0=(0,0)" /> on this domain.
          The Playground uses zero startup trials and fixed-stride Box–Muller sampling. Optuna defaults to one startup trial and uses a different random stream, so the same seed can give a different trajectory.
        </Help>
      </span>
      <ShareSearchLink experiment={experiment} seed={seed} />
    </>}>
      <div className="settings-form">
        <fieldset className="settings-fields"><legend>Experiment</legend>
          {children}
          <div className="parameter seed-settings">
            <div className="parameter-label"><span>Seed</span><output aria-label="Play 3D Search seed">{seed}</output></div>
            <button type="button" className="resample" title="Restart the search with a random seed from 0 to 99" onClick={onNewSeed}>↻ New seed</button>
          </div>
        </fieldset>
        <fieldset className="settings-fields"><legend>CMA-ES</legend>
          <div className="parameter">
            <div className="parameter-label"><label htmlFor={`${id}-sigma-settings`}>Initial σ₀</label></div>
            <input key={sigma0} id={`${id}-sigma-settings`} type="number" {...cmaEsSigma0Range} defaultValue={sigma0.toFixed(2)}
              onBlur={(event) => {
                const input = event.currentTarget;
                const value = input.valueAsNumber;
                if (input.validity.valid && Number.isFinite(value) && value !== sigma0) changeSigma(value);
                else input.value = sigma0.toFixed(2);
              }}
              onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
          </div>
          <div className="parameter">
            <div className="parameter-label"><label htmlFor={`${id}-population-settings`}>Population size λ</label></div>
            <select id={`${id}-population-settings`} value={populationSize} onChange={(event) => changePopulation(Number(event.target.value))}>
              {populationOptions.map((value) => <option key={value} value={value}>{value === twoParamCmaEsDefaults.populationSize ? "6 · Auto" : value}</option>)}
            </select>
          </div>
          <fieldset className="settings-fields cmaes-mean-settings"><legend>Initial mean x₀</legend>
            {(["x1", "x2"] as const).map((axis) => <div className="parameter" key={axis}>
              <div className="parameter-label"><label htmlFor={`${id}-${axis}`}>{axis === "x1" ? "x₁" : "x₂"}</label></div>
              <select id={`${id}-${axis}`} value={x0[axis]} onChange={(event) => onChange({ ...settings, x0: { ...x0, [axis]: Number(event.target.value) } })}>
                {meanOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>)}
          </fieldset>
        </fieldset>
      </div>
    </ResponsiveSettings>
    <div className="model-status" aria-live="polite">{status}<span id="trial-seek-help-play-3d" className="sr-only">Seeking back discards later trials.</span></div>
    <section className="config live-model-controls" aria-label="Live CMA-ES settings">
      <div className="parameter">
        <div className="parameter-label"><label htmlFor={`${id}-sigma`}>Initial σ₀</label><output>{sigma0.toFixed(2)}</output></div>
        <input id={`${id}-sigma`} type="range" {...cmaEsSigma0Range} value={sigma0} onChange={(event) => changeSigma(Number(event.target.value))} />
      </div>
      <div className="parameter">
        <div className="parameter-label"><label htmlFor={`${id}-population`}>Population λ</label><output>{populationText}</output></div>
        <input id={`${id}-population`} type="range" {...cmaEsPopulationSizeRange} value={populationSize} aria-valuetext={populationText} onChange={(event) => changePopulation(Number(event.target.value))} />
      </div>
    </section>
  </div>;
}
