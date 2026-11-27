import type { ReactNode } from "react";
import { Help } from "./Help";
import { ResponsiveSettings } from "./ResponsiveSettings";
import { ShareSearchLink } from "./ShareSearchLink";
import type { ShareExperiment } from "./shareSearch";

interface Props {
  experiment: ShareExperiment;
  seed: number;
  seedLabel: string;
  onNewSeed: () => void;
  isDefault: boolean;
  onReset: () => void;
  isOptunaPreset: boolean;
  onOptunaPreset: () => void;
  optunaPresetHelp: ReactNode;
  experimentFields: ReactNode;
  modelFields: ReactNode;
  status?: ReactNode;
  liveControls: ReactNode;
  liveControlsLabel: string;
  liveControlsClassName?: string;
  className?: string;
}

export function SamplerSettingsShell({
  experiment, seed, seedLabel, onNewSeed, isDefault, onReset, isOptunaPreset, onOptunaPreset,
  optunaPresetHelp, experimentFields, modelFields, status, liveControls, liveControlsLabel,
  liveControlsClassName, className,
}: Props) {
  const sampler = experiment.sampler ?? "tpe";
  return (
    <div data-sampler={sampler} className={className ? `model-controls ${className}` : "model-controls"}>
      <ResponsiveSettings footer={<>
        <button type="button" className="settings-reset" disabled={isDefault} onClick={onReset} aria-label="Reset model defaults"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" /><path d="M3 3v5h5" /></svg>Reset</button>
        <span className="settings-preset-action">
          <button type="button" disabled={isOptunaPreset} onClick={onOptunaPreset}>Optuna preset</button>
          <Help label="Optuna preset">{optunaPresetHelp}</Help>
        </span>
        <ShareSearchLink experiment={experiment} seed={seed} />
      </>}>
        <div className="settings-form">
          <fieldset className="settings-fields"><legend>Experiment</legend>
            {experimentFields}
            <div className="parameter seed-settings">
              <div className="parameter-label"><span>Seed</span><output aria-label={seedLabel}>{seed}</output></div>
              <button type="button" className="resample" title="Restart the search with a random seed from 0 to 99" onClick={onNewSeed}>↻ New seed</button>
            </div>
          </fieldset>
          {modelFields}
        </div>
      </ResponsiveSettings>
      {status != null && <div className="model-status" aria-live="polite">{status}</div>}
      <section className={liveControlsClassName ? `config live-model-controls ${liveControlsClassName}` : "config live-model-controls"} aria-label={liveControlsLabel}>
        {liveControls}
      </section>
    </div>
  );
}
