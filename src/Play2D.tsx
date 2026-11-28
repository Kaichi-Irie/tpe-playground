import { usePlotSize } from "./usePlotSize";
import { PlaybackControls } from "./PlaybackControls";
import { PlotLegend, type PlotLayerItem } from "./PlotLegend";
import { defaultPlaybackSpeed, type PlaybackSpeed } from "./playbackSpeed";
import LabHintBubble from "./LabHintBubble";
import { playGuides } from "./playGuides";
import { usePlayGuide } from "./usePlayGuide";
import { ModelSettingsPanel } from "./ModelSettingsPanel";
import { readPlay2DSharedSearch, type SharedSearch } from "./shareSearch";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { trialLimit, buildOneParamView, prior, searchDefaults, defaults, domain, proposeTrial, oneParamProposalFromTrace, type Trial } from "./oneParamTpe";

import { getObjective, objectivePresets, type ObjectivePreset } from "./objectives";

import { Help } from "./Help";
import { HelpMath } from "./HelpMath";
import { ProgressComparison } from "./ProgressComparison";

import { emptyPlayback, keepObservations, movePlayback } from "./playback";
import { logTruncatedNormalPeak } from "./model/tpe/truncnorm";

import { GpSettingsPanel } from "./GpSettingsPanel";
import type { GpSettings } from "./gpSettings";
import { buildOneParamGpView, emptyOneParamGpPlayback, keepOneParamGpObservations, moveOneParamGpPlayback, proposeOneParamGp } from "./oneParamGp";
import { samplersForPage } from "./samplers";
import { seekPlayback } from "./seekPlayback";

const grid = Array.from({ length: 501 }, (_, i) => domain[0] + i / 50);
const reversedGrid = [...grid].reverse();
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

const gpLayers = [
  layers[0],
  { key: "mean", label: "Mean μ(x)", short: "μ(x)" },
  { key: "band", label: "Band ±2σ", short: "±2σ" },
  layers[3],
  layers[4],
] as const satisfies readonly PlotLayerItem[];

const noTrials: readonly Trial[] = [];
type Play2DSampler = "tpe" | "gp";

function plotLine(xs: readonly number[], ys: readonly number[], sx: (x: number) => number, sy: (y: number) => number) {
  return ys.map((y, i) => `${i ? "L" : "M"}${sx(xs[i]).toFixed(2)},${sy(y).toFixed(2)}`).join(" ");
}

// Interpolate between the fixed posterior sample locations using local tangents.
function posteriorPath(xs: readonly number[], ys: readonly number[], sx: (x: number) => number, sy: (y: number) => number) {
  const coordinates = xs.map((x, i) => ({ x: sx(x), y: sy(ys[i]) }));
  const point = (x: number, y: number) => `${x.toFixed(2)},${y.toFixed(2)}`;
  return coordinates.map(({ x, y }, i) => {
    if (i === 0) return `M${point(x, y)}`;
    const previous = coordinates[i - 1];
    const before = coordinates[i - 2] ?? previous;
    const after = coordinates[i + 1] ?? coordinates[i];
    const dx = (x - previous.x) / 3;
    return `C${point(previous.x + dx, previous.y + (y - before.y) / 6)} ${point(x - dx, y - (after.y - previous.y) / 6)} ${point(x, y)}`;
  }).join(" ");
}

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
  const [search, setSearch] = useState(() => readPlay2DSharedSearch(
    sharedSettings, defaultSearch, objectivePresets, trialLimit, domainWidth,
  ));
  const { seed, preset: objectivePreset, settings, gpSettings, sampler } = search;
  const isGp = sampler === "gp";
  const { priorWeight, startupTrials, candidates, gamma, weights, bandwidthRule, bandwidth } = settings;
  const objectiveDefinition = getObjective(objectivePreset);
  const objectiveValues = useMemo(() => grid.map(objectiveDefinition.evaluate), [objectiveDefinition]);
  const [playback, setPlayback] = useState(emptyPlayback);
  const [gpPlayback, setGpPlayback] = useState(emptyOneParamGpPlayback);
  const step = isGp ? gpPlayback.step : playback.step;
  const activeStartupTrials = isGp ? gpSettings.startupTrials : startupTrials;
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(defaultPlaybackSpeed);
  const [selected, setSelected] = useState<Trial | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [seekError, setSeekError] = useState(false);
  const seekController = useRef<AbortController | null>(null);
  const [lastNavigation, setLastNavigation] = useState(navigation);

  // Reset before rendering the shared search while preserving plot and playback preferences.
  if (lastNavigation !== navigation) {
    setLastNavigation(navigation);
    setPlaying(false);
    setSeekTarget(null);
    setSeekError(false);
    setHoverX(null);
    if (sharedSettings) {
      setSearch(readPlay2DSharedSearch(sharedSettings, defaultSearch, objectivePresets, trialLimit, domainWidth));
      setPlayback(emptyPlayback());
      setGpPlayback(emptyOneParamGpPlayback());
      setSelected(null);
    }
  }

  useLayoutEffect(() => {
    if (!active) setSeekTarget(null);
    return () => seekController.current?.abort();
  }, [active, navigation]);

  useLayoutEffect(() => {
    if (!active || !playing || step >= trialLimit) return;
    const timer = window.setTimeout(() => {
      if (isGp) setGpPlayback((current) => moveOneParamGpPlayback(current, current.step + 1, seed, gpSettings, objectivePreset));
      else setPlayback((current) => movePlayback(current, current.step + 1, seed, priorWeight, { gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset }));
      setSelected(null);
      if (step + 1 === trialLimit) setPlaying(false);
    }, 1000 / playbackSpeed);
    return () => window.clearTimeout(timer);
  }, [active, playing, playbackSpeed, step, isGp, gpSettings, seed, priorWeight, gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset]);

  function cancelSeek() {
    seekController.current?.abort();
    seekController.current = null;
    setSeekTarget(null);
    setSeekError(false);
  }

  function seekGp(next: number, onComplete?: () => void) {
    const move = (current: typeof gpPlayback, target: number) => moveOneParamGpPlayback(current, target, seed, gpSettings, objectivePreset);
    if (next <= gpPlayback.step + 1) {
      setGpPlayback(move(gpPlayback, next));
      onComplete?.();
      return;
    }

    const controller = new AbortController();
    seekController.current = controller;
    setSeekTarget(next);
    void seekPlayback(gpPlayback, (state) => state.step, next, trialLimit, move, controller.signal)
      .then((result) => {
        if (!result || controller.signal.aborted) return;
        setGpPlayback(result);
        onComplete?.();
      })
      .catch(() => { if (!controller.signal.aborted) setSeekError(true); })
      .finally(() => {
        if (seekController.current !== controller) return;
        seekController.current = null;
        setSeekTarget(null);
      });
  }

  function moveTo(next: number) {
    cancelSeek();
    setPlaying(false);
    setSelected(null);
    if (isGp) seekGp(next);
    else setPlayback((current) => movePlayback(current, next, seed, priorWeight, { gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset }));
  }

  function changeSampler(next: Play2DSampler) {
    cancelSeek();
    if (next === sampler) return;
    setPlaying(false);
    setSelected(null);
    setHoverX(null);
    const commit = () => setSearch((current) => ({ ...current, sampler: next }));
    if (next === "gp") seekGp(step, commit);
    else {
      setPlayback((current) => movePlayback(current, step, seed, priorWeight, { gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset }));
      commit();
    }
  }

  function editGp(next: GpSettings) {
    cancelSeek();
    setPlaying(false);
    setSearch({ ...search, gpSettings: next });
    setGpPlayback(keepOneParamGpObservations);
  }

  function restartSearch(next: typeof search) {
    cancelSeek();
    setSearch(next);
    setPlayback(emptyPlayback());
    setGpPlayback(emptyOneParamGpPlayback());
    setPlaying(false);
    setSelected(null);
    setHoverX(null);
  }

  const [visible, setVisible] = useState({ objective: true, good: true, bad: true, observations: true, acquisition: false });
  const [gpVisible, setGpVisible] = useState({ objective: true, mean: true, band: true, observations: true, acquisition: true });
  const guide = usePlayGuide<HTMLDivElement>({ page: "play-2d", step, startupTrials, acquisitionVisible: visible.acquisition, seeking: seekTarget !== null }, active && !isGp);
  const guideAcquisition = guide.active === "acquisition";
  const tpeTrials = useMemo(() => isGp ? noTrials : playback.trials.slice(0, playback.step), [isGp, playback]);
  const proposals = useMemo(() => playback.proposals.slice(0, playback.step), [playback]);
  const trials = isGp ? gpPlayback.trials : tpeTrials;
  const model = useMemo(() => buildOneParamView(tpeTrials, grid, priorWeight, { gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset }), [tpeTrials, priorWeight, gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset]);
  const gpModel = useMemo(() => isGp ? buildOneParamGpView(gpPlayback.trials, grid, gpSettings, objectivePreset) : null, [isGp, gpPlayback, gpSettings, objectivePreset]);
  const proposal = useMemo(() => isGp || step === trialLimit ? undefined : playback.proposals[step] ?? (model.fitted && step >= startupTrials ? oneParamProposalFromTrace(model.fitted.propose(seed)) : proposeTrial(tpeTrials, seed, priorWeight, { gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset })), [isGp, step, playback.proposals, model.fitted, tpeTrials, seed, priorWeight, gamma, bandwidth, bandwidthRule, weights, startupTrials, candidates, objectivePreset]);
  const gpProposal = useMemo(() => gpModel && step < trialLimit
    ? proposeOneParamGp(gpModel.trials, seed, gpSettings, objectivePreset, gpModel.fitted) : undefined,
  [gpModel, step, seed, gpSettings, objectivePreset]);
  const nextX = isGp ? gpProposal?.x : proposal?.x;
  const nextPrediction = gpProposal?.trace.method === "gp" ? gpProposal.trace.prediction : gpProposal && gpModel?.evaluate?.(gpProposal.x);
  const showCandidateTicks = !compactChart && (proposal?.candidates.length ?? 0) > 0;
  const bestValue = trials.length ? Math.min(...trials.map((trial) => trial.y)).toFixed(3) : "—";

  const gpChart = useMemo(() => {
    if (!gpModel) return null;
    const bounds = (sigma: number) => {
      const upper = gpModel.mean.map((mean, i) => mean + sigma * gpModel.std[i]);
      const lower = gpModel.mean.map((mean, i) => mean - sigma * gpModel.std[i]);
      return { upper, lower };
    };
    const outer = bounds(2);
    const sampleValues = gpModel.posteriorSamples.flat();
    return {
      outer, inner: bounds(1),
      low: Math.floor(Math.min(0, ...outer.lower, ...sampleValues)),
      high: Math.ceil(Math.max(8, ...objectiveValues, ...outer.upper, ...sampleValues)),
    };
  }, [gpModel, objectiveValues]);
  const yMin = gpChart?.low ?? 0;
  const yMax = gpChart?.high ?? 8;
  const { left, right, top, bottom } = box;
  const acquisitionX = isGp ? right : W - 38 * typeScale;
  const sx = useCallback((x: number) => left + (x - domain[0]) / domainWidth * (right - left), [left, right]);
  const sy = useCallback((y: number) => bottom - (y - yMin) / (yMax - yMin) * (bottom - top), [top, bottom, yMin, yMax]);
  const objectivePath = useMemo(() => plotLine(grid, objectiveValues, sx, sy), [objectiveValues, sx, sy]);
  const path = (ys: number[], scale: (y: number) => number) => plotLine(grid, ys, sx, scale);
  const area = (line: string) => `${line} L${right},${bottom} L${left},${bottom} Z`;
  const acquisition = gpModel?.acquisition ?? model.acquisition;
  const isEi = isGp && gpSettings.acquisition === "ei";
  const acquisitionLow = isEi ? 0 : isGp && acquisition.length ? Math.min(...acquisition) : Math.min(0, ...acquisition);
  const acquisitionHigh = isGp && acquisition.length ? Math.max(...acquisition) : Math.max(1, ...acquisition);
  const acquisitionPadding = isEi ? 0 : Math.max(isGp ? 0.001 : 0, (acquisitionHigh - acquisitionLow) * 0.12);
  const acquisitionMin = acquisitionLow - acquisitionPadding;
  const acquisitionMax = isEi ? Math.max(1e-6, acquisitionHigh * 1.12) : acquisitionHigh + acquisitionPadding;
  const sa = useCallback((value: number) => bottom - (value - acquisitionMin) / (acquisitionMax - acquisitionMin) * (bottom - top),
    [top, bottom, acquisitionMin, acquisitionMax]);
  const acquisitionName = gpSettings.acquisition.toUpperCase();
  const gpPaths = useMemo(() => {
    if (!gpModel?.fitted || !gpChart) return null;
    const band = ({ upper, lower }: typeof gpChart.outer) =>
      plotLine(grid, upper, sx, sy) + " " + plotLine(reversedGrid, [...lower].reverse(), sx, sy).replace(/^M/, "L") + " Z";
    return {
      outer: band(gpChart.outer),
      inner: band(gpChart.inner),
      mean: plotLine(grid, gpModel.mean, sx, sy),
      samples: gpModel.posteriorSamples.map((sample) => posteriorPath(gpModel.sampleGrid, sample, sx, sy)),
      acquisition: plotLine(grid, gpModel.acquisition, sx, sa),
    };
  }, [gpModel, gpChart, sx, sy, sa]);
  const hoverPrediction = hoverX === null ? null : gpModel?.evaluate?.(hoverX);
  function inspectGp(event: PointerEvent<SVGSVGElement>) {
    if (!gpModel?.fitted || event.pointerType === "touch") return;
    if (event.target instanceof Element && event.target.closest(".gp-point")) {
      setHoverX(null);
      return;
    }
    const svg = event.currentTarget;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const { x, y } = point.matrixTransform(matrix.inverse());
    setHoverX(x < left || x > right || y < top || y > bottom ? null : domain[0] + (x - left) / (right - left) * domainWidth);
  }

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
  const goodPath = isGp ? "" : path(model.goodDensity, sd), badPath = isGp ? "" : path(model.badDensity, sd);
  const showAcquisition = isGp ? gpVisible.acquisition : visible.acquisition;
  const objectivePicker = <section className="search-toolbar" aria-label="Search controls">
    <div className="plot-header">
      <div className="objective-picker parameter">
        <div className="parameter-label"><label htmlFor="objective-preset">Objective</label><Help label={`${objectiveDefinition.label} preset`}><strong>{objectiveDefinition.label}</strong><br />{objectiveDefinition.description}<HelpMath tex={objectiveDefinition.formula} />The constant <HelpMath inline tex="c" /> shifts the minimum to 1. Changing it restarts the search.</Help></div>
        <select id="objective-preset" value={objectivePreset} onChange={(event) => restartSearch({ ...search, preset: event.target.value as ObjectivePreset })}>{(Object.keys(objectivePresets) as ObjectivePreset[]).map((preset) => <option key={preset} value={preset}>{objectivePresets[preset].label}</option>)}</select>
      </div>
    </div>
  </section>;
  const newSeed = () => restartSearch({ ...search, seed: Math.floor(Math.random() * 100) });

  return (
    <div hidden={hidden} className="visual-workspace play-2d" data-sampler={sampler} ref={guide.workspaceRef} onKeyDown={(event) => {
      if (seekTarget !== null && event.key === "Escape" && !event.defaultPrevented && !(event.target as Element).closest("dialog")) {
        event.preventDefault();
        cancelSeek();
      } else guide.onKeyDown(event);
    }}>
      <section className="canvas-plot" aria-labelledby="plot-heading">
        <div className="canvas-controls">
          <PlaybackControls targetStep={seekTarget} step={step} limit={trialLimit} playing={playing} speed={playbackSpeed} onSpeedChange={setPlaybackSpeed} guidePlay={guide.active === "playback"} guideDescribedBy={guide.textId} onMove={moveTo}
            onToggle={() => { cancelSeek(); if (step === trialLimit) moveTo(0); setPlaying(!playing); }} />
          <div className="sampler-toggle" role="group" aria-label="Play 2D sampler">
            {samplersForPage("play-2d").map(({ id, label }) => <button key={id} type="button" aria-pressed={sampler === id} onClick={() => changeSampler(id)}>{label}</button>)}
          </div>
        </div>

        <h2 id="plot-heading" className="sr-only">Minimize the objective function</h2>
        <div className="plot-tools">
          {isGp ? <PlotLegend ariaLabel="Plot layers" className="gp-legend" visible={gpVisible} items={gpLayers}
            onToggle={(key) => { setHoverX(null); setGpVisible((current) => ({ ...current, [key]: !current[key] })); }} />
            : <PlotLegend ariaLabel="Plot layers" visible={visible}
            items={layers.map((item) => item.key === "acquisition" && guideAcquisition
              ? { ...item, guideTarget: true, describedBy: guide.textId }
              : item)}
            onToggle={(key) => setVisible((current) => ({ ...current, [key]: !current[key] }))} />}
        <div className="plot-guide"><Help label="how to read this plot"><strong>How to read this plot</strong>
        {isGp ? <span className="plot-guide-description">Violet shading shows ±1σ and ±2σ around the predicted mean. Four faint curves show possible objective functions drawn from the posterior. {acquisitionName} uses a separate scale, with higher scores preferred. Vertical gray dashes mark the next evaluation. During random startup, the acquisition curve is a preview.</span> : <>
        <span className="line-key"><span><i className="split-key" /> Horizontal gray dashes: good/bad split</span><span><i className="next-key" /> Vertical gray dashes: next evaluation</span>{showCandidateTicks && <span>Gray ticks: sampled candidates</span>}</span>
        <span className="plot-guide-description">{compactChart ? "Objective: left axis. Good and bad KDEs share one scale. Acquisition uses its own scale, higher is better. Density and acquisition tick labels are omitted to leave more space for the plot." : <>Objective: left axis · KDEs: right axis · acquisition <HelpMath inline tex={String.raw`\log\bigl(\ell(x)/g(x)\bigr)`} />: far-right axis, higher is better.</>} KDEs appear after 2 observations. {step < startupTrials ? "Acquisition is a preview during initial random exploration." : `The selected point is best among ${candidates} sampled candidate${candidates === 1 ? "" : "s"}, not necessarily the curve’s global maximum.`}</span></>}</Help></div>
        </div>
        <div className="chart-scroll"><svg ref={chartRef} viewBox={`0 0 ${W} ${H}`} aria-labelledby="chart-title chart-description" role="img" onPointerMove={isGp ? inspectGp : undefined} onPointerLeave={isGp ? () => setHoverX(null) : undefined}>
          <title id="chart-title">Objective function, {step} observations, {isGp ? "GP posterior" : "good and bad KDEs"}, and acquisition</title><desc id="chart-description">Search parameter x from -5 to 5. {isGp ? "The mean, uncertainty bands and possible objective curves share the objective axis. The acquisition curve uses its own scale. Vertical dashes mark the next evaluation. Select an observation to inspect it." : <>{compactChart ? "Left axis: objective value. Density and acquisition tick labels are omitted in this compact view. Good and bad densities share one scale; the log density ratio uses a separate scale, higher is better." : "Left axis: objective value. Right axis: probability density. Far-right axis: log density ratio, higher is better."} Horizontal gray dashes mark the split; vertical gray dashes mark the next evaluation. Select an observation to inspect it.</>}</desc>
          <defs><clipPath id="plot-clip"><rect x={box.left} y={box.top} width={box.right - box.left} height={box.bottom - box.top} /></clipPath></defs>
          <text x={box.left} y={20 * typeScale} className="axis-title">Minimize f(x) ↓</text>
          {!isGp && <text x={box.right} y={20 * typeScale} textAnchor="end" className="axis-title">{compactChart ? (visible.acquisition ? "KDE · log ℓ/g" : "Good / Bad KDE") : "Probability density"}</text>}
          {showAcquisition && acquisition.length > 0 && (!compactChart || isGp) && <g className="acquisition-axis">
            <text x={compactChart ? right : W - 4 * typeScale} y={20 * typeScale} textAnchor="end" className="axis-title">{isGp ? `${acquisitionName} ↑` : "log ℓ/g ↑"}</text>
            {!compactChart && <>
              <line x1={acquisitionX} x2={acquisitionX} y1={top} y2={bottom} />
              {yTickLabels.map((fraction) => {
                const raw = acquisitionMin + fraction * (acquisitionMax - acquisitionMin);
                const value = Math.abs(raw) < 1e-12 ? 0 : raw;
                const span = acquisitionMax - acquisitionMin;
                const label = isGp && span < 0.01 ? (value === 0 ? "0" : value.toExponential(1)) : value.toFixed(isGp && span < 1 ? 3 : 1);
                return <text key={fraction} x={acquisitionX + 5 * typeScale} y={sa(value) + 4 * typeScale}>{label}</text>;
              })}
            </>}
          </g>}
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = yMin + fraction * (yMax - yMin);
            return <g key={fraction}>
              <line x1={left} x2={right} y1={sy(y)} y2={sy(y)} className="grid" />
              {yTickLabels.includes(fraction) && <>
                <text x={left - (isGp ? 4 : 14) * typeScale} y={sy(y) + 4 * typeScale} textAnchor="end">{Number(y.toFixed(1))}</text>
                {!isGp && !compactChart && <text x={right + 14 * typeScale} y={sy(y) + 4 * typeScale}>{(densityMax * fraction).toFixed(2)}</text>}
              </>}
            </g>;
          })}
          {(compactChart ? [-5, 0, 5] : [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]).map((x) => <g key={x}><line x1={sx(x)} x2={sx(x)} y1={box.top} y2={box.bottom} className="grid vertical" /><text x={sx(x)} y={box.bottom + (shortChart ? 10 : 22) * typeScale} textAnchor="middle">{x}</text></g>)}
          <g clipPath="url(#plot-clip)">
            {visible.bad && model.bad.length > 0 && <><path d={area(badPath)} className="bad-area" /><path d={badPath} className="bad-line" /></>}
            {visible.good && model.good.length > 0 && <><path d={area(goodPath)} className="good-area" /><path d={goodPath} className="good-line" /></>}
            {visible.acquisition && model.acquisition.length > 0 && <path d={path(model.acquisition, sa)} className="acquisition-line" />}
            {model.threshold !== null && <line x1={box.left} x2={box.right} y1={sy(model.threshold)} y2={sy(model.threshold)} className="threshold" />}
            {gpPaths && gpVisible.band && <>
              <path d={gpPaths.outer} className="gp-band-outer" />
              <path d={gpPaths.inner} className="gp-band-inner" />
              {gpPaths.samples.map((sample, i) => <path key={i} d={sample} className="gp-sample-line" />)}
            </>}
            {(isGp ? gpVisible.objective : visible.objective) && <path d={objectivePath} className="objective-line" />}
            {gpPaths && gpVisible.mean && <path d={gpPaths.mean} className="gp-mean-line" />}
            {gpPaths && gpVisible.acquisition && <path d={gpPaths.acquisition} className="gp-acq-line" />}
            {nextX !== undefined && <g aria-label="Proposed point and candidate positions">
              {showCandidateTicks && proposal?.candidates.map((candidate, i) => <line key={i} x1={sx(candidate.x)} x2={sx(candidate.x)} y1={box.bottom - 12} y2={box.bottom} className="candidate-tick"><title>Candidate {i + 1}: x = {candidate.x.toFixed(3)}, log ℓ/g = {candidate.logRatio.toFixed(3)}</title></line>)}
              <line x1={sx(nextX)} x2={sx(nextX)} y1={box.top} y2={box.bottom} className="proposal-line"><title>Next x = {nextX.toFixed(3)}</title></line>
            </g>}
            {hoverX !== null && hoverPrediction && <g aria-hidden="true" className="gp-hover">
              <line x1={sx(hoverX)} x2={sx(hoverX)} y1={top} y2={bottom} className="gp-hover-line" />
              <line x1={sx(hoverX)} x2={sx(hoverX)} y1={sy(hoverPrediction.mean + 2 * hoverPrediction.std)} y2={sy(hoverPrediction.mean - 2 * hoverPrediction.std)} className="gp-hover-bar" />
              <circle cx={sx(hoverX)} cy={sy(hoverPrediction.mean)} r={3.5} className="gp-hover-dot" />
            </g>}
            {(isGp ? gpVisible.observations : visible.observations) && trials.map((trial) => <circle key={trial.id} cx={sx(trial.x)} cy={sy(trial.y)} r={selected?.id === trial.id ? 7 : 4.5} className={`point ${isGp ? "gp-point" : step < 2 ? "unclassified-point" : goodIds.has(trial.id) ? "good-point" : "bad-point"}`} tabIndex={0} role="button" aria-label={`Trial ${trial.id}, x ${trial.x.toFixed(3)}, objective ${trial.y.toFixed(3)}, ${isGp ? "" : `, ${groupName(trial)}`}`} onMouseEnter={() => { setHoverX(null); setSelected(trial); }} onFocus={() => { setHoverX(null); setSelected(trial); }} onClick={() => { setHoverX(null); setSelected(trial); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(trial); } }}><title>Trial {trial.id}: x = {trial.x.toFixed(3)}, f(x) = {trial.y.toFixed(3)}</title></circle>)}
          </g>
          <text x={(box.left + box.right) / 2} y={H - 6 * typeScale} textAnchor="middle" className="axis-title">Search parameter · x</text>
        </svg></div>

        <div className="plot-inspection" data-selected={selected !== null || hoverPrediction != null} aria-live={hoverPrediction ? "off" : "polite"}>
          {hoverX !== null && hoverPrediction
            ? `x = ${hoverX.toFixed(3)} · f(x) = ${objectiveDefinition.evaluate(hoverX).toFixed(3)} · μ ± 2σ = ${hoverPrediction.mean.toFixed(3)} ± ${(2 * hoverPrediction.std).toFixed(3)} · ${acquisitionName} = ${hoverPrediction.acquisition.toFixed(3)}`
            : selected ? `Trial ${selected.id} · x = ${selected.x.toFixed(3)} · f(x) = ${selected.y.toFixed(3)}${isGp ? "" : ` · ${groupName(selected)}`}` : null}
        </div>
        {seekTarget !== null && <div className="gp-seek-status" role="status">Moving to trial {seekTarget} <button type="button" onClick={cancelSeek}>Cancel</button></div>}
        {seekError && <div className="gp-seek-status" role="status">Could not finish moving to the requested trial.</div>}
        {guide.active && <LabHintBubble textId={guide.textId} message={playGuides[guide.active].action} phase="action" placement="bottom" onDismiss={guide.dismiss} />}
      </section>
      {isGp ? <GpSettingsPanel key={active ? visit : "hidden"}
        experiment={{ page: "play-2d", preset: objectivePreset, sampler: "gp", gpSettings }}
        seed={seed} onNewSeed={newSeed} trialLimit={trialLimit} onChange={editGp}
        resolvedLengthScale={gpModel?.resolvedLengthScale ?? gpSettings.lengthScale}
        status={<div className="proposal">
          <h3>{!gpProposal ? "Search complete" : gpProposal.method === "random" ? `Random start · ${step + 1} / ${gpSettings.startupTrials}` : `GP · trial ${step + 1}`}</h3>
          {gpProposal && <p><strong>Next x = {gpProposal.x.toFixed(3)}</strong>{nextPrediction && ` · μ = ${nextPrediction.mean.toFixed(3)} ± ${(2 * nextPrediction.std).toFixed(3)}`}</p>}
        </div>}>
        {objectivePicker}
      </GpSettingsPanel> : <ModelSettingsPanel key={active ? visit : "hidden"}
        experiment={{ page: "play-2d", preset: objectivePreset, settings }}
        defaultSettings={defaultSearch.settings} guide={guide.settingsGuide}
        onChange={(next) => {
          if (next.gamma !== gamma) guide.retire("gamma");
          if (next.bandwidth !== bandwidth) guide.retire("bandwidth");
          setSearch({ ...search, settings: { ...next, bandwidthRule: next.bandwidthRule ?? "constant" } });
          cancelSeek();
          setPlaying(false);
          setPlayback(keepObservations);
        }}
        seed={seed} onNewSeed={newSeed}
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
        {objectivePicker}
      </ModelSettingsPanel>}
      <details className="performance-monitor">
        <summary><span className="performance-caption">Best f(x) <strong title={bestValue}>{bestValue}</strong></span><span>Performance <span aria-hidden="true">⌄</span></span></summary>
        <ProgressComparison trials={trials} proposals={isGp ? undefined : proposals} randomOnly={activeStartupTrials >= trialLimit} seed={seed}
          objectivePreset={objectivePreset} currentSampler={sampler} currentLabel={isGp ? (gpSettings.startupTrials >= trialLimit ? "Random only" : "GP") : undefined} />
      </details>
    </div>
  );
}
