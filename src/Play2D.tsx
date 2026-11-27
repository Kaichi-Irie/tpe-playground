import { usePlotSize } from "./usePlotSize";
import { PlaybackControls } from "./PlaybackControls";
import { PlotLegend, type PlotLayerItem } from "./PlotLegend";
import { defaultPlaybackSpeed, type PlaybackSpeed } from "./playbackSpeed";
import LabHintBubble from "./LabHintBubble";
import { playGuides } from "./playGuides";
import { usePlayGuide } from "./usePlayGuide";
import { ModelSettingsPanel } from "./ModelSettingsPanel";
import { readSharedSearch, type SharedSearch } from "./shareSearch";
import { useLayoutEffect, useMemo, useState } from "react";
import { trialLimit, buildOneParamView, prior, searchDefaults, defaults, domain, proposeTrial, oneParamProposalFromTrace, type Trial } from "./oneParamTpe";

import { getObjective, objectivePresets, type ObjectivePreset } from "./objectives";

import { Help } from "./Help";
import { HelpMath } from "./HelpMath";
import { ProgressComparison } from "./ProgressComparison";

import { emptyPlayback, keepObservations, movePlayback } from "./playback";
import { logTruncatedNormalPeak } from "./model/tpe/truncnorm";

const grid = Array.from({ length: 501 }, (_, i) => domain[0] + i / 50);
const domainWidth = domain[1] - domain[0];
const defaultSearch: SharedSearch<ObjectivePreset> = {
  seed: 42,
  preset: "multimodal",
  settings: { ...defaults, priorWeight: prior.weight, ...searchDefaults },
};

type Play2DProps = {
  active: boolean;
  hidden: boolean;
  sharedSettings: URLSearchParams | null;
  visit: number;
  navigation: number;
};

const layers = [
  { key: "objective", label: "Objective f(x)", short: "f(x)" },
  { key: "good", label: "Good KDE ℓ(x)", short: "Good" },
  { key: "bad", label: "Bad KDE g(x)", short: "Bad" },
  { key: "observations", label: "Observations", short: "Points" },
  { key: "acquisition", label: "Acquisition", short: "Acquisition" },
] as const satisfies readonly PlotLayerItem[];

export default function Play2D({ active, hidden, sharedSettings, visit, navigation }: Play2DProps) {
  const { ref: chartRef, width, height, typeScale } = usePlotSize();
  const W = Math.max(240, width), H = Math.max(96 * typeScale, height);
  const compactChart = W < 600;
  // Short plots keep their full-size labels with a tighter bottom gutter and fewer y-axis labels.
  const shortChart = H < 160 * typeScale;
  const yTickLabels = shortChart ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  const box = {
    left: 28 * typeScale,
    right: W - (compactChart ? 12 : 92) * typeScale,
    top: 32 * typeScale,
    bottom: H - (shortChart ? 36 : 48) * typeScale,
  };
  const acquisitionX = W - 38 * typeScale;
  const sx = (x: number) => box.left + (x + 5) / 10 * (box.right - box.left);
  const sy = (y: number) => box.bottom - y / 8 * (box.bottom - box.top);
  const path = (ys: number[], scale: (y: number) => number) => ys.map((y, i) => `${i ? "L" : "M"}${sx(grid[i]).toFixed(2)},${scale(y).toFixed(2)}`).join(" ");
  const area = (line: string) => `${line} L${box.right},${box.bottom} L${box.left},${box.bottom} Z`;
  const [search, setSearch] = useState(() => readSharedSearch(
    sharedSettings, defaultSearch, objectivePresets, trialLimit, domainWidth,
  ));
  const { seed, preset: objectivePreset, settings } = search;
  const { priorWeight, startupTrials, candidates, gamma, weights, bandwidthRule, bandwidth } = settings;
  const objectiveDefinition = getObjective(objectivePreset);
  const objectiveValues = useMemo(() => grid.map(objectiveDefinition.evaluate), [objectiveDefinition]);
  const [playback, setPlayback] = useState(emptyPlayback);
  const { step } = playback;
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(defaultPlaybackSpeed);
  const [selected, setSelected] = useState<Trial | null>(null);
  const [lastNavigation, setLastNavigation] = useState(navigation);
  // Reset before rendering the shared search while preserving plot and playback preferences.
  if (lastNavigation !== navigation) {
    setLastNavigation(navigation);
    setPlaying(false);
    if (sharedSettings) {
      setSearch(readSharedSearch(sharedSettings, defaultSearch, objectivePresets, trialLimit, domainWidth));
      setPlayback(emptyPlayback());
      setSelected(null);
    }
  }
  // Cancel the previous search's timer as soon as navigation commits.
  useLayoutEffect(() => {
    if (!active || !playing) return;
    if (step >= trialLimit) { setPlaying(false); return; }
    const timer = window.setTimeout(() => {
      setPlayback((current) => movePlayback(current, current.step + 1, seed, priorWeight, { gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset }));
      setSelected(null);
    }, 1000 / playbackSpeed);
    return () => window.clearTimeout(timer);
  }, [active, playing, playbackSpeed, step, seed, priorWeight, gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset]);
  function moveTo(next: number) {
    setPlaying(false);
    setPlayback((current) => movePlayback(current, next, seed, priorWeight, { gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset }));
    setSelected(null);
  }
  function editModel() {
    setPlaying(false);
    setPlayback(keepObservations);
  }
  const [visible, setVisible] = useState({ objective: true, good: true, bad: true, observations: true, acquisition: false });
  const guide = usePlayGuide<HTMLDivElement>({ page: "play-2d", step, startupTrials, acquisitionVisible: visible.acquisition, seeking: false }, active);
  const guideAcquisition = guide.active === "acquisition";
  const trials = useMemo(() => playback.trials.slice(0, step), [playback.trials, step]);
  const proposals = useMemo(() => playback.proposals.slice(0, step), [playback.proposals, step]);
  const model = useMemo(() => buildOneParamView(trials, grid, priorWeight, { gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset }), [trials, priorWeight, gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset]);
  const proposal = useMemo(() => step === trialLimit ? undefined : playback.proposals[step] ?? (model.fitted && step >= startupTrials ? oneParamProposalFromTrace(model.fitted.propose(seed)) : proposeTrial(trials, seed, priorWeight, { gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset })), [step, playback.proposals, model.fitted, trials, seed, priorWeight, gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset]);
  const showCandidateTicks = !compactChart && (proposal?.candidates.length ?? 0) > 0;
  const bestValue = trials.length ? Math.min(...trials.map((trial) => trial.y)).toFixed(3) : "—";
  const acquisitionLow = Math.min(0, ...model.acquisition);
  const acquisitionHigh = Math.max(1, ...model.acquisition);
  const acquisitionPadding = (acquisitionHigh - acquisitionLow) * 0.12;
  const acquisitionMin = acquisitionLow - acquisitionPadding;
  const acquisitionMax = acquisitionHigh + acquisitionPadding;
  const sa = (value: number) => box.bottom - (value - acquisitionMin) / (acquisitionMax - acquisitionMin) * (box.bottom - box.top);
  const group = model.fitted?.snapshot.groups[0];
  const goodWidths = group?.good.kernels.filter((kernel) => kernel.source.kind === "observation").map((kernel) => kernel.bandwidths.x) ?? [];
  const peak = useMemo(() => {
    if (!group) return Math.exp(logTruncatedNormalPeak(prior.mean, bandwidth, ...domain));
    return Math.max(...[...group.good.kernels, ...group.bad.kernels].map((kernel) =>
      Math.exp(logTruncatedNormalPeak(kernel.center.x, kernel.bandwidths.x, ...domain)),
    ));
  }, [group, bandwidth]);
  const densityMax = Math.ceil(peak * 10) / 10;
  const groupName = (trial: Trial) => step < 2 ? "Unclassified" : goodIds.has(trial.id) ? "Good" : "Bad";
  const sd = (d: number) => box.bottom - d / densityMax * (box.bottom - box.top);
  const goodIds = new Set(model.good.map((t) => t.id));
  const goodPath = path(model.goodDensity, sd), badPath = path(model.badDensity, sd);
  return (
    <div hidden={hidden} className="visual-workspace play-2d" ref={guide.workspaceRef} onKeyDown={guide.onKeyDown}>
      <section className="canvas-plot" aria-labelledby="plot-heading">
        <div className="canvas-controls">
          <PlaybackControls step={step} limit={trialLimit} playing={playing} speed={playbackSpeed} onSpeedChange={setPlaybackSpeed} guidePlay={guide.active === "playback"} guideDescribedBy={guide.textId} onMove={moveTo}
            onToggle={() => { if (step === trialLimit) moveTo(0); setPlaying(!playing); }} />
        </div>

        <h2 id="plot-heading" className="sr-only">Minimize the objective function</h2>
        <div className="plot-tools">
          <PlotLegend ariaLabel="Plot layers" visible={visible}
            items={layers.map((item) => item.key === "acquisition" && guideAcquisition
              ? { ...item, guideTarget: true, describedBy: guide.textId }
              : item)}
            onToggle={(key) => setVisible((current) => ({ ...current, [key]: !current[key] }))} />
        <div className="plot-guide"><Help label="how to read this plot"><strong>How to read this plot</strong>
        <span className="line-key"><span><i className="split-key" /> Horizontal gray dashes: good/bad split</span><span><i className="next-key" /> Vertical gray dashes: next evaluation</span>{showCandidateTicks && <span>Gray ticks: sampled candidates</span>}</span>
        <span className="plot-guide-description">{compactChart ? "Objective: left axis. Good and bad KDEs share one scale. Acquisition uses its own scale, higher is better. Density and acquisition tick labels are omitted to leave more space for the plot." : <>Objective: left axis · KDEs: right axis · acquisition <HelpMath inline tex={String.raw`\log\bigl(\ell(x)/g(x)\bigr)`} />: far-right axis, higher is better.</>} KDEs appear after 2 observations. {step < startupTrials ? "Acquisition is a preview during initial random exploration." : `The selected point is best among ${candidates} sampled candidate${candidates === 1 ? "" : "s"}, not necessarily the curve’s global maximum.`}</span></Help></div>
        </div>
        <div className="chart-scroll"><svg ref={chartRef} viewBox={`0 0 ${W} ${H}`} aria-labelledby="chart-title chart-description" role="img">
          <title id="chart-title">Objective function, {step} observations, good and bad KDEs, and acquisition</title><desc id="chart-description">Search parameter x from -5 to 5. {compactChart ? "Left axis: objective value. Density and acquisition tick labels are omitted in this compact view. Good and bad densities share one scale; the log density ratio uses a separate scale, higher is better." : "Left axis: objective value. Right axis: probability density. Far-right axis: log density ratio, higher is better."} Horizontal gray dashes mark the split; vertical gray dashes mark the next evaluation. Select an observation to inspect it.</desc>
          <defs><clipPath id="plot-clip"><rect x={box.left} y={box.top} width={box.right - box.left} height={box.bottom - box.top} /></clipPath></defs>
          <text x={box.left} y={20 * typeScale} className="axis-title">Minimize f(x) ↓</text><text x={box.right} y={20 * typeScale} textAnchor="end" className="axis-title">{compactChart ? (visible.acquisition ? "KDE · log ℓ/g" : "Good / Bad KDE") : "Probability density"}</text>
          {!compactChart && visible.acquisition && model.acquisition.length > 0 && <g className="acquisition-axis">
            <text x={W - 4 * typeScale} y={20 * typeScale} textAnchor="end" className="axis-title">log ℓ/g ↑</text>
            <line x1={acquisitionX} x2={acquisitionX} y1={box.top} y2={box.bottom} />
            {yTickLabels.map((fraction) => {
              const value = acquisitionMin + fraction * (acquisitionMax - acquisitionMin);
              return <text key={fraction} x={acquisitionX + 5 * typeScale} y={sa(value) + 4 * typeScale}>{value.toFixed(1)}</text>;
            })}
          </g>}
          {[0, 2, 4, 6, 8].map((y) => <g key={y}>
            <line x1={box.left} x2={box.right} y1={sy(y)} y2={sy(y)} className="grid" />
            {yTickLabels.includes(y / 8) && <>
              <text x={box.left - 14 * typeScale} y={sy(y) + 4 * typeScale} textAnchor="end">{y}</text>
              {!compactChart && <text x={box.right + 14 * typeScale} y={sy(y) + 4 * typeScale}>{(densityMax * y / 8).toFixed(2)}</text>}
            </>}
          </g>)}
          {(compactChart ? [-5, 0, 5] : [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]).map((x) => <g key={x}><line x1={sx(x)} x2={sx(x)} y1={box.top} y2={box.bottom} className="grid vertical" /><text x={sx(x)} y={box.bottom + (shortChart ? 10 : 22) * typeScale} textAnchor="middle">{x}</text></g>)}
          <g clipPath="url(#plot-clip)">
            {visible.bad && model.bad.length > 0 && <><path d={area(badPath)} className="bad-area" /><path d={badPath} className="bad-line" /></>}
            {visible.good && model.good.length > 0 && <><path d={area(goodPath)} className="good-area" /><path d={goodPath} className="good-line" /></>}
            {visible.acquisition && model.acquisition.length > 0 && <path d={path(model.acquisition, sa)} className="acquisition-line" />}
            {model.threshold !== null && <line x1={box.left} x2={box.right} y1={sy(model.threshold)} y2={sy(model.threshold)} className="threshold" />}
            {visible.objective && <path d={path(objectiveValues, sy)} className="objective-line" />}
            {proposal && <g aria-label="Proposed point and candidate positions">
              {showCandidateTicks && proposal.candidates.map((candidate, i) => <line key={i} x1={sx(candidate.x)} x2={sx(candidate.x)} y1={box.bottom - 12} y2={box.bottom} className="candidate-tick"><title>Candidate {i + 1}: x = {candidate.x.toFixed(3)}, log ℓ/g = {candidate.logRatio.toFixed(3)}</title></line>)}
              <line x1={sx(proposal.x)} x2={sx(proposal.x)} y1={box.top} y2={box.bottom} className="proposal-line"><title>Next x = {proposal.x.toFixed(3)}</title></line>
            </g>}
            {visible.observations && model.trials.map((trial) => <circle key={trial.id} cx={sx(trial.x)} cy={sy(trial.y)} r={selected?.id === trial.id ? 7 : 4.5} className={`point ${step < 2 ? "unclassified-point" : goodIds.has(trial.id) ? "good-point" : "bad-point"}`} tabIndex={0} role="button" aria-label={`Trial ${trial.id}, x ${trial.x.toFixed(3)}, objective ${trial.y.toFixed(3)}, ${groupName(trial)}`} onMouseEnter={() => setSelected(trial)} onFocus={() => setSelected(trial)} onClick={() => setSelected(trial)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(trial); } }}><title>Trial {trial.id}: x = {trial.x.toFixed(3)}, f(x) = {trial.y.toFixed(3)}</title></circle>)}
          </g>
          <text x={(box.left + box.right) / 2} y={H - 6 * typeScale} textAnchor="middle" className="axis-title">Search parameter · x</text>
        </svg></div>

        <div className="plot-inspection" data-selected={selected !== null} aria-live="polite">{selected ? `Trial ${selected.id} · x = ${selected.x.toFixed(3)} · f(x) = ${selected.y.toFixed(3)} · ${groupName(selected)}` : null}</div>
        {guide.active && <LabHintBubble textId={guide.textId} message={playGuides[guide.active].action} phase="action" placement="bottom" onDismiss={guide.dismiss} />}
      </section>
      <ModelSettingsPanel key={active ? visit : "hidden"}
        experiment={{ page: "play-2d", preset: objectivePreset, settings }}
        defaultSettings={defaultSearch.settings} guide={guide.settingsGuide}
        onChange={(next) => {
          if (next.gamma !== gamma) guide.retire("gamma");
          if (next.bandwidth !== bandwidth) guide.retire("bandwidth");
          setSearch({ ...search, settings: { ...next, bandwidthRule: next.bandwidthRule ?? "constant" } });
          editModel();
        }}
        seed={seed} onNewSeed={() => { setSearch({ ...search, seed: Math.floor(Math.random() * 100) }); setPlayback(emptyPlayback()); setPlaying(false); setSelected(null); }}
        trialLimit={trialLimit} widths={[{ label: "x", values: goodWidths }]} domainWidth={domainWidth}
        status={<>
          <div className="proposal">
            <h3>{!proposal ? "Search complete" : proposal.method === "random" ? `Random start · ${step + 1} / ${startupTrials}` : `TPE · trial ${step + 1}`}</h3>
            <Help label="trial selection">
              {!proposal ? `Search complete. All ${trialLimit} trials evaluated. Replay reruns the search from trial 0 with the current settings.` : proposal.method === "random"
                ? `Initial random exploration · ${step + 1} / ${startupTrials}. ${startupTrials === trialLimit ? "Every trial in this search is random." : `Uniform random draw until TPE starts at trial ${startupTrials + 1}.`}`
                : `TPE proposal · trial ${step + 1}. Drew ${candidates} candidate${candidates === 1 ? "" : "s"} from ℓ(x) and picked the largest ℓ(x)/g(x). ${showCandidateTicks ? "Gray ticks show candidates. " : ""}The dashed line marks the pick.`}
            </Help>
            {proposal && <p><strong>Next x = {proposal.x.toFixed(3)}</strong>{proposal.method === "tpe" && ` · log ℓ/g = ${Math.max(...proposal.candidates.map((candidate) => candidate.logRatio)).toFixed(3)}`}</p>}
          </div>
          <div className="stats"><span className="good-text"><strong>{model.good.length}</strong> good</span><span className="bad-text"><strong>{model.bad.length}</strong> bad</span></div>
        </>}>
      <section className="search-toolbar" aria-label="Search controls">
        <div className="plot-header">
          <div className="objective-picker parameter">
            <div className="parameter-label"><label htmlFor="objective-preset">Objective</label><Help label={`${objectiveDefinition.label} preset`}><strong>{objectiveDefinition.label}</strong><br />{objectiveDefinition.description}<HelpMath tex={objectiveDefinition.formula} />The constant <HelpMath inline tex="c" /> shifts the minimum to 1. Changing it restarts the search.</Help></div>
            <select id="objective-preset" value={objectivePreset} onChange={(event) => { setSearch({ ...search, preset: event.target.value as ObjectivePreset }); setPlayback(emptyPlayback()); setPlaying(false); setSelected(null); }}>{(Object.keys(objectivePresets) as ObjectivePreset[]).map((preset) => <option key={preset} value={preset}>{objectivePresets[preset].label}</option>)}</select>
          </div>
        </div>

      </section>
      </ModelSettingsPanel>
      <details className="performance-monitor">
        <summary><span className="performance-caption">Best f(x) <strong title={bestValue}>{bestValue}</strong></span><span>Performance <span aria-hidden="true">⌄</span></span></summary>
        <ProgressComparison trials={trials} proposals={proposals} randomOnly={startupTrials >= trialLimit} seed={seed} objectivePreset={objectivePreset} />
      </details>
    </div>
  );
}
