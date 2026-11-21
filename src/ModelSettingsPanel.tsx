import type { ReactNode } from "react";
import { ResponsiveSettings } from "./ResponsiveSettings";
import { bandwidthRules, type BandwidthRule } from "./model/bandwidth";
import type { WeightStrategy } from "./model/types";
import { Help } from "./Help";
import { HelpMath } from "./HelpMath";
import { ShareSearchLink } from "./ShareSearchLink";
import type { ShareExperiment } from "./shareSearch";
import { applyOptunaPreset, bandwidthRange, candidateCounts, gammaRange, matchesOptunaPreset, priorWeights, startupTrialCounts, weightOptions, type ModelSettings } from "./searchSettings";

const bandwidthRuleMath = String.raw`\begin{aligned}\text{Constant}&:\ h\\\text{Scott}&:\ s\,n^{-1/5}\\\text{Optuna}&:\ \max(x_i-x_{i-1},\,x_{i+1}-x_i)\end{aligned}`;

const weightMath: Record<WeightStrategy, string> = {
  uniform: String.raw`w_i=1`,
  recency: String.raw`w_i\propto r_i`,
  optuna: String.raw`w_i=\begin{cases}\dfrac1n+\dfrac{r_i-1}{m-1}\Bigl(1-\dfrac1n\Bigr), & r_i<m\\[8pt]1, & r_i\ge m\end{cases}`,
  ei: String.raw`w_i\propto\max(0,\,y^*-y_i)`,
};

const bandwidthLabels: Record<BandwidthRule, string> = {
  constant: "Constant",
  scott: "Scott",
  optuna: "Optuna",
};

interface Props {
  children?: ReactNode;
  disableEi?: boolean;
  status?: ReactNode;
  experiment: ShareExperiment;
  settings: ModelSettings;
  defaultSettings: ModelSettings;
  onChange: (settings: ModelSettings) => void;
  seed: number;
  onNewSeed: () => void;
  trialLimit: number;
  widths: readonly { label: string; values: readonly number[] }[];
  domainWidth: number;
  idSuffix?: string;
  labelPrefix?: string;
  className?: string;
  guide?: { id: "gamma" | "bandwidth"; describedBy: string };
}

export function ModelSettingsPanel({ children, status, experiment, settings, defaultSettings, onChange, seed, onNewSeed, trialLimit, widths, domainWidth, idSuffix = "", labelPrefix = "", className = "", guide, disableEi = false }: Props) {
  const { gamma, bandwidth, priorWeight, startupTrials, candidates, weights } = settings;
  const bandwidthRule = settings.bandwidthRule ?? "constant";
  const id = (name: string) => `${name}${idSuffix}`;
  const change = (patch: Partial<ModelSettings>) => onChange({ ...settings, ...patch });
  const isDefault = (Object.keys(defaultSettings) as (keyof ModelSettings)[]).every((key) => {
    if (key === "bandwidthRule") return bandwidthRule === (defaultSettings.bandwidthRule ?? "constant");
    if (key === "infeasibleFilling") return (settings.infeasibleFilling ?? true) === defaultSettings.infeasibleFilling;
    return settings[key] === defaultSettings[key];
  });
  const weightOption = weightOptions.find((option) => option.value === weights)!;
  const widthSummaries = bandwidthRule === "constant" ? [] : widths.filter(({ values }) => values.length > 0).map(({ label, values }) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = (sorted.length - 1) / 2;
    const median = (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    return { label, median, text: min === max ? min.toFixed(2) : `${min.toFixed(2)}–${max.toFixed(2)}` };
  });
  const sliderWidth = widthSummaries[0]?.median ?? bandwidth;
  const widthText = bandwidthRule === "constant" ? bandwidth.toFixed(2) : widthSummaries.map(({ label, text }) =>
    experiment.page === "play-3d" ? `${label} ${text}` : text,
  ).join(" · ") || "—";
  const widthDescription = bandwidthRule === "constant" ? widthText : widthSummaries.length
    ? `${widthText}, good KDE` : "Available when Good has observations";
  return (
    <div className="model-controls">
    <ResponsiveSettings footer={<>
      <button type="button" className="settings-reset" disabled={isDefault} onClick={() => onChange(defaultSettings)} aria-label="Reset model defaults"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" /><path d="M3 3v5h5" /></svg>Reset</button>
      <span className="settings-preset-action">
        <button type="button" disabled={matchesOptunaPreset(settings)} onClick={() => onChange(applyOptunaPreset(settings))}>Optuna preset</button>
        <Help label="Optuna preset">Uses Optuna 5.1’s split, kernel widths and weights for completed trials in single-objective continuous searches. With the same seed and history and unchanged preset settings, proposals match TPESampler(seed). Optuna defaults to multivariate TPE. This button keeps the current density mode.</Help>
      </span>
      <ShareSearchLink experiment={experiment} seed={seed} settings={settings} />
    </>}><div className="settings-form">
      <fieldset className="settings-fields"><legend>Experiment</legend>
        {children}
        <div className="parameter seed-settings">
          <div className="parameter-label"><span>Seed</span>
            <output aria-label={`${labelPrefix}Search seed`}>{seed}</output>
          </div>
          <button type="button" className="resample" title="Restart the search with a random seed from 0 to 99" onClick={onNewSeed}>↻ New seed</button>
        </div>
      </fieldset>
      <fieldset className="settings-fields"><legend>Model</legend>
            <div className="parameter">
              <div className="parameter-label">
                <div><label htmlFor={id("bandwidth-rule")}>Bandwidth rule</label><Help label="bandwidth rule">Kernel width h for each group and coordinate:<HelpMath tex={bandwidthRuleMath} />n is the group size and s its standard deviation. Optuna takes the larger gap to the neighboring observations. Automatic widths are clipped to a positive range and narrow as observations accumulate.</Help>
                </div>
              </div>
              <select className="bandwidth-rule-select" id={id("bandwidth-rule")} aria-label={`${labelPrefix}Bandwidth rule`} value={bandwidthRule} onChange={(event) => change({ bandwidthRule: event.target.value as BandwidthRule })}>{bandwidthRules.map((rule) => <option key={rule} value={rule}>{bandwidthLabels[rule]}</option>)}</select>
            </div>
            <div className="parameter primary-weights">
              <div className="parameter-label">
                <div><label htmlFor={id("weights")}>Weights</label><Help label="observation weights"><strong>{weightOption.label}</strong><HelpMath tex={weightMath[weights]} />{weightOption.description}{disableEi && <><br />EI weights need an objective threshold, which is undefined for a constrained split.</>}</Help>
                </div>
              </div>
              <select id={id("weights")} value={weights} onChange={(event) => change({ weights: event.target.value as WeightStrategy })}>{weightOptions.map((option) => <option key={option.value} value={option.value} disabled={disableEi && option.value === "ei"}>{option.label}</option>)}</select>
            </div>
            <div className="parameter">
              <div className="parameter-label">
                <div><label htmlFor={id("prior-weight")}>Prior weight</label><Help label="Gaussian prior"><HelpMath tex={String.raw`\ell(x)\propto\sum_{i\in\mathrm{Good}}w_i\,k_i(x)+\alpha\,p_0(x)`} />Adds one broad Gaussian p₀ (mean 0, σ = 10) to each KDE so unexplored regions keep some density. Weight α = 1 counts as one observation; 0 turns it off.{experiment.page === "play-3d" && experiment.constraint !== "none" && " The prior can be the only Good kernel."}</Help>
                </div>
              </div>
              <select id={id("prior-weight")} value={priorWeight} onChange={(event) => change({ priorWeight: Number(event.target.value) })}>{priorWeights.map((weight) => <option key={weight} value={weight}>{weight === 0 ? "0 · Off" : weight}</option>)}</select>
            </div>
      </fieldset>
      <fieldset className="settings-fields"><legend>Search</legend>
            <div className="parameter">
              <div className="parameter-label">
                <div><label htmlFor={id("startup-trials")}>Startup trials</label><Help label="startup trials">Number of uniform random trials before TPE starts proposing.</Help>
                </div>
              </div>
              <select id={id("startup-trials")} value={startupTrials} onChange={(event) => change({ startupTrials: Number(event.target.value) })}>{startupTrialCounts(trialLimit).map((count) => <option key={count} value={count}>{count === trialLimit ? `${trialLimit} · Random only` : count}</option>)}</select>
            </div>
            <div className="parameter">
              <div className="parameter-label">
                <div><label htmlFor={id("candidates")}>Candidates</label><Help label="candidate count"><HelpMath tex={String.raw`x_{\mathrm{next}}=\underset{z_1,\ldots,z_M\sim\ell}{\arg\max}\ \frac{\ell(z_j)}{g(z_j)}`} />{experiment.page === "play-3d" && experiment.mode === "univariate"
                  ? "Draws this many candidates per coordinate from ℓ and picks the highest ℓ/g for each."
                  : "Draws this many candidates from ℓ per trial and picks the highest ℓ/g."} More candidates exploit more, without extra evaluations.</Help>
                </div>
              </div>
              <select id={id("candidates")} value={candidates} onChange={(event) => change({ candidates: Number(event.target.value) })}>{candidateCounts.map((count) => <option key={count} value={count}>{count}</option>)}</select>
            </div>
      </fieldset>
    </div></ResponsiveSettings>
    {status != null && <div className="model-status" aria-live="polite">{status}</div>}
    <section className={`config live-model-controls ${className}`} aria-label={`${labelPrefix}Interactive model controls`}>
      <div className="parameter">
        <div className="parameter-label">
          <div><label htmlFor={id("gamma")}>Good fraction <span>γ</span></label><Help label="good fraction">{experiment.page === "play-3d" && experiment.constraint !== "none"
            ? "Sets the target size of Good. Feasible trials rank first by objective. Infeasible filling uses the least-violating trials to fill empty slots."
            : <><HelpMath tex={String.raw`|\mathrm{Good}|=\min(\lceil\gamma n\rceil,\,n-1)`} />Good targets {Math.round(gamma * 100)}% of observations, rounded up, and leaves at least one trial in Bad. Lower γ focuses Good on fewer, better points.</>}</Help>
          </div>
          <output htmlFor={id("gamma")}>{Math.round(gamma * 100)}%</output>
        </div>
        <input id={id("gamma")} data-guide-target={guide?.id === "gamma" || undefined} aria-describedby={guide?.id === "gamma" ? guide.describedBy : undefined} type="range" {...gammaRange} value={gamma} aria-valuetext={`${Math.round(gamma * 100)} percent`} onChange={(event) => change({ gamma: Number(event.target.value) })} />
      </div>
      <div className="parameter bandwidth-settings">
        <div className="parameter-label">
          <div><label htmlFor={id("bandwidth")}>Bandwidth <span>h</span></label><Help label="bandwidth"><HelpMath tex={String.raw`k_i(x)=\mathcal N_{\mathrm{box}}(x\mid x_i,\,h^2)`} />Width of each Gaussian kernel. Wider kernels smooth the densities and explore more broadly; narrower ones stay close to past observations. Dragging sets a constant width.</Help>
          </div>
          <output htmlFor={id("bandwidth")}>{widthText}</output>
        </div>
        {bandwidthRule !== "constant" && <span className="bandwidth-mode">{bandwidthLabels[bandwidthRule]} rule · Good KDE</span>}
        <div className="bandwidth-controls">

          <input id={id("bandwidth")} data-guide-target={guide?.id === "bandwidth" || undefined} aria-describedby={guide?.id === "bandwidth" ? guide.describedBy : undefined} type="range" {...bandwidthRange} max={domainWidth} value={sliderWidth} aria-valuetext={widthDescription} onChange={(event) => change({ bandwidth: Number(event.target.value), bandwidthRule: "constant" })} />
        </div>
      </div>
    </section></div>
  );
}
