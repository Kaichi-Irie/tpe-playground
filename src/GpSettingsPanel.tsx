import { useId, type ReactNode } from "react";
import {
  applyOptunaGpPreset, gpAcquisitionOptions, gpBetaRange, gpDefaults, gpKernelOptions, gpLengthScaleRange,
  gpLengthScaleRules, gpNoiseOptions, gpStartupTrialCounts, gpXiRange, matchesGpDefaults, matchesOptunaGpPreset, type GpSettings,
} from "./gpSettings";
import { Help } from "./Help";
import { SamplerSettingsShell } from "./SamplerSettingsShell";
import type { ShareExperiment } from "./shareSearch";

interface Props {
  experiment: Extract<ShareExperiment, { sampler: "gp" }>;
  resolvedLengthScale: number;
  onChange: (settings: GpSettings) => void;
  seed: number;
  onNewSeed: () => void;
  trialLimit: number;
  children?: ReactNode;
  status?: ReactNode;
}

export function GpSettingsPanel({ experiment, resolvedLengthScale, onChange, seed, onNewSeed, trialLimit, children, status }: Props) {
  const id = useId();
  const settings = experiment.gpSettings;
  const auto = settings.lengthScaleRule === "auto";
  const ucb = settings.acquisition === "ucb";
  const exploreLabel = ucb ? "Explore β" : "Explore ξ";
  const exploreValue = ucb ? settings.beta : settings.xi;
  const lengthScaleText = auto ? `Auto · ${resolvedLengthScale.toFixed(2)}` : settings.lengthScale.toFixed(2);
  const lengthScaleValue = auto ? resolvedLengthScale : settings.lengthScale;
  return <SamplerSettingsShell
    experiment={experiment} seed={seed} seedLabel="Search seed" onNewSeed={onNewSeed}
    isDefault={matchesGpDefaults(settings)} onReset={() => onChange(gpDefaults)}
    isOptunaPreset={matchesOptunaGpPreset(settings)} onOptunaPreset={() => onChange(applyOptunaGpPreset(settings))}
    optunaPresetHelp={<>Optuna’s GPSampler defaults to Matérn 5/2, LogEI, automatic length scales and 10 startup trials. This playground uses a lightweight isotropic GP with EI and a fixed-seed search in the browser, so trajectories can differ.</>}
    experimentFields={children}
    modelFields={<>
      <fieldset className="settings-fields"><legend>GP model</legend>
        <div className="parameter">
          <div className="parameter-label"><label htmlFor={`${id}-kernel`}>Kernel</label></div>
          <select id={`${id}-kernel`} value={settings.kernel} onChange={(event) => onChange({ ...settings, kernel: event.target.value as GpSettings["kernel"] })}>
            {gpKernelOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="parameter">
          <div className="parameter-label"><label htmlFor={`${id}-acquisition`}>Acquisition</label></div>
          <select id={`${id}-acquisition`} value={settings.acquisition} onChange={(event) => onChange({ ...settings, acquisition: event.target.value as GpSettings["acquisition"] })}>
            {gpAcquisitionOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="parameter">
          <div className="parameter-label"><label htmlFor={`${id}-rule`}>Length scale rule</label></div>
          <select id={`${id}-rule`} value={settings.lengthScaleRule} onChange={(event) => onChange({ ...settings, lengthScaleRule: event.target.value as GpSettings["lengthScaleRule"] })}>
            {gpLengthScaleRules.map((rule) => <option key={rule} value={rule}>{rule === "auto" ? "Auto (MLE)" : "Manual"}</option>)}
          </select>
        </div>
        <div className="parameter">
          <div className="parameter-label"><label htmlFor={`${id}-noise`}>Observation noise σₙ</label></div>
          <select id={`${id}-noise`} value={settings.noise} onChange={(event) => onChange({ ...settings, noise: Number(event.target.value) })}>
            {gpNoiseOptions.map((noise) => <option key={noise} value={noise}>{noise}</option>)}
          </select>
        </div>
      </fieldset>
      <fieldset className="settings-fields"><legend>Search</legend>
        <div className="parameter">
          <div className="parameter-label"><label htmlFor={`${id}-startup`}>Startup trials</label></div>
          <select id={`${id}-startup`} value={settings.startupTrials} onChange={(event) => onChange({ ...settings, startupTrials: Number(event.target.value) })}>
            {gpStartupTrialCounts(trialLimit).map((count) => <option key={count} value={count}>{count === trialLimit ? `${count} · Random only` : count}</option>)}
          </select>
        </div>
      </fieldset>
    </>}
    status={status}
    liveControlsLabel="Live GP settings"
    liveControls={<>
      <div className="parameter">
        <div className="parameter-label"><label htmlFor={`${id}-length`}>Length scale ℓ</label><output>{lengthScaleText}</output></div>
        <input id={`${id}-length`} type="range" {...gpLengthScaleRange} value={Math.min(gpLengthScaleRange.max, lengthScaleValue)}
          aria-valuetext={lengthScaleText} onChange={(event) => onChange({ ...settings, lengthScaleRule: "manual", lengthScale: Number(event.target.value) })} />
        <span className="gp-length-rule">{auto ? "Auto rule · MLE" : "Manual rule"}</span>
      </div>
      <div className="parameter">
        <div className="parameter-label"><label htmlFor={`${id}-explore`}>{exploreLabel}</label><Help label={exploreLabel}>
          {ucb ? "Lower β favors low predicted values. Higher β gives uncertain regions more weight." : "EI weighs the chance and size of improvement over the best observation. Higher ξ asks for a larger improvement, favoring uncertain regions."}
        </Help><output>{exploreValue.toFixed(ucb ? 1 : 2)}</output></div>
        <input id={`${id}-explore`} type="range" {...(ucb ? gpBetaRange : gpXiRange)} value={exploreValue}
          onChange={(event) => onChange({ ...settings, [ucb ? "beta" : "xi"]: Number(event.target.value) })} />
      </div>
    </>}
  />;
}
