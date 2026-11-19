import type { ReactNode } from "react";
import { ResponsiveSettings } from "./ResponsiveSettings";
import type { BandwidthRule } from "./model/bandwidth";
import type { WeightStrategy } from "./model/types";
import { Help } from "./Help";
import { ShareSearchLink } from "./ShareSearchLink";
import type { ShareExperiment } from "./shareSearch";
import { bandwidthRange, candidateCounts, gammaRange, priorWeights, startupTrialCounts, weightOptions, type ModelSettings } from "./searchSettings";

interface Props {
  children?: ReactNode;
  experiment: ShareExperiment;
  settings: ModelSettings;
  defaultSettings: ModelSettings;
  onChange: (settings: ModelSettings) => void;
  seed: number;
  onNewSeed: () => void;
  trialLimit: number;
  widths: readonly { label: string; value: number }[];
  domainWidth: number;
  idSuffix?: string;
  labelPrefix?: string;
  className?: string;
}

export function ModelSettingsPanel({ children, experiment, settings, defaultSettings, onChange, seed, onNewSeed, trialLimit, widths, domainWidth, idSuffix = "", labelPrefix = "", className = "" }: Props) {
  const { gamma, bandwidth, priorWeight, startupTrials, candidates, weights } = settings;
  const bandwidthRule = settings.bandwidthRule ?? "constant";
  const id = (name: string) => `${name}${idSuffix}`;
  const change = (patch: Partial<ModelSettings>) => onChange({ ...settings, ...patch });
  const isDefault = (Object.keys(defaultSettings) as (keyof ModelSettings)[]).every((key) => (key === "bandwidthRule" ? bandwidthRule === (defaultSettings.bandwidthRule ?? "constant") : settings[key] === defaultSettings[key]));
  const weightOption = weightOptions.find((option) => option.value === weights)!;
  const displayedWidth = bandwidthRule === "constant" ? bandwidth : widths[0]?.value;
  const sliderWidth = displayedWidth ?? bandwidth;
  const sliderMax = domainWidth;
  const widthText = bandwidthRule !== "constant" && widths.length > 1
    ? widths.map(({ label, value }) => `${label}: ${value.toFixed(2)}`).join(" · ")
    : displayedWidth?.toFixed(2) ?? "—";
  return (
    <div className="model-controls">
    <ResponsiveSettings action={<button className="settings-reset" disabled={isDefault} onClick={() => onChange(defaultSettings)} aria-label="Reset model defaults">Reset defaults</button>}><div className="settings-form">
      <fieldset className="settings-fields"><legend>Experiment</legend>{children}<ShareSearchLink experiment={experiment} seed={seed} settings={settings} /></fieldset>
      <fieldset className="settings-fields"><legend>Model</legend>
            <div className="parameter"><label htmlFor={id("bandwidth-rule")}>Bandwidth rule</label>
          <select id={id("bandwidth-rule")} aria-label={`${labelPrefix}Bandwidth rule`} value={bandwidthRule} onChange={(event) => change({ bandwidthRule: event.target.value as BandwidthRule })}><option value="constant">Constant</option><option value="scott">Scott</option><option value="silverman">Silverman</option></select>
            </div>
            <div className="parameter primary-weights">
              <div className="parameter-label">
                <div><label htmlFor={id("weights")}>Weights</label><Help label="observation weights">{weightOption.description} Weights in each group sum to its observation count. Changes preserve observations and affect future trials.</Help>
                </div>
              </div>
              <select id={id("weights")} value={weights} onChange={(event) => change({ weights: event.target.value as WeightStrategy })}>{weightOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            </div>
            <div className="parameter">
              <div className="parameter-label">
                <div><label htmlFor={id("prior-weight")}>Prior weight</label><Help label="Gaussian prior">Include a broad Gaussian prior with mean 0 and σ = 10 on each axis in each KDE. Weight 0 disables it; weight 1 equals one observation. It affects densities and candidate sampling, with decreasing relative influence as observations accumulate. Broader coverage does not guarantee better results.</Help>
                </div>
              </div>
              <select id={id("prior-weight")} value={priorWeight} onChange={(event) => change({ priorWeight: Number(event.target.value) })}>{priorWeights.map((weight) => <option key={weight} value={weight}>{weight === 0 ? "0 · Off" : weight}</option>)}</select>
            </div>
      </fieldset>
      <fieldset className="settings-fields"><legend>Search</legend>
            <div className="parameter">
              <div className="parameter-label">
                <div><label htmlFor={id("startup-trials")}>Startup trials</label><Help label="startup trials">Use uniform random proposals while fewer than {startupTrials} observations exist. At least two observations are needed for the good/bad split. Setting {trialLimit} makes a fresh search entirely random. Changes keep existing observations and affect future proposals.</Help>
                </div>
              </div>
              <select id={id("startup-trials")} value={startupTrials} onChange={(event) => change({ startupTrials: Number(event.target.value) })}>{startupTrialCounts(trialLimit).map((count) => <option key={count} value={count}>{count === trialLimit ? `${trialLimit} · Random only` : count}</option>)}</select>
            </div>
            <div className="parameter">
              <div className="parameter-label">
                <div><label htmlFor={id("candidates")}>Candidates</label><Help label="candidate count">Draw this many candidates per variable group from ℓ(x), then evaluate only the one with the highest density ratio. More candidates do not mean more objective evaluations or guarantee better results.</Help>
                </div>
              </div>
              <select id={id("candidates")} value={candidates} onChange={(event) => change({ candidates: Number(event.target.value) })}>{candidateCounts.map((count) => <option key={count} value={count}>{count}</option>)}</select>
            </div>
            <div className="parameter seed-settings">
              <div className="parameter-label"><span>Seed</span>
                <output aria-label={`${labelPrefix}Search seed`}>{seed}</output>
              </div>
              <button type="button" className="resample" title="Restart the search with a random seed from 0 to 99" onClick={onNewSeed}>↻ New seed</button>
            </div>
      </fieldset>
    </div></ResponsiveSettings>
    <section className={`config live-model-controls ${className}`} aria-label={`${labelPrefix}Interactive model controls`}>
      <div className="parameter">
        <div className="parameter-label">
          <div><label htmlFor={id("gamma")}>Good fraction <span>γ</span></label><Help label="good fraction">The best {Math.round(gamma * 100)}% of observations (rounded up) form ℓ(x); the rest form g(x). At least one observation stays in each group. Lower objective values are better.</Help>
          </div>
          <output htmlFor={id("gamma")}>{Math.round(gamma * 100)}%</output>
        </div>
        <input id={id("gamma")} type="range" {...gammaRange} value={gamma} aria-valuetext={`${Math.round(gamma * 100)} percent`} onChange={(event) => change({ gamma: Number(event.target.value) })} />
      </div>
      <div className="parameter bandwidth-settings">
        <div className="parameter-label">
          <div><label htmlFor={id("bandwidth")}>Bandwidth <span>h</span></label><Help label="bandwidth">Constant uses the same width for both KDEs. Scott uses s n⁻¹⁄⁵; Silverman uses 0.9 min(s, IQR/1.34) n⁻¹⁄⁵, separately for each good/bad group and coordinate. In multiple dimensions these are coordinate-wise 1D rules; multivariate kernels retain paired observations with diagonal covariance. The displayed widths follow the good KDE. The slider follows the first coordinate; moving it sets one constant width for all coordinates. Rules use unweighted observations, excluding the prior. Automatic widths use magic clipping: the maximum is the domain width, and the minimum is domain width / min(100, 1 + observation count + prior kernel count), calculated separately for each good/bad group. A singleton or identical observations uses this minimum, as does a zero IQR under Silverman. The density axis follows the current widths. Moving Width switches to Constant and preserves observations.</Help>
          </div>
          <output htmlFor={id("bandwidth")}>{widthText}</output>
        </div>
        {bandwidthRule !== "constant" && <span className="bandwidth-mode">{bandwidthRule === "scott" ? "Scott" : "Silverman"} · good KDE · drag to set constant h</span>}
        <div className="bandwidth-controls">

          <input id={id("bandwidth")} type="range" {...bandwidthRange} max={sliderMax} value={sliderWidth} aria-valuetext={displayedWidth === undefined ? "Available after 2 observations" : `${displayedWidth.toFixed(2)}${bandwidthRule === "constant" ? "" : ", good KDE"}`} onChange={(event) => change({ bandwidth: Number(event.target.value), bandwidthRule: "constant" })} />
        </div>
      </div>
    </section></div>
  );
}
