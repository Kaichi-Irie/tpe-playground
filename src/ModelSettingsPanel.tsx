import type { ReactNode } from "react";
import { bandwidthRules, type BandwidthRule } from "./model/tpe/bandwidth";
import type { WeightStrategy } from "./model/tpe/types";
import { Help } from "./Help";
import { HelpMath } from "./HelpMath";
import { SamplerSettingsShell } from "./SamplerSettingsShell";
import type { ShareExperiment } from "./shareSearch";
import { applyOptunaPreset, bandwidthRange, candidateCounts, gammaRange, matchesOptunaPreset, priorWeights, startupTrialCounts, weightOptions, type ModelSettings } from "./searchSettings";

const bandwidthRuleMath = String.raw`\begin{array}{ll}\text{Constant}&h\\[2pt]\text{Scott}&s\,n^{-1/5}\\[2pt]\text{Optuna}&\max(x_i-x_{i-1},\,x_{i+1}-x_i)\end{array}`;

const weightMath = String.raw`\begin{array}{ll}\text{Uniform}&w_i=1\\[2pt]\text{Recency}&w_i\propto r_i\\[2pt]\text{Optuna}&w_i=\min\!\Bigl(1,\ \dfrac1n+\dfrac{r_i-1}{m-1}\Bigl(1-\dfrac1n\Bigr)\Bigr)\\[8pt]\text{EI}&w_i\propto\max(0,\,y^*-y_i)\end{array}`;

const priorMath = String.raw`\begin{aligned}\ell(x)&\propto\textstyle\sum_{i\in\mathrm{Good}}w_i\,k_i(x)+\alpha\,p_0(x)\\g(x)&\propto\textstyle\sum_{i\in\mathrm{Bad}}w_i\,k_i(x)+\alpha\,p_0(x)\end{aligned}`;

const m = (tex: string) => <HelpMath inline tex={tex} />;

const bandwidthLabels: Record<BandwidthRule, string> = {
  constant: "Constant",
  scott: "Scott",
  optuna: "Optuna",
};

interface Props {
  children?: ReactNode;
  disableEi?: boolean;
  status?: ReactNode;
  experiment: Exclude<ShareExperiment, { sampler: "cmaes" }>;
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

export function ModelSettingsPanel({ children, status, experiment, defaultSettings, onChange, seed, onNewSeed, trialLimit, widths, domainWidth, idSuffix = "", labelPrefix = "", className = "", guide, disableEi = false }: Props) {
  const { settings } = experiment;
  const { gamma, bandwidth, priorWeight, startupTrials, candidates, weights } = settings;
  const bandwidthRule = settings.bandwidthRule ?? "constant";
  const id = (name: string) => `${name}${idSuffix}`;
  const change = (patch: Partial<ModelSettings>) => onChange({ ...settings, ...patch });
  const isDefault = (Object.keys(defaultSettings) as (keyof ModelSettings)[]).every((key) => {
    if (key === "bandwidthRule") return bandwidthRule === (defaultSettings.bandwidthRule ?? "constant");
    if (key === "infeasibleFilling") return (settings.infeasibleFilling ?? true) === defaultSettings.infeasibleFilling;
    return settings[key] === defaultSettings[key];
  });
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
    <SamplerSettingsShell
      experiment={experiment}
      seed={seed}
      seedLabel={`${labelPrefix}Search seed`}
      onNewSeed={onNewSeed}
      isDefault={isDefault}
      onReset={() => onChange(defaultSettings)}
      isOptunaPreset={matchesOptunaPreset(settings)}
      onOptunaPreset={() => onChange(applyOptunaPreset(settings))}
      optunaPresetHelp="Uses Optuna 5.1’s split, kernel widths and weights for completed trials in single-objective continuous searches. With the same seed and history and unchanged preset settings, proposals match TPESampler(seed). Optuna defaults to multivariate TPE. This button keeps the current density mode."
      experimentFields={children}
      modelFields={<>
        <fieldset className="settings-fields"><legend>Model</legend>
          <div className="parameter">
            <div className="parameter-label">
              <div><label htmlFor={id("bandwidth-rule")}>Bandwidth rule</label><Help label="bandwidth rule">Kernel width {m("h")} for each group and coordinate:<HelpMath tex={bandwidthRuleMath} />{m("n")} is the group size and {m("s")} its standard deviation. Optuna takes the larger gap to the neighboring observations. Automatic widths are clipped to a positive range and narrow as observations accumulate.</Help>
              </div>
            </div>
            <select className="bandwidth-rule-select" id={id("bandwidth-rule")} aria-label={`${labelPrefix}Bandwidth rule`} value={bandwidthRule} onChange={(event) => change({ bandwidthRule: event.target.value as BandwidthRule })}>{bandwidthRules.map((rule) => <option key={rule} value={rule}>{bandwidthLabels[rule]}</option>)}</select>
          </div>
          <div className="parameter primary-weights">
            <div className="parameter-label">
              <div><label htmlFor={id("weights")}>Weights</label><Help label="observation weights">Weight {m("w_i")} of each observation kernel within its group:<HelpMath tex={weightMath} />{m("r_i")} is the trial-order rank in the group (newest is {m("n")}), {m("m=n-25")} and {m("y^*")} the split threshold. EI applies to Good; Bad counts equally.{disableEi && <><br />EI weights need an objective threshold, which is undefined for a constrained split.</>}</Help>
              </div>
            </div>
            <select id={id("weights")} value={weights} onChange={(event) => change({ weights: event.target.value as WeightStrategy })}>{weightOptions.map((option) => <option key={option.value} value={option.value} disabled={disableEi && option.value === "ei"}>{option.label}</option>)}</select>
          </div>
          <div className="parameter">
            <div className="parameter-label">
              <div><label htmlFor={id("prior-weight")}>Prior weight</label><Help label="Gaussian prior">Mixes one broad Gaussian {m("p_0")} ({m(String.raw`\mu=0,\ \sigma=10`)}) into both KDEs so unexplored regions keep some density. Its weight {m(String.raw`\alpha`)} is on the same scale as an observation weight {m("w_i")}, so {m(String.raw`\alpha=1`)} counts like one more observation and 0 turns it off.{experiment.page === "play-3d" && experiment.constraint !== "none" && " The prior can be the only Good kernel."}<HelpMath tex={priorMath} /></Help>
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
              <div><label htmlFor={id("candidates")}>Candidates</label><Help label="candidate count">{experiment.page === "play-3d" && experiment.mode === "univariate"
                ? "Draws this many candidates per coordinate from ℓ and picks the highest ℓ/g for each."
                : "Draws this many candidates from ℓ per trial and picks the highest ℓ/g."} More candidates exploit more, without extra evaluations.</Help>
              </div>
            </div>
            <select id={id("candidates")} value={candidates} onChange={(event) => change({ candidates: Number(event.target.value) })}>{candidateCounts.map((count) => <option key={count} value={count}>{count}</option>)}</select>
          </div>
        </fieldset>
      </>}
      status={status}
      liveControlsLabel={`${labelPrefix}Interactive model controls`}
      liveControlsClassName={className}
      liveControls={<>
        <div className="parameter">
          <div className="parameter-label">
            <div><label htmlFor={id("gamma")}>Good fraction <span>γ</span></label><Help label="good fraction">{experiment.page === "play-3d" && experiment.constraint !== "none"
              ? "Sets the target size of Good. Feasible trials rank first by objective. Infeasible filling uses the least-violating trials to fill empty slots."
              : <>Good targets {Math.round(gamma * 100)}% of observations, rounded up, and leaves at least one trial in Bad. Lower γ focuses Good on fewer, better points.</>}</Help>
            </div>
            <output htmlFor={id("gamma")}>{Math.round(gamma * 100)}%</output>
          </div>
          <input id={id("gamma")} data-guide-target={guide?.id === "gamma" || undefined} aria-describedby={guide?.id === "gamma" ? guide.describedBy : undefined} type="range" {...gammaRange} value={gamma} aria-valuetext={`${Math.round(gamma * 100)} percent`} onChange={(event) => change({ gamma: Number(event.target.value) })} />
        </div>
        <div className="parameter bandwidth-settings">
          <div className="parameter-label">
            <div><label htmlFor={id("bandwidth")}>Bandwidth <span>h</span></label><Help label="bandwidth">Width of each Gaussian kernel. Wider kernels smooth the densities and explore more broadly; narrower ones stay close to past observations. Dragging sets a constant width.</Help>
            </div>
            <output htmlFor={id("bandwidth")}>{widthText}</output>
          </div>
          {bandwidthRule !== "constant" && <span className="bandwidth-mode">{bandwidthLabels[bandwidthRule]} rule · Good KDE</span>}
          <div className="bandwidth-controls">
            <input id={id("bandwidth")} data-guide-target={guide?.id === "bandwidth" || undefined} aria-describedby={guide?.id === "bandwidth" ? guide.describedBy : undefined} type="range" {...bandwidthRange} max={domainWidth} value={sliderWidth} aria-valuetext={widthDescription} onChange={(event) => change({ bandwidth: Number(event.target.value), bandwidthRule: "constant" })} />
          </div>
        </div>
      </>}
    />
  );
}
