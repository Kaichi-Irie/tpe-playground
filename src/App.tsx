import { TopBar } from "./TopBar";
import { usePlotSize } from "./usePlotSize";
import { PlaybackControls } from "./PlaybackControls";
import LabHintBubble from "./LabHintBubble";
import { playGuides } from "./playGuides";
import { usePlayGuide } from "./usePlayGuide";
import { ModelSettingsPanel } from "./ModelSettingsPanel";
import { weightOptions } from "./searchSettings";
import { playPageHrefs, readRoute, readSharedSearch, type Route, type SharedSearch } from "./shareSearch";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { trialLimit, buildOneParamView, prior, searchDefaults, defaults, domain, proposeTrial, oneParamProposalFromTrace, type Trial } from "./oneParamTpe";

import { getObjective, objectivePresets, type ObjectivePreset } from "./objectives";

import { Help } from "./Help";
import { ProgressComparison } from "./ProgressComparison";

import { emptyPlayback, keepObservations, movePlayback } from "./playback";

const StepExplanation = lazy(() => import("./StepExplanation"));

const Play3D = lazy(() => import("./Play3D"));

const grid = Array.from({ length: 501 }, (_, i) => domain[0] + i / 50);

function initialTheme(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const saved = localStorage.getItem("tpe-theme");
    if (saved === "dark" || saved === "light") return saved === "dark";
  } catch { /* System preference remains available when storage is blocked. */ }
  return window.matchMedia ? !window.matchMedia("(prefers-color-scheme: light)").matches : true;
}

const domainWidth = domain[1] - domain[0];
const defaultSearch: SharedSearch<ObjectivePreset> = {
  seed: 50,
  preset: "multimodal",
  settings: { ...defaults, priorWeight: prior.weight, ...searchDefaults },
};

export default function App({ initialRoute = { page: "play-2d", share: null } }: { initialRoute?: Route } = {}) {
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
  const [route, setRoute] = useState(() => ({ ...initialRoute, visit: 0 }));
  const { page } = route;
  const [search, setSearch] = useState(() => readSharedSearch(
    route.page === "play-2d" ? route.share : null, defaultSearch, objectivePresets, trialLimit, domainWidth,
  ));
  const { seed, preset: objectivePreset, settings } = search;
  const { priorWeight, startupTrials, candidates, gamma, weights, bandwidthRule, bandwidth } = settings;
  const objectiveDefinition = getObjective(objectivePreset);
  const objectiveValues = useMemo(() => grid.map(objectiveDefinition.evaluate), [objectiveDefinition]);
  const [playback, setPlayback] = useState(emptyPlayback);
  const { step } = playback;
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<Trial | null>(null);
  const searchGeneration = useRef(0);
  // Keep the Lab mounted after the first visit so its stage, progress, and settings survive tab switches.
  const [labVisited, setLabVisited] = useState(page === "lab");
  useEffect(() => { if (page === "lab") setLabVisited(true); }, [page]);
  const [algorithmContainer, setAlgorithmContainer] = useState<HTMLDivElement | null>(null);
  const syncRoute = useCallback(() => {
    const next = readRoute(window.location.hash);
    setPlaying(false);
    if (next.share && next.page === "play-2d") {
      searchGeneration.current += 1;
      setSearch(readSharedSearch(next.share, defaultSearch, objectivePresets, trialLimit, domainWidth));
      setPlayback(emptyPlayback());
      setSelected(null);
    }
    setRoute((current) =>
      current.page === next.page && !next.share
        ? current
        : { ...next, visit: current.visit + 1 },
    );
  }, []);
  useEffect(() => {
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, [syncRoute]);
  function openPlay2D(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const { pathname, search, hash } = window.location;
    if (event.currentTarget.pathname !== pathname) return;
    event.preventDefault();
    if (!hash) return;
    window.history.pushState(null, "", `${pathname}${search}`);
    syncRoute();
  }
  const [dark, setDark] = useState(initialTheme);
  const weightOption = weightOptions.find((option) => option.value === weights)!;
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#21252b" : "#f2f3f5");
  }, [dark]);
  useEffect(() => {
    if (!playing) return;
    if (step >= trialLimit) { setPlaying(false); return; }
    const generation = searchGeneration.current;
    const timer = window.setTimeout(() => {
      if (generation !== searchGeneration.current) return;
      setPlayback((current) => movePlayback(current, current.step + 1, seed, priorWeight, { gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset }));
      setSelected(null);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [playing, step, seed, priorWeight, gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset]);
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
  const guide = usePlayGuide<HTMLDivElement>({ page: "play-2d", step, startupTrials, acquisitionVisible: visible.acquisition, seeking: false }, page === "play-2d");
  const guideAcquisition = guide.active === "acquisition";
  const trials = useMemo(() => playback.trials.slice(0, step), [playback.trials, step]);
  const model = useMemo(() => buildOneParamView(trials, grid, priorWeight, { gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset }), [trials, priorWeight, gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset]);
  const proposal = useMemo(() => step === trialLimit ? undefined : playback.proposals[step] ?? (model.fitted && step >= startupTrials ? oneParamProposalFromTrace(model.fitted.propose(seed)) : proposeTrial(trials, seed, priorWeight, { gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset })), [step, playback.proposals, model.fitted, trials, seed, priorWeight, gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset]);
  const bestValue = trials.length ? Math.min(...trials.map((trial) => trial.y)).toFixed(3) : "—";
  const acquisitionLow = Math.min(0, ...model.acquisition);
  const acquisitionHigh = Math.max(1, ...model.acquisition);
  const acquisitionPadding = (acquisitionHigh - acquisitionLow) * 0.12;
  const acquisitionMin = acquisitionLow - acquisitionPadding;
  const acquisitionMax = acquisitionHigh + acquisitionPadding;
  const sa = (value: number) => box.bottom - (value - acquisitionMin) / (acquisitionMax - acquisitionMin) * (box.bottom - box.top);
  const group = model.fitted?.snapshot.groups[0];
  const goodWidth = group?.good.kernels.find((kernel) => kernel.source.kind === "observation")?.bandwidths.x;
  const badWidth = group?.bad.kernels.find((kernel) => kernel.source.kind === "observation")?.bandwidths.x;
  // Constant keeps its fixed axis; automatic rules rescale to the current kernels.
  const minimumWidth = Math.min(goodWidth ?? bandwidth, badWidth ?? bandwidth, ...(priorWeight > 0 ? [prior.bandwidth] : []));
  const densityMax = Math.ceil(1 / (minimumWidth * Math.sqrt(2 * Math.PI)) * 10) / 10;
  const groupName = (trial: Trial) => step < 2 ? "Unclassified" : goodIds.has(trial.id) ? "Good" : "Bad";
  const sd = (d: number) => box.bottom - d / densityMax * (box.bottom - box.top);
  const goodIds = new Set(model.good.map((t) => t.id));
  const goodPath = path(model.goodDensity, sd), badPath = path(model.badDensity, sd);
  return (
    <main className={`page-${page}`}>
      <TopBar page={page} dark={dark} onPlay2D={openPlay2D} onThemeChange={() => {
        const next = !dark;
        setDark(next);
        try { localStorage.setItem("tpe-theme", next ? "dark" : "light"); } catch { /* Theme still works without storage. */ }
      }} actionSlot={<div className="lab-header-actions" ref={setAlgorithmContainer} />} />
      {(labVisited || page === "lab") && <div hidden={page !== "lab"} className="lab-page"><Suspense fallback={<p>Loading explanation…</p>}><StepExplanation visible={page === "lab"} algorithmContainer={page === "lab" ? algorithmContainer : null} /></Suspense></div>}
      <div hidden={page === "about" || page === "lab"} className="play-page">
      {page === "play-3d" ? <Suspense fallback={<p>Loading 3D explorer…</p>}><Play3D key={route.visit} sharedSettings={route.share} /></Suspense> : null}
      <div hidden={page !== "play-2d"} className="visual-workspace play-2d" ref={guide.workspaceRef} onKeyDown={guide.onKeyDown}>
      <section className="canvas-plot" aria-labelledby="plot-heading">
      <div className="canvas-controls">
      <PlaybackControls step={step} limit={trialLimit} playing={playing} guidePlay={guide.active === "playback"} guideDescribedBy={guide.textId} onMove={moveTo}
        onToggle={() => { if (step === trialLimit) moveTo(0); setPlaying(!playing); }} />

      </div>

        <h2 id="plot-heading" className="sr-only">Minimize the objective function</h2>
        <div className="plot-tools">
        <div className="legend" aria-label="Plot layers">{([['objective', 'Objective f(x)'], ['good', 'Good KDE ℓ(x)'], ['bad', 'Bad KDE g(x)'], ['observations', 'Observations'], ['acquisition', 'Acquisition']] as const).map(([key, label]) => <button key={key} className={`layer ${key}`} aria-pressed={visible[key]} data-guide-target={key === "acquisition" && guideAcquisition || undefined} aria-describedby={key === "acquisition" && guideAcquisition ? guide.textId : undefined} onClick={() => setVisible((current) => ({ ...current, [key]: !current[key] }))}><span className="swatch" /><span className="layer-label">{label}</span><span className="layer-short" aria-hidden="true">{key === "objective" ? "f(x)" : key === "good" ? "Good" : key === "bad" ? "Bad" : key === "observations" ? "Points" : "Acquisition"}</span></button>)}</div>
        <div className="plot-guide"><Help label="how to read this plot"><strong>How to read this plot</strong>
        <span className="line-key"><span><i className="split-key" /> Horizontal gray dashes: good/bad split</span><span><i className="next-key" /> Vertical gray dashes: next evaluation</span><span>Gray ticks: sampled candidates</span></span>
        <span className="plot-guide-description">{compactChart ? "Objective: left axis. Good and bad KDEs share one scale. Acquisition uses its own scale, higher is better. Density and acquisition tick labels are omitted to leave more space for the plot." : "Objective: left axis · KDEs: right axis · acquisition log[ℓ(x)/g(x)]: far-right axis, higher is better."} KDEs appear after 2 observations. {step < startupTrials ? "Acquisition is a preview during initial random exploration." : `The selected point is best among ${candidates} sampled candidate${candidates === 1 ? "" : "s"}, not necessarily the curve’s global maximum.`}</span></Help></div>
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
              {!compactChart && proposal.candidates.map((candidate, i) => <line key={i} x1={sx(candidate.x)} x2={sx(candidate.x)} y1={box.bottom - 12} y2={box.bottom} className="candidate-tick"><title>Candidate {i + 1}: x = {candidate.x.toFixed(3)}, log ℓ/g = {candidate.logRatio.toFixed(3)}</title></line>)}
              <line x1={sx(proposal.x)} x2={sx(proposal.x)} y1={box.top} y2={box.bottom} className="proposal-line"><title>Next x = {proposal.x.toFixed(3)}</title></line>
            </g>}
            {visible.observations && model.trials.map((trial) => <circle key={trial.id} cx={sx(trial.x)} cy={sy(trial.y)} r={selected?.id === trial.id ? 7 : 4.5} className={`point ${step < 2 ? "unclassified-point" : goodIds.has(trial.id) ? "good-point" : "bad-point"}`} tabIndex={0} role="button" aria-label={`Trial ${trial.id}, x ${trial.x.toFixed(3)}, objective ${trial.y.toFixed(3)}, ${groupName(trial)}`} onMouseEnter={() => setSelected(trial)} onFocus={() => setSelected(trial)} onClick={() => setSelected(trial)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(trial); } }}><title>Trial {trial.id}: x = {trial.x.toFixed(3)}, f(x) = {trial.y.toFixed(3)}</title></circle>)}
          </g>
          <text x={(box.left + box.right) / 2} y={H - 6 * typeScale} textAnchor="middle" className="axis-title">Search parameter · x</text>
        </svg></div>

        <div className="plot-inspection" data-selected={selected !== null} aria-live="polite">{selected ? `Trial ${selected.id} · x = ${selected.x.toFixed(3)} · f(x) = ${selected.y.toFixed(3)} · ${groupName(selected)}` : null}</div>
        {guide.active && <LabHintBubble textId={guide.textId} message={playGuides[guide.active].action} phase="action" placement="bottom" onDismiss={guide.dismiss} />}
      </section>
      <ModelSettingsPanel key={page === "play-2d" ? route.visit : "hidden"}
        experiment={{ page: "play-2d", preset: objectivePreset }} settings={settings}
        defaultSettings={defaultSearch.settings} guide={guide.settingsGuide}
        onChange={(next) => {
          if (next.gamma !== gamma) guide.retire("gamma");
          if (next.bandwidth !== bandwidth) guide.retire("bandwidth");
          setSearch({ ...search, settings: { ...next, bandwidthRule: next.bandwidthRule ?? "constant" } });
          editModel();
        }}
        seed={seed} onNewSeed={() => { setSearch({ ...search, seed: Math.floor(Math.random() * 100) }); setPlayback(emptyPlayback()); setPlaying(false); setSelected(null); }}
        trialLimit={trialLimit} widths={goodWidth === undefined ? [] : [{ label: "x", value: goodWidth }]} domainWidth={domainWidth}
        status={<>
          <div className="proposal">
            <h3>{!proposal ? "Search complete" : proposal.method === "random" ? `Random start · ${step + 1} / ${startupTrials}` : `TPE · trial ${step + 1}`}</h3>
            <Help label="trial selection">
              {!proposal ? `Search complete. All ${trialLimit} trials evaluated. Replay to inspect each decision.` : proposal.method === "random"
                ? `Initial random exploration · ${step + 1} / ${startupTrials}. ${startupTrials === trialLimit ? "Every trial in this search is random." : `Uniform random draw until TPE starts at trial ${startupTrials + 1}.`}`
                : `TPE proposal · trial ${step + 1}. Drew ${candidates} candidate${candidates === 1 ? "" : "s"} from ℓ(x) and picked the largest ℓ(x)/g(x). Gray ticks show candidates; the dashed line marks the pick.`}
            </Help>
            {proposal && <p><strong>Next x = {proposal.x.toFixed(3)}</strong>{proposal.method === "tpe" && ` · log ℓ/g = ${Math.max(...proposal.candidates.map((candidate) => candidate.logRatio)).toFixed(3)}`}</p>}
          </div>
          <div className="stats"><span className="good-text"><strong>{model.good.length}</strong> good</span><span className="bad-text"><strong>{model.bad.length}</strong> bad</span></div>
        </>}>
      <section className="search-toolbar" aria-label="Search controls">
        <div className="plot-header">
          <div className="objective-picker parameter">
            <div className="parameter-label"><label htmlFor="objective-preset">Objective</label><Help label={`${objectiveDefinition.label} preset`}><strong>{objectiveDefinition.label}</strong><br />{objectiveDefinition.description}<br />{objectiveDefinition.formula}<br />Shifted so the minimum is 1. Changing it restarts the search.</Help></div>
            <select id="objective-preset" value={objectivePreset} onChange={(event) => { setSearch({ ...search, preset: event.target.value as ObjectivePreset }); setPlayback(emptyPlayback()); setPlaying(false); setSelected(null); }}>{(Object.keys(objectivePresets) as ObjectivePreset[]).map((preset) => <option key={preset} value={preset}>{objectivePresets[preset].label}</option>)}</select>
          </div>
        </div>

      </section>
      </ModelSettingsPanel>
    <details className="performance-monitor">
        <summary><span className="performance-caption">Best f(x) <strong title={bestValue}>{bestValue}</strong></span><span>Performance <span aria-hidden="true">⌄</span></span></summary>
        <ProgressComparison trials={trials} seed={seed} objectivePreset={objectivePreset} />
      </details>
      </div>
      </div>
      <article hidden={page !== "about"} className="about-page" aria-label="About">
        <figure className="tpe-mascot">
          <img src={new URL("./assets/fuwatane.webp", import.meta.url).href} width="640" height="585" alt="tippy, the fluffy TPE mascot holding red and blue crayons" decoding="async" />
          <figcaption>tippy</figcaption>
        </figure>
        <h2>What is TPE?</h2>
        <p><strong>TPE (Tree-structured Parzen Estimator) is a Bayesian optimization algorithm for black-box functions.</strong> It uses past evaluations to choose promising inputs, without a formula or gradient (<a href="https://proceedings.neurips.cc/paper/2011/hash/86e8f7ab32cfd12577bc2619bc635690-Abstract.html">Bergstra et al., 2011</a>).</p>
        <p>Think of tuning a machine learning model’s learning rate. Each evaluation requires training, so Bayesian optimization aims to find good settings with fewer trials.</p>
        <h2>TPE in Optuna</h2>
        <p>TPE is the default sampler in <a href="https://optuna.org/">Optuna</a> (<a href="https://arxiv.org/abs/1907.10902">paper</a>), implemented as <a href="https://optuna.readthedocs.io/en/stable/reference/samplers/generated/optuna.samplers.TPESampler.html">TPESampler</a> (<a href="https://github.com/optuna/optuna/blob/master/optuna/samplers/_tpe/sampler.py">source</a>). For multi-objective studies, the default changed from NSGA-II in 4.x to TPE in <a href="https://optuna.readthedocs.io/en/stable/reference/generated/optuna.create_study.html">5.0</a>.</p>
        <p>TPESampler supports <a href="https://doi.org/10.1613/jair.1.13188">multi-objective</a> and <a href="https://arxiv.org/abs/2606.09889">black-box constrained optimization</a>.</p>
        <h2>Inside TPE</h2>
        <ol className="explanation-steps">
          <li><strong>Split.</strong> The best fraction γ of observations forms the good group; the rest form the other group.</li>
          <li><strong>Model.</strong> Fit densities ℓ(x) and g(x) to the two groups using kernel density estimation (KDE).</li>
          <li><strong>Sample.</strong> Draw candidates from ℓ(x), evaluate the one with the highest ℓ(x)/g(x), and repeat.</li>
        </ol>
        <p>For bandwidths, weights, and other design choices, see <a href="https://arxiv.org/abs/2304.11127">Watanabe’s TPE tutorial</a>.</p>
        <h2>Explore the playground</h2>
        <ul className="explanation-steps">
          <li><strong><a href="#lab">Lab</a>.</strong> Follow one TPE decision step by step, from 10 observations to the next trial: split, kernels, densities, candidates, and the choice. Adjust γ, bandwidth, prior, weighting, and the number of candidates along the way, with hints for each control.</li>
          <li><strong><a href={playPageHrefs["play-2d"]} onClick={openPlay2D}>Play 2D</a>.</strong> Run TPE on a one-dimensional objective, trial by trial. Watch ℓ(x), g(x), and their ratio change, and compare progress against random search.</li>
          <li><strong><a href={playPageHrefs["play-3d"]}>Play 3D</a>.</strong> Run TPE on a two-dimensional surface. Compare multivariate and univariate density models, and add a constraint to see constrained search.</li>
        </ul>
        <p>In Play 2D and Play 3D, <strong>Settings → Share link</strong> copies a URL that restarts the same search: objective, seed, settings, and any constraint.</p>
        <p>TPE Playground is a simplified educational implementation: single-objective, with continuous inputs only. <a href="https://github.com/Kaichi-Irie/tpe-playground">View the playground’s source code on GitHub</a>.</p>
        <h2>Constrained TPE</h2>
        <p>Play 3D can restrict the search to a feasible region c(x) ≤ 0. Constraint values are observed like the objective, so TPE learns the region from trials.</p>
        <p>The playground follows Optuna’s <strong>joint</strong> approach. Feasible trials rank first by objective value. If they cannot fill the good group, <strong>Infeasible filling</strong> adds the infeasible trials with the smallest violation. A single pair ℓ(x), g(x) then models objective and feasibility together (<a href="https://arxiv.org/abs/2606.09889">Watanabe &amp; Irie, 2026</a>).</p>
        <p>The original <a href="https://ijcai.org/proceedings/2023/486">c-TPE</a> instead fits a separate density ratio to each constraint and multiplies them. That independent variant is not implemented here.</p>
        <section className="algorithm-comparison" aria-labelledby="comparison-heading">
          <h2 id="comparison-heading">TPE and other optimizers</h2>
          <div className="algorithm-table-scroll" role="region" aria-label="Optimization algorithm comparison" tabIndex={0}>
            <table className="algorithm-table">
              <thead><tr><th scope="col">Method</th><th scope="col">How it searches</th><th scope="col">Typical use</th></tr></thead>
              <tbody>
                <tr><th scope="row">TPE<span className="algorithm-software"><a href="https://optuna.readthedocs.io/en/stable/reference/samplers/generated/optuna.samplers.TPESampler.html">Optuna</a> · <a href="https://hyperopt.github.io/hyperopt/">Hyperopt</a></span></th><td>Bayesian optimization using the good/rest density ratio ℓ(x)/g(x).</td><td>Continuous, discrete, categorical, and conditional spaces.</td></tr>
                <tr><th scope="row">GP (Gaussian process)<span className="algorithm-software"><a href="https://optuna.readthedocs.io/en/stable/reference/samplers/generated/optuna.samplers.GPSampler.html">Optuna</a> · <a href="https://botorch.org/docs/introduction">BoTorch</a></span></th><td>Bayesian optimization using predicted objective values and uncertainty.</td><td>Low-dimensional continuous spaces; discrete inputs need extra treatment.</td></tr>
                <tr><th scope="row">CMA-ES<span className="algorithm-software"><a href="https://optuna.readthedocs.io/en/stable/reference/samplers/generated/optuna.samplers.CmaEsSampler.html">Optuna</a> · <a href="https://github.com/CMA-ES/pycma">pycma</a></span></th><td>Evolutionary search adapting a Gaussian’s mean, covariance, and step size.</td><td>Continuous spaces with strong parameter interactions.</td></tr>
                <tr><th scope="row">Random search</th><td>Samples independently of past results.</td><td>A simple baseline.</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      <section className="references" aria-labelledby="references-heading">
        <h2 id="references-heading">References</h2>
        <ol>
          <li>
            <a href="https://proceedings.neurips.cc/paper/2011/hash/86e8f7ab32cfd12577bc2619bc635690-Abstract.html">Algorithms for Hyper-Parameter Optimization</a>
            <p>Bergstra et al. · NIPS 2011 · Original TPE.</p>
          </li>
          <li>
            <a href="https://arxiv.org/abs/1907.10902">Optuna: A Next-generation Hyperparameter Optimization Framework</a>
            <p>Akiba et al. · KDD 2019 · Optuna framework.</p>
          </li>
          <li>
            <a href="https://arxiv.org/abs/2304.11127">Tree-Structured Parzen Estimator: Understanding Its Algorithm Components and Their Roles for Better Empirical Performance</a>
            <p>Watanabe · 2023 · TPE components and design choices.</p>
          </li>
          <li>
            <a href="https://doi.org/10.1613/jair.1.13188">Multiobjective Tree-Structured Parzen Estimator</a>
            <p>Ozaki et al. · JAIR 2022 · MOTPE.</p>
          </li>
          <li>
            <a href="https://ijcai.org/proceedings/2023/486">c-TPE: Tree-structured Parzen Estimator with Inequality Constraints for Expensive Hyperparameter Optimization</a>
            <p>Watanabe &amp; Hutter · IJCAI 2023 · Constrained TPE.</p>
          </li>
          <li>
            <a href="https://arxiv.org/abs/2606.09889">Optuna Constrained Tree-Structured Parzen Estimator Is a Joint Density Generalization of c-TPE</a>
            <p>Watanabe &amp; Irie · 2026 preprint · Optuna’s joint-density constraint handling.</p>
          </li>
        </ol>
      </section>
      </article>
      <footer><span>Browser-only computation</span></footer>
    </main>
  );
}
