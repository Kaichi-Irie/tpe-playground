import type { TwoParamConstraintPreset } from "./twoParamConstraints";
import { prepareTwoParamSurface, projectTwoParamSurface } from "./projectTwoParamSurface";
import { measurePlay3D } from "./play3dProfiling";
import { seekTwoParamPlayback } from "./seekTwoParamPlayback";
import { Play3DCanvas, fitPlay3DViewBox, hitTestPlay3DScene, type Play3DSceneItem, type Play3DViewBox } from "./Play3DCanvas";
import { mergeDepthSorted, twoParamSurfaceMesh, type TwoParamSurfaceVertex } from "./twoParamSurfaceMesh";
import { clampTopPan, createTopFieldItems, createTopObjectiveTint, createTopViewLayout, formatTopInspection, initialTopView, topTicks, type Play3DViewMode } from "./play3dTopView";
import { usePlotSize } from "./usePlotSize";
import { PlaybackControls } from "./PlaybackControls";
import { defaultPlaybackSpeed, type PlaybackSpeed } from "./playbackSpeed";
import { createTwoParamObjectiveView, type ObjectiveHeightScale } from "./twoParamObjectiveView";
import { Play3DPerformance } from "./Play3DPerformance";
import LabHintBubble from "./LabHintBubble";
import { playGuides } from "./playGuides";
import { usePlayGuide } from "./usePlayGuide";
import { ModelSettingsPanel } from "./ModelSettingsPanel";
import { CmaEsSettingsPanel } from "./CmaEsSettingsPanel";
import { Help } from "./Help";
import { HelpMath } from "./HelpMath";
import { constrainSettings } from "./searchSettings";
import { readPlay3DSharedSearch, type SharedSearch } from "./shareSearch";
import { useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from "react";
import { buildTwoParamView, twoParamDefaultModelSettings, getTwoParamObjective, twoParamObjectivePresets, emptyTwoParamPlayback, moveTwoParamPlayback, proposeTwoParamTrial, twoParamProposalFromTrace, twoParamSettings, type DensityMode, type TwoParamObjectivePreset, type TwoParamModelSettings, type TwoParamPlayback } from "./twoParamTpe";
import { getSampler, samplersForPage } from "./samplers";
import { buildTwoParamCmaEsView, emptyTwoParamCmaEsPlayback, moveTwoParamCmaEsPlayback, type TwoParamCmaEsSettings, type TwoParamSampler } from "./twoParamCmaEs";
import { buildCmaEsBell, buildCmaEsScene } from "./play3dCmaEsScene";
import { buildPlay3DCandidateScene } from "./play3dTpeScene";
import { Play3DConstraintSettings } from "./Play3DConstraintSettings";
import { PlotLegend, type PlotLayerItem } from "./PlotLegend";

export { buildPlay3DCandidateScene, type Play3DCandidateInspectorEntry } from "./play3dTpeScene";
export { Play3DConstraintSettings } from "./Play3DConstraintSettings";

type Surface = "objective" | "good" | "bad" | "acquisition";
type Layer = Surface | "observations" | "candidates";
const layers: readonly PlotLayerItem<Layer>[] = [
  { key: "objective", label: "Objective contours", short: "f(x)" },
  { key: "good", label: "Good KDE ℓ(x)", short: "Good" },
  { key: "bad", label: "Bad KDE g(x)", short: "Bad" },
  { key: "observations", label: "Observations", short: "Points" },
  { key: "candidates", label: "Candidates", short: "Cand." },
  { key: "acquisition", label: "Acquisition", short: "Acquisition" },
];
const cmaEsLayers = ([
  { key: "objective", label: "Objective contours", short: "f(x)" },
  { key: "ellipse", label: "Distribution (1σ/2σ)", short: "Gauss", title: "Current CMA-ES Gaussian distribution with 1σ and 2σ contours" },
  { key: "generation", label: "Generation", short: "Gen" },
  { key: "meanPath", label: "Mean path", short: "Mean" },
  { key: "observations", label: "Observations", short: "Points" },
] as const satisfies readonly PlotLayerItem[]).map((item) => ({ ...item, ariaLabel: item.label }));
const densityLayers = ["good", "bad", "acquisition"] as const;

const initialView = { yaw: -0.65, pitch: 0.5, zoom: 1 };
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const domainWidth = 10;
const emptyFloor = [] as const;
const constraintHintKey = "tpe-play-3d-constraint-hint-seen";
const constrainedModelDefaults = { ...twoParamDefaultModelSettings, infeasibleFilling: true };
const defaultSearch: SharedSearch<TwoParamObjectivePreset> = {
  seed: twoParamSettings.seed,
  preset: "multimodal",
  settings: { ...twoParamDefaultModelSettings, bandwidthRule: twoParamDefaultModelSettings.bandwidthRule ?? "constant" },
};

export default function Play3D({ sharedSettings = null, initialViewMode = "3d" }: { sharedSettings?: URLSearchParams | null; initialViewMode?: Play3DViewMode } = {}) {
  const [initialSearch] = useState(() => readPlay3DSharedSearch(
    sharedSettings, defaultSearch, twoParamObjectivePresets, twoParamSettings.count, domainWidth,
  ));
  const { ref: sceneRef, width: sceneWidth, height: sceneHeight, typeScale } = usePlotSize();
  const compact = sceneWidth < 640;
  const [playback, setPlayback] = useState(emptyTwoParamPlayback);
  const [cmaEsPlayback, setCmaEsPlayback] = useState(emptyTwoParamCmaEsPlayback);
  const [sampler, setSampler] = useState(initialSearch.sampler);
  const [cmaEsSettings, setCmaEsSettings] = useState(initialSearch.cmaEsSettings);
  const isCmaEs = sampler === "cmaes";
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const seekController = useRef<AbortController | null>(null);
  function cancelSeek() {
    seekController.current?.abort();
    seekController.current = null;
    setSeekTarget(null);
  }
  useEffect(() => () => seekController.current?.abort(), []);
  const [mode, setMode] = useState(initialSearch.mode);
  const [settings, setSettings] = useState<TwoParamModelSettings>(initialSearch.settings);
  const [objectivePreset, setObjectivePreset] = useState(initialSearch.preset);
  const [constraintPreset, setConstraintPreset] = useState(initialSearch.constraint);
  const [constraintHint, setConstraintHint] = useState(false);
  const [constraintHintSeen, setConstraintHintSeen] = useState(() => {
    try { return globalThis.sessionStorage?.getItem(constraintHintKey) === "1"; } catch { return false; }
  });
  const constrained = constraintPreset !== "none";
  const samplerDef = getSampler(sampler);
  const unsupported = !samplerDef.supportsConstraints && constrained;
  const searchSettings = useMemo(() => ({ ...settings, objectivePreset, constraintPreset }), [settings, objectivePreset, constraintPreset]);
  function changeConstraint(preset: TwoParamConstraintPreset) {
    setConstraintPreset(preset);
    if (preset === "none") setConstraintHint(false);
    else {
      setSettings(constrainSettings);
      if (!isCmaEs && !constraintHintSeen) {
        setConstraintHintSeen(true);
        setConstraintHint(true);
        try { globalThis.sessionStorage?.setItem(constraintHintKey, "1"); } catch { /* The page still remembers the hint. */ }
      }
    }
    restart();
  }
  const objectiveDefinition = getTwoParamObjective(objectivePreset);
  const objectiveView = useMemo(() => createTwoParamObjectiveView(objectivePreset, constraintPreset), [objectivePreset, constraintPreset]);
  const [heightScale, setHeightScale] = useState<ObjectiveHeightScale>("log");
  function editSettings(next: TwoParamModelSettings) {
    if (next.gamma !== settings.gamma) guide.retire("gamma");
    if (next.bandwidth !== settings.bandwidth) guide.retire("bandwidth");
    cancelSeek();
    setSettings(next);
    setPlaying(false);
    setInspection("");
  }
  function restart() {
    cancelSeek();
    setPlayback(emptyTwoParamPlayback());
    setCmaEsPlayback(emptyTwoParamCmaEsPlayback());
    setPlaying(false);
    setInspection("");
  }
  const [seed, setSeed] = useState(initialSearch.seed);
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(defaultPlaybackSpeed);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const activePlayback = isCmaEs ? cmaEsPlayback : playback;
  const step = activePlayback.trials.length;
  const complete = step === twoParamSettings.count;
  // Slider drags and seeks emit many updates per second. Rebuilding the model and
  // scene for each one queued more work than a phone could finish, freezing the
  // page. The deferred copy is rendered at low priority, interrupted by newer
  // input, so only the latest observations and settings are drawn.
  const liveSceneInput = useMemo(() => ({ trials: playback.trials, mode, settings: searchSettings }), [playback.trials, mode, searchSettings]);
  const sceneInput = useDeferredValue(liveSceneInput);
  const model = useMemo(() => isCmaEs ? null
    : measurePlay3D("model", () => buildTwoParamView(sceneInput.trials, sceneInput.mode, sceneInput.settings)), [isCmaEs, sceneInput]);
  const cmaEsModel = useMemo(() => isCmaEs && !unsupported
    ? measurePlay3D("model", () => buildTwoParamCmaEsView(cmaEsPlayback.trials, cmaEsSettings, objectivePreset)) : null,
  [isCmaEs, unsupported, cmaEsPlayback.trials, cmaEsSettings, objectivePreset]);
  const goodWidths = model?.fitted?.snapshot.groups.flatMap((group) => {
    const kernels = group.good.kernels.filter((kernel) => kernel.source.kind === "observation");
    return group.parameterIds.map((id) => ({
      label: id === "x1" ? "x₁" : "x₂",
      values: kernels.map((kernel) => kernel.bandwidths[id]),
    }));
  }) ?? [];
  const proposal = useMemo(() => {
    const { trials, mode, settings } = sceneInput;
    if (!model || trials.length === twoParamSettings.count) return null;
    return model.fitted && trials.length >= (settings.startupTrials ?? twoParamSettings.startupTrials) ? twoParamProposalFromTrace(model.fitted.propose(seed)) : proposeTwoParamTrial(trials, seed, mode, settings);
  }, [sceneInput, model, seed]);
  const nextPoint = useMemo(() => {
    if (!cmaEsModel) return proposal;
    return complete ? null : cmaEsModel.fitted.propose(seed).selected;
  }, [cmaEsModel, complete, proposal, seed]);
  useEffect(() => {
    if (!playing || unsupported) return;
    if (complete) { setPlaying(false); return; }
    const timer = window.setTimeout(() => {
      if (isCmaEs) setCmaEsPlayback((current) => moveTwoParamCmaEsPlayback(current, current.trials.length + 1, seed, cmaEsSettings, objectivePreset));
      else setPlayback((current) => moveTwoParamPlayback(current, current.trials.length + 1, seed, mode, searchSettings));
      setInspection("");
    }, 1000 / playbackSpeed);
    return () => window.clearTimeout(timer);
  }, [playing, playbackSpeed, complete, step, seed, mode, searchSettings, isCmaEs, unsupported, cmaEsSettings, objectivePreset]);
  function moveTpeTo(next: number, onComplete: (result: TwoParamPlayback) => void) {
    if (next <= playback.trials.length + 1) {
      onComplete(moveTwoParamPlayback(playback, next, seed, mode, searchSettings));
      return;
    }
    const controller = new AbortController();
    seekController.current = controller;
    setSeekTarget(next);
    void seekTwoParamPlayback(playback, next, seed, mode, searchSettings, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result) onComplete(result);
      seekController.current = null;
      setSeekTarget(null);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      seekController.current = null;
      setSeekTarget(null);
      setInspection(error instanceof Error ? error.message : "Could not complete the seek.");
    });
  }
  function moveTo(next: number) {
    if (unsupported) return;
    setPlaying(false);
    cancelSeek();
    setInspection("");
    if (isCmaEs) setCmaEsPlayback(moveTwoParamCmaEsPlayback(cmaEsPlayback, next, seed, cmaEsSettings, objectivePreset));
    else moveTpeTo(next, setPlayback);
  }
  function changeSampler(next: TwoParamSampler) {
    if (next === sampler) return;
    cancelSeek();
    setPlaying(false);
    setInspection("");
    setFocusedCandidate(null);
    setConstraintHint(false);
    if (next === "cmaes") {
      const from = emptyTwoParamCmaEsPlayback();
      setCmaEsPlayback(constrained ? from : moveTwoParamCmaEsPlayback(from, step, seed, cmaEsSettings, objectivePreset));
      setSampler(next);
    } else {
      moveTpeTo(step, (result) => {
        setPlayback(result);
        setSampler(next);
      });
    }
  }
  function editCmaEsSettings(next: TwoParamCmaEsSettings) {
    cancelSeek();
    setPlaying(false);
    setInspection("");
    setCmaEsSettings(next);
    if (!unsupported) setCmaEsPlayback(moveTwoParamCmaEsPlayback(emptyTwoParamCmaEsPlayback(), step, seed, next, objectivePreset));
  }

  const [visible, setVisible] = useState<Record<Layer, boolean>>({ objective: true, good: true, bad: true, observations: true, candidates: true, acquisition: false });
  const [cmaEsVisible, setCmaEsVisible] = useState({ objective: true, ellipse: true, generation: true, meanPath: true, observations: true });
  const objectiveVisible = isCmaEs ? cmaEsVisible.objective : visible.objective;
  const observationsVisible = isCmaEs ? cmaEsVisible.observations : visible.observations;
  const guide = usePlayGuide({ page: "play-3d", step: playback.trials.length, startupTrials: settings.startupTrials, acquisitionVisible: visible.acquisition, seeking: seekTarget !== null }, !constraintHint && !isCmaEs);
  useEffect(() => {
    if (!constraintHint) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented && !guide.workspaceRef.current?.querySelector("dialog[open]")) {
        event.preventDefault();
        setConstraintHint(false);
        if (document.activeElement?.closest(".lab-guide")) guide.workspaceRef.current?.querySelector<HTMLElement>(".settings-toggle")?.focus();
      }
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [constraintHint, guide.workspaceRef]);
  const guideAcquisition = guide.active === "acquisition";
  const [view, setView] = useState(initialView);
  const [viewMode, setViewMode] = useState(initialViewMode);
  const [topView, setTopView] = useState(initialTopView);
  const isTop = viewMode === "top";
  const pannable = isTop && topView.zoom > 1;
  const topClipId = useId();
  const topLayout = useMemo(() => createTopViewLayout(sceneWidth, sceneHeight, topView), [sceneWidth, sceneHeight, topView]);
  const { x: plotX, y: plotY, size: plotSize } = topLayout.plotRect;
  const topClip = useMemo(() => ({ x: plotX, y: plotY, width: plotSize, height: plotSize }), [plotX, plotY, plotSize]);
  const topDrag = useRef<{ x: number; y: number; id: number } | null>(null);
  const topDidPan = useRef(false);
  const showRotateGuide = !isTop && guide.active === "rotate";
  const [inspection, setInspection] = useState("");
  const [focusedCandidate, setFocusedCandidate] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const cameraFrame = useRef<number | null>(null);
  const pendingRotation = useRef({ yaw: 0, pitch: 0 });
  useEffect(() => () => {
    if (cameraFrame.current !== null) cancelAnimationFrame(cameraFrame.current);
  }, []);
  function flushRotation() {
    if (cameraFrame.current !== null) cancelAnimationFrame(cameraFrame.current);
    cameraFrame.current = null;
    const { yaw, pitch } = pendingRotation.current;
    pendingRotation.current = { yaw: 0, pitch: 0 };
    if (yaw || pitch) rotate(yaw, pitch);
  }
  function endDrag(event: PointerEvent<SVGSVGElement>) {
    if (topDrag.current?.id === event.pointerId) topDrag.current = null;
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    flushRotation();
  }
  const objectiveHeight = (value: number) => 0.25 + 0.75 * objectiveView.normalize(value, heightScale);
  const cosYaw = Math.cos(view.yaw), sinYaw = Math.sin(view.yaw);
  const cosPitch = Math.cos(view.pitch), sinPitch = Math.sin(view.pitch);
  const project3D = (x: number, y: number, height: number) => {
    const u = x * cosYaw - y * sinYaw;
    const v = x * sinYaw + y * cosYaw;
    const z = height * 4;
    return { x: 500 + u * 48 * view.zoom, y: 350 + (v * sinPitch - z * cosPitch) * 48 * view.zoom, depth: v * cosPitch + z * sinPitch };
  };
  // Fit the projected unit-height volume; user zoom remains independent of fitting.
  const bounds = [-5, 5].flatMap((x) => [-5, 5].flatMap((y) => [0, 1].map((z) => {
    const p = project3D(x, y, z);
    return { x: 500 + (p.x - 500) / view.zoom, y: 350 + (p.y - 350) / view.zoom };
  })));
  const minX = Math.min(...bounds.map((p) => p.x)), maxX = Math.max(...bounds.map((p) => p.x));
  const minY = Math.min(...bounds.map((p) => p.y)), maxY = Math.max(...bounds.map((p) => p.y));
  const aspect = sceneWidth / sceneHeight;
  const fitWidth = Math.max(maxX - minX + 64, (maxY - minY + 96) * aspect);
  const fitHeight = fitWidth / aspect;
  const chartZoom = isTop ? 1 : fitWidth / sceneWidth;
  const labelScale = chartZoom * typeScale;
  const heightLabel = isCmaEs && (unsupported || !cmaEsVisible.ellipse) ? "Objective · 1" : "Objective / Density · 1";
  const heightLabelRef = useRef<SVGTextElement>(null);
  const [heightLabelWidth, setHeightLabelWidth] = useState(0);
  useLayoutEffect(() => {
    const label = heightLabelRef.current;
    if (label) setHeightLabelWidth(label.getComputedTextLength());
  }, [chartZoom, typeScale, isTop, heightLabel]);
  const viewX = (minX + maxX - fitWidth) / 2, viewY = (minY + maxY - fitHeight) / 2;
  const perspectiveBox = useMemo<Play3DViewBox>(() => ({ x: viewX, y: viewY, width: fitWidth, height: fitHeight }), [viewX, viewY, fitWidth, fitHeight]);
  const viewBox = isTop ? topLayout.viewBox : perspectiveBox;
  const sceneBox = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
  const projectFloor = (x1: number, x2: number) => isTop ? topLayout.project(x1, x2) : project3D(x1, x2, 0);
  const cmaEsSnapshot = cmaEsModel?.snapshot;
  const cmaEsBell = useMemo(() => !isTop && cmaEsSnapshot && cmaEsVisible.ellipse
    ? buildCmaEsBell(cmaEsSnapshot.ellipse) : [], [isTop, cmaEsSnapshot, cmaEsVisible.ellipse]);
  const highlightedGenIds = cmaEsVisible.generation && cmaEsModel
    ? (cmaEsModel.snapshot.generationProgress === 0 ? cmaEsModel.lastGenIds : cmaEsModel.currentGenIds) : null;
  function inspectAt(event: Pick<PointerEvent<SVGSVGElement>, "currentTarget" | "target" | "clientX" | "clientY">) {
    if (drag.current || topDrag.current || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fit = fitPlay3DViewBox(viewBox, rect.width, rect.height);
    const x = (event.clientX - rect.left - fit.x) / fit.scale;
    const y = (event.clientY - rect.top - fit.y) / fit.scale;
    if (isTop) {
      if (topLayout.contains(x, y)) {
        const candidateHit = hitTestPlay3DScene([], x, y, 3 / fit.scale, candidateScene.hitTargets, fit.scale);
        if (candidateHit && "inspect" in candidateHit) {
          candidateHit.inspect?.();
          return;
        }
      }
      const point = topLayout.unproject(x, y);
      if (!point) setInspection("");
      else if (model) setInspection(formatTopInspection(point, model, visible, objectiveView.feasible));
      else {
        const { x1, x2 } = point;
        const values = cmaEsModel && cmaEsVisible.ellipse ? cmaEsModel.evaluate(x1, x2) : null;
        const objective = values?.objective ?? objectiveDefinition.evaluate(x1, x2);
        const feasibility = objectiveView.feasible?.(x1, x2) === false ? " · Infeasible" : "";
        const density = values ? ` · CMA-ES log p(x) = ${values.logDensity.toPrecision(4)}` : "";
        setInspection(`x₁ = ${x1.toFixed(3)}, x₂ = ${x2.toFixed(3)} · f(x) = ${objective.toPrecision(4)}${feasibility}${density}`);
      }
      return;
    }
    // Surfaces and candidates are pixels now; find the topmost painted item.
    const hit = hitTestPlay3DScene(scene, x, y, 3 / fit.scale, candidateScene.hitTargets, fit.scale);
    if (hit && "inspect" in hit) hit.inspect?.();
  }
  // Keep compact-screen detail stable while dragging: reuse the resting mesh
  // instead of flattening peaks and rebuilding topology at each drag boundary.
  const objectiveStride = compact ? 2 : 1;
  const densityStride = compact ? 2 : 1;
  const objectiveMesh = useMemo(() => isTop ? [] : twoParamSurfaceMesh(objectiveView.grid, objectiveStride,
    (point) => objectiveHeight(point.objective)), [isTop, objectiveView, objectiveStride, heightScale]);
  const densityMeshes = useMemo(() => measurePlay3D("density-grid-mesh", () => {
    const mesh = (key: "good" | "bad" | "acquisition") => {
      if (isTop || !visible[key] || !model?.hasDensities) return [];
      const [low, high] = model.scales[key];
      return twoParamSurfaceMesh(model.grid, densityStride, (point) => (point[key] - low) / (high - low));
    };
    return { good: mesh("good"), bad: mesh("bad"), acquisition: mesh("acquisition") };
  }), [isTop, model, densityStride, visible.good, visible.bad, visible.acquisition]);
  function prepareSurface(mesh: TwoParamSurfaceVertex[][], key: Surface, label: string, evaluate: (x1: number, x2: number) => number, feasible?: (x1: number, x2: number) => boolean) {
    return prepareTwoParamSurface(mesh, key, (x1, x2) => {
      if (!drag.current) setInspection(`${label} · x₁ = ${x1.toFixed(2)}, x₂ = ${x2.toFixed(2)} · value = ${evaluate(x1, x2).toPrecision(4)}`);
    }, feasible);
  }
  const preparedObjective = useMemo(() => measurePlay3D("objective-surface-prepare", () => prepareSurface(objectiveMesh, "objective", "Objective contours", objectiveDefinition.evaluate, objectiveView.feasible)), [objectiveMesh, objectiveDefinition, objectiveView.feasible]);
  const preparedDensities = useMemo(() => measurePlay3D("density-surface-prepare", () => ({
    good: prepareSurface(densityMeshes.good, "good", "Good KDE ℓ(x)", (x1, x2) => model?.evaluate(x1, x2).good ?? 0),
    bad: prepareSurface(densityMeshes.bad, "bad", "Bad KDE g(x)", (x1, x2) => model?.evaluate(x1, x2).bad ?? 0),
    acquisition: prepareSurface(densityMeshes.acquisition, "acquisition", "Acquisition", (x1, x2) => model?.evaluate(x1, x2).acquisition ?? 0),
  })), [densityMeshes, model]);
  // Objective geometry and React elements do not depend on the trial history.
  // Reuse them on each search step, including the thousands of contour segments.
  const objectiveScene = useMemo(() => measurePlay3D("objective-project", () => {
    if (isTop || !objectiveVisible) return [];
    const items: Play3DSceneItem[] = projectTwoParamSurface(preparedObjective, project3D);
    objectiveView.contours.forEach(({ level, a, b, muted }, index) => {
      const start = project3D(a.x1, a.x2, objectiveHeight(level));
      const end = project3D(b.x1, b.x2, objectiveHeight(level));
      items.push({ id: `contour-${index}`, kind: "segment", muted, depth: (start.depth + end.depth) / 2 + 0.01, points: [start.x, start.y, end.x, end.y], inspect: () => { if (!drag.current) setInspection(`Objective contour · f(x) = ${level.toPrecision(4)}`); } });
    });
    for (const [lineIndex, line] of objectiveView.boundaries.entries()) {
      for (const onSurface of [false, true]) {
        const points = line.map(({ x1, x2, objective }) => project3D(x1, x2, onSurface ? objectiveHeight(objective) : 0));
        for (let index = 1; index < points.length; index++) {
          const a = points[index - 1], b = points[index];
          items.push({ id: `boundary-${lineIndex}-${onSurface}-${index}`, kind: "boundary", depth: (a.depth + b.depth) / 2 + 0.015, points: [a.x, a.y, b.x, b.y] });
        }
      }
    }
    return measurePlay3D("objective-sort", () => items.sort((a, b) => a.depth - b.depth));
  }), [isTop, preparedObjective, objectiveView, objectiveDefinition, heightScale, view, objectiveVisible]);
  const topTint = useMemo(() => isTop && objectiveVisible ? createTopObjectiveTint(objectiveDefinition.evaluate, objectiveView) : [],
    [isTop, objectiveVisible, objectiveDefinition, objectiveView]);
  const topFields = useMemo(() => isTop && model ? createTopFieldItems(model, visible) : [], [isTop, model, visible]);
  const projectTrial = (x1: number, x2: number, value: number) => isTop
    ? topLayout.project(x1, x2) : project3D(x1, x2, objectiveHeight(value));
  const candidateScene = useMemo(() => buildPlay3DCandidateScene(
    proposal,
    visible.candidates,
    isTop ? (x1, x2) => topLayout.project(x1, x2) : project3D,
    (label) => { if (!drag.current && !topDrag.current) setInspection(label); },
    isTop ? { tickDirection: 1, includeFloorAnchor: false } : { tickDirection: -1, includeFloorAnchor: true },
  // project3D depends only on the camera.
  ), [proposal, visible.candidates, isTop, topLayout, view]);
  const scene = useMemo(() => measurePlay3D("dynamic-project", () => {
    const items: Play3DSceneItem[] = [];
    if (isTop) {
      const line = (x1: number, x2: number, x3: number, x4: number) => {
        const a = topLayout.project(x1, x2), b = topLayout.project(x3, x4);
        return [a.x, a.y, b.x, b.y];
      };
      for (const item of topTint) {
        const [x1, x2, x3, x4] = item.points;
        items.push({ ...item, points: line(x1, x2, x3, x4) });
      }
      for (const tick of topTicks) {
        items.push(
          { id: `grid-x1-${tick}`, kind: "grid", depth: 0, points: line(tick, -5, tick, 5) },
          { id: `grid-x2-${tick}`, kind: "grid", depth: 0, points: line(-5, tick, 5, tick) },
        );
      }
      for (const item of topFields) {
        const [x1, x2, x3, x4] = item.points;
        items.push({ ...item, points: line(x1, x2, x3, x4) });
      }
      if (objectiveVisible) {
        objectiveView.contours.forEach(({ a, b, muted }, index) => {
          items.push({ id: `contour-${index}`, kind: "segment", muted, depth: 0, points: line(a.x1, a.x2, b.x1, b.x2) });
        });
        for (const [lineIndex, boundary] of objectiveView.boundaries.entries()) {
          for (let index = 1; index < boundary.length; index++) {
            const a = boundary[index - 1], b = boundary[index];
            items.push({ id: `boundary-${lineIndex}-${index}`, kind: "boundary", depth: 0, points: line(a.x1, a.x2, b.x1, b.x2) });
          }
        }
      }
      items.push(...candidateScene.items);
    } else {
      items.push(...candidateScene.items);
      for (const key of densityLayers) {
        if (!visible[key] || !model?.hasDensities) continue;
        items.push(...projectTwoParamSurface(preparedDensities[key], project3D));
      }
    }
    if (cmaEsSnapshot) items.push(...buildCmaEsScene(
      cmaEsSnapshot, cmaEsBell, isTop ? projectFloor : project3D, isTop, cmaEsVisible.ellipse, cmaEsVisible.meanPath, setInspection,
    ));
    const sceneTrials = cmaEsModel?.trials ?? model?.trials ?? [];
    if (observationsVisible) for (const trial of sceneTrials) {
      const p = projectTrial(trial.x1, trial.x2, trial.value);
      const group = cmaEsModel ? (highlightedGenIds?.has(trial.id) ? "cmaes-current" : "cmaes-past")
        : !model?.hasPartition ? "unclassified" : model.goodIds.has(trial.id) ? "good" : "bad";
      items.push({ id: `trial-${trial.id}`, kind: "trial", depth: p.depth + 0.02, x: p.x, y: p.y, group, feasible: model?.feasibleIds.has(trial.id) });
    }
    if (nextPoint) {
      const p = projectTrial(nextPoint.x1, nextPoint.x2, objectiveDefinition.evaluate(nextPoint.x1, nextPoint.x2));
      const floor = projectFloor(nextPoint.x1, nextPoint.x2);
      items.push({ id: "next-trial", kind: "proposal", depth: p.depth + 0.03, x: p.x, y: p.y, floorX: floor.x, floorY: floor.y });
    }
    if (isTop) return items;
    return measurePlay3D("merge-sort", () => mergeDepthSorted(objectiveScene, items.sort((a, b) => a.depth - b.depth)));
  // Projection and scaling depend exclusively on these immutable inputs.
  }), [model, view, visible, cmaEsModel, cmaEsSnapshot, cmaEsBell, cmaEsVisible, objectiveVisible, observationsVisible, highlightedGenIds, nextPoint, objectiveView, heightScale, objectiveScene, preparedDensities, candidateScene, isTop, topLayout, topTint, topFields]);
  // Painted markers live in the canvas; these invisible SVG twins keep trials
  // focusable, labelled and hoverable without adding per-frame paint work.
  const markerTargets = observationsVisible ? (cmaEsModel?.trials ?? model?.trials ?? []).map((trial) => {
    const p = projectTrial(trial.x1, trial.x2, trial.value);
    if (isTop && !topLayout.contains(p.x, p.y)) return null;
    const group = cmaEsModel ? (highlightedGenIds?.has(trial.id) ? " · Highlighted generation" : "")
      : !model?.hasPartition ? " · Unclassified" : model.goodIds.has(trial.id) ? " · Good" : " · Bad";
    const feasibility = !model || sceneInput.settings.constraintPreset === "none" ? "" : trial.violation === 0 ? " · Feasible" : ` · Infeasible · violation ${trial.violation.toPrecision(3)}`;
    const label = `Trial ${trial.id}${group}${feasibility} · x₁ = ${trial.x1.toFixed(2)}, x₂ = ${trial.x2.toFixed(2)} · f(x) = ${trial.value.toFixed(3)}`;
    return <circle key={`trial-${trial.id}`} cx={p.x} cy={p.y} r={4.5} className="observation-target-play-3d" tabIndex={0} aria-label={label} onFocus={() => setInspection(label)} onPointerEnter={(event) => { if (!drag.current && !topDrag.current && (!isTop || event.pointerType !== "touch")) setInspection(label); }} onClick={() => { if (isTop && !topDidPan.current) setInspection(label); }}><title>{label}</title></circle>;
  }) : null;
  const proposalLabel = nextPoint ? `Next evaluation · x₁ = ${nextPoint.x1.toFixed(3)}, x₂ = ${nextPoint.x2.toFixed(3)}` : null;
  const candidatesLabel = !visible.candidates || !proposal ? null
    : proposal.candidates.length > 0 ? `TPE candidates · ${proposal.candidates.length} joint sample${proposal.candidates.length === 1 ? "" : "s"} · arrow keys inspect candidates`
      : proposal.axisCandidates ? `TPE candidates · ${proposal.axisCandidates.x1.length} x₁ and ${proposal.axisCandidates.x2.length} x₂ axis sample${proposal.axisCandidates.x1.length === 1 ? "" : "s"} · arrow keys inspect candidates`
        : null;
  const activeCandidateIndex = focusedCandidate !== null && focusedCandidate < candidateScene.inspectorEntries.length
    ? focusedCandidate
    : candidateScene.defaultInspectorIndex;
  const activeCandidateEntry = candidateScene.inspectorEntries[activeCandidateIndex] ?? null;
  const optimumMarker = (() => {
    if (!objectiveVisible) return null;
    const optimum = objectiveView.optimum;
    const p = projectTrial(optimum.x1, optimum.x2, optimum.value);
    if (isTop && !topLayout.contains(p.x, p.y)) return null;
    const label = `${constrained ? "Constrained optimum" : objectivePreset === "multimodal" ? "Estimated optimum" : "Optimum"} · x₁ = ${optimum.x1.toFixed(3)}, x₂ = ${optimum.x2.toFixed(3)} · f(x) = ${optimum.value.toPrecision(4)}`;
    return <g className="optimum-play-3d" role="img" tabIndex={0} aria-label={label} onFocus={() => setInspection(label)} onPointerEnter={(event) => { if (!drag.current && !topDrag.current && (!isTop || event.pointerType !== "touch")) setInspection(label); }} onClick={() => { if (isTop && !topDidPan.current) setInspection(label); }}>
      <title>{label}</title><path d={`M${p.x},${p.y - 7} l7,7 l-7,7 l-7,-7 Z`} /><text x={p.x + 12 * labelScale} y={p.y - 12 * labelScale}>{constrained ? "Constrained optimum" : `Optimum (${optimum.x1.toFixed(objectivePreset === "multimodal" ? 2 : 1)}, ${optimum.x2.toFixed(objectivePreset === "multimodal" ? 2 : 1)})`}</text>
    </g>;
  })();
  const meanMarker = (() => {
    if (!cmaEsSnapshot || !cmaEsVisible.meanPath) return null;
    const { mean, generation, sigma } = cmaEsSnapshot;
    const p = projectFloor(mean.x1, mean.x2);
    if (isTop && !topLayout.contains(p.x, p.y)) return null;
    const label = `CMA-ES mean · Gen ${generation} · m = (${mean.x1.toFixed(2)}, ${mean.x2.toFixed(2)}) · σ = ${sigma.toPrecision(3)}`;
    return <circle cx={p.x} cy={p.y} r={8 * chartZoom} className="observation-target-play-3d" role="img" tabIndex={0} aria-label={label}
      onFocus={() => setInspection(label)} onPointerEnter={(event) => {
        if (!drag.current && !topDrag.current && (!isTop || event.pointerType !== "touch")) setInspection(label);
      }} onClick={() => { if (isTop && !topDidPan.current) setInspection(label); }}><title>{label}</title></circle>;
  })();
  const clipEllipseToFloor = !isTop && !!cmaEsSnapshot && cmaEsVisible.ellipse;
  const floorOutline = useMemo(() => clipEllipseToFloor
    ? [[-5, -5], [5, -5], [5, 5], [-5, 5]].map(([x1, x2]) => project3D(x1, x2, 0)) : undefined,
  [clipEllipseToFloor, view]);
  const floor = useMemo(() => topTicks.flatMap((tick) => [[project3D(tick, -5, 0), project3D(tick, 5, 0)], [project3D(-5, tick, 0), project3D(5, tick, 0)]].map(([a, b]) => [a.x, a.y, b.x, b.y] as const)),
  // project depends only on the camera.
  [view]);
  const origin = project3D(-5, -5, 0);
  const x1End = project3D(5, -5, 0);
  const heightEnd = project3D(-5, -5, 1);
  const axes = [{ end: x1End, label: "x₁", value: "5" }, { end: project3D(-5, 5, 0), label: "x₂", value: "5" }];
  // Give the origin caption room on narrow plots and place the height caption
  // on the other side of its tick when the projected x₁ label crowds it.
  const originLabelInset = 32 * labelScale;
  const originLabelX = clamp(origin.x, viewX + originLabelInset, viewX + fitWidth - originLabelInset);
  const heightLabelAnchor = heightEnd.x - viewX > heightLabelWidth
    && x1End.x >= heightEnd.x && x1End.x - heightEnd.x < heightLabelWidth
    && Math.abs(x1End.y - heightEnd.y) < 16 * labelScale ? "end" : "start";
  function rotate(yaw: number, pitch: number) {
    guide.retire("rotate");
    setView((v) => ({ ...v, yaw: v.yaw + yaw, pitch: clamp(v.pitch + pitch, 0.15, 1.4) }));
  }
  function zoom(factor: number) {
    guide.retire("rotate");
    if (isTop) setTopView((v) => clampTopPan({ ...v, zoom: v.zoom * factor }));
    else setView((v) => ({ ...v, zoom: clamp(v.zoom * factor, 0.55, 1.7) }));
  }
  function changeViewMode(next: Play3DViewMode) {
    if (next === viewMode) return;
    flushRotation();
    drag.current = null;
    topDrag.current = null;
    setInspection("");
    if (next === "top") guide.retire("rotate");
    setViewMode(next);
  }
  function pan(dx: number, dy: number) {
    setTopView((v) => clampTopPan({ ...v, panX: v.panX + dx, panY: v.panY + dy }));
  }
  function onScenePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || drag.current || topDrag.current) return;
    if (isTop) {
      topDidPan.current = false;
      if (pannable) topDrag.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      return;
    }
    inspectAt(event);
    drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onScenePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (isTop) {
      const last = topDrag.current;
      if (!last) {
        if (event.pointerType !== "touch") inspectAt(event);
        return;
      }
      if (last.id !== event.pointerId) return;
      const dx = event.clientX - last.x, dy = event.clientY - last.y;
      if (!topDidPan.current) {
        if (Math.hypot(dx, dy) < 4) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        topDidPan.current = true;
        setInspection("");
      }
      topDrag.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      const rect = event.currentTarget.getBoundingClientRect();
      const size = plotSize * fitPlay3DViewBox(viewBox, rect.width, rect.height).scale;
      pan(dx / size, dy / size);
      return;
    }
    const last = drag.current;
    if (!last) { inspectAt(event); return; }
    if (last.id !== event.pointerId) return;
    pendingRotation.current.yaw += (event.clientX - last.x) * 0.008;
    pendingRotation.current.pitch += (event.clientY - last.y) * 0.008;
    drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    if (cameraFrame.current === null) cameraFrame.current = requestAnimationFrame(flushRotation);
  }
  function onSceneKeyDown(event: ReactKeyboardEvent<SVGSVGElement>) {
    if (["+", "=", "-"].includes(event.key)) {
      event.preventDefault();
      zoom(event.key === "-" ? 1 / 1.15 : 1.15);
      return;
    }
    const dx = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const dy = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if ((!dx && !dy) || (isTop && !pannable)) return;
    event.preventDefault();
    if (isTop) pan(dx * 0.08, dy * 0.08);
    else rotate(dx * 0.12, -dy * 0.1);
  }
  const plotBottom = plotY + plotSize;
  const candidateInspector = candidatesLabel && activeCandidateEntry ? <g className="candidates-play-3d" role="group" tabIndex={0} aria-label={`${candidatesLabel} · ${activeCandidateEntry.label}`}
    onFocus={() => {
      setFocusedCandidate(candidateScene.defaultInspectorIndex);
      const entry = candidateScene.inspectorEntries[candidateScene.defaultInspectorIndex];
      if (entry) setInspection(entry.label);
    }}
    onBlur={() => setFocusedCandidate(null)}
    onKeyDown={(event) => {
      const entries = candidateScene.inspectorEntries;
      if (!entries.length) return;
      let next: number | null = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (activeCandidateIndex + 1) % entries.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (activeCandidateIndex - 1 + entries.length) % entries.length;
      else if (event.key === "Home") next = candidateScene.defaultInspectorIndex;
      else if (event.key === "End") next = entries.length - 1;
      if (next === null) return;
      event.preventDefault();
      event.stopPropagation();
      setFocusedCandidate(next);
      setInspection(entries[next].label);
    }}>
    <title>{`${candidatesLabel} · ${activeCandidateEntry.label}`}</title>
    <circle cx={activeCandidateEntry.x} cy={activeCandidateEntry.y} r={7} className="candidate-focus-target-play-3d" />
  </g> : null;
  const markers = <>{markerTargets}{candidateInspector}{proposalLabel && <g className="proposal-play-3d" aria-label={proposalLabel}><title>{proposalLabel}</title></g>}{optimumMarker}{meanMarker}</>;
  const feasibleTrials = constrained ? activePlayback.trials.filter((trial) => trial.violation === 0) : activePlayback.trials;
  const feasibleCount = `${feasibleTrials.length} / ${step} feasible`;
  const bestValue = feasibleTrials.length ? Math.min(...feasibleTrials.map((trial) => trial.value)).toFixed(3) : "—";
  const noFeasibleGood = proposal?.trace.method === "random" && proposal.trace.reason === "no-feasible-good";
  const cmaEsStatus = unsupported ? `${samplerDef.label} · constraints unsupported` : complete ? "Search complete"
    : cmaEsSnapshot ? `CMA-ES · gen ${cmaEsSnapshot.generation} (${cmaEsSnapshot.generationProgress}/${cmaEsSettings.populationSize}) · trial ${step + 1}` : "";
  const newSeed = () => { setSeed(Math.floor(Math.random() * 100)); restart(); };
  const experimentSettings = <>
    <div className="scene-toolbar-group">
      <div className="objective-picker parameter">
        <div className="parameter-label"><label htmlFor="objective-preset-play-3d">Objective</label><Help label="Play 3D objective preset"><strong>{objectiveDefinition.label}</strong><br />{objectiveDefinition.description} Minimize over <HelpMath inline tex="[-5,5]^2" />:<HelpMath tex={objectiveDefinition.formula} />Changing it restarts the search.</Help></div><select id="objective-preset-play-3d" value={objectivePreset} onChange={(event) => { setObjectivePreset(event.target.value as TwoParamObjectivePreset); restart(); }}>{(Object.keys(twoParamObjectivePresets) as TwoParamObjectivePreset[]).map((preset) => <option key={preset} value={preset}>{twoParamObjectivePresets[preset].label}</option>)}</select>
      </div>
    </div>
    <Play3DConstraintSettings preset={constraintPreset} infeasibleFilling={settings.infeasibleFilling ?? true} onPresetChange={changeConstraint}
      onFillingChange={isCmaEs ? undefined : (infeasibleFilling) => editSettings({ ...settings, infeasibleFilling })} />
  </>;
  return <section className="visual-workspace play-3d" ref={guide.workspaceRef} onKeyDown={guide.onKeyDown} aria-labelledby="play-3d-heading">
    <div className="canvas-plot">
    <div className="canvas-controls">
    <PlaybackControls targetStep={seekTarget} step={step} limit={twoParamSettings.count} playing={playing} speed={playbackSpeed} onSpeedChange={setPlaybackSpeed} guidePlay={guide.active === "playback"} guideDescribedBy={guide.textId} idSuffix="-play-3d" labelPrefix="Play 3D " describedBy="trial-seek-help-play-3d" onMove={moveTo} disabled={unsupported}
      onToggle={() => { cancelSeek(); if (complete) moveTo(0); setPlaying(!playing || complete); }} />
    <div className="sampler-toggle" role="group" aria-label="Play 3D sampler">
      {samplersForPage("play-3d").map(({ id, label }) => <button key={id} type="button" aria-pressed={sampler === id} onClick={() => changeSampler(id)}>{label}</button>)}
    </div>
    </div>
    {isCmaEs
      ? <PlotLegend ariaLabel="Play 3D plot layers" className="cmaes-legend" items={cmaEsLayers} visible={cmaEsVisible}
        onToggle={(key) => { setCmaEsVisible((current) => ({ ...current, [key]: !current[key] })); setInspection(""); }} />
      : <PlotLegend ariaLabel="Play 3D plot layers" visible={visible}
        items={layers.map((item) => {
          if (item.key === "observations" && constrained) return { ...item, label: "Observations · ✕ infeasible" };
          if (item.key === "acquisition" && guideAcquisition) return { ...item, guideTarget: true, describedBy: guide.textId };
          return item;
        })}
        onToggle={(key) => setVisible((current) => ({ ...current, [key]: !current[key] }))} />}
    {unsupported && <div className="cmaes-constraint-notice" role="status">
      <span>{samplerDef.label} does not support constraints.</span>
      <span className="cmaes-constraint-actions">
        <button type="button" onClick={() => changeConstraint("none")}>Remove constraint</button>
        <button type="button" onClick={() => changeSampler("tpe")}>Switch to TPE</button>
      </span>
    </div>}
    <div className="scene-stage">
    <Play3DCanvas items={scene} floor={isTop ? emptyFloor : floor} viewBox={viewBox} clipRect={isTop ? topClip : undefined} floorOutline={floorOutline} />
    <svg className={`scene-play-3d${isTop ? " is-top" : ""}${pannable ? " is-pannable" : ""}`} ref={sceneRef} viewBox={sceneBox} style={{ "--chart-zoom": chartZoom } as CSSProperties} role="group" aria-label={isCmaEs ? `Interactive ${isTop ? "top-down" : "3D"} objective and CMA-ES view` : isTop ? "Interactive top-down objective and density contours" : "Interactive 3D landscape and KDE surfaces"} data-guide-target={showRotateGuide || undefined} aria-describedby={showRotateGuide ? `view-help ${guide.textId}` : "view-help"} tabIndex={0}
      onPointerDown={onScenePointerDown} onPointerMove={onScenePointerMove}
      onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
      onPointerLeave={(event) => {
        if (!isTop || event.pointerType === "touch" || (topDrag.current && topDidPan.current)) return;
        endDrag(event);
        setInspection("");
      }}
      onClick={(event) => { if (isTop && !topDidPan.current) inspectAt(event); }}
      onKeyDown={onSceneKeyDown}>
      <title>{isCmaEs ? "Objective, CMA-ES Gaussian distribution and mean path" : isTop ? "Objective and density contours viewed from above" : "Objective landscape, good and bad densities, and optional log density ratio"}</title>
      {isTop ? <>
        <defs><clipPath id={topClipId}><rect {...topClip} /></clipPath></defs>
        <g clipPath={`url(#${topClipId})`}>{markers}</g>
        <g className="axes-play-3d" pointerEvents="none">
          <line x1={plotX} y1={plotY} x2={plotX} y2={plotBottom} />
          <line x1={plotX} y1={plotBottom} x2={plotX + plotSize} y2={plotBottom} />
          {topTicks.map((tick) => {
            const { x, y } = topLayout.project(tick, tick);
            const label = String(tick).replace("-", "−");
            return <g key={tick}>
              {topLayout.contains(x, plotBottom) && <>
                <line x1={x} y1={plotBottom} x2={x} y2={plotBottom + 4} />
                <text x={x} y={plotBottom + 17 * labelScale} textAnchor="middle">{label}</text>
              </>}
              {topLayout.contains(plotX, y) && <>
                <line x1={plotX - 4} y1={y} x2={plotX} y2={y} />
                <text x={plotX - 8} y={y} dominantBaseline="central" textAnchor="end">{label}</text>
              </>}
            </g>;
          })}
          <text x={plotX + plotSize / 2} y={plotBottom + 34 * labelScale} textAnchor="middle">x₁</text>
          <text x={plotX - 38} y={plotY + plotSize / 2} dominantBaseline="central" textAnchor="middle">x₂</text>
        </g>
      </> : <>
        {markers}
        <g className="axes-play-3d" pointerEvents="none">
          {axes.map(({ end, label, value }) => <g key={label}><line x1={origin.x} y1={origin.y} x2={end.x} y2={end.y} /><text x={end.x} y={end.y - 12 * labelScale} textAnchor="middle">{label} · {value}</text></g>)}
          <line x1={origin.x} y1={origin.y} x2={heightEnd.x} y2={heightEnd.y} />
          <text ref={heightLabelRef} x={heightEnd.x} y={heightEnd.y - 12 * labelScale} textAnchor={heightLabelAnchor}>{heightLabel}</text>
          <text x={originLabelX} y={origin.y + 24 * labelScale} textAnchor="middle">−5, −5 · 0</text>
        </g>
      </>}
    </svg>
      <div className="view-controls">
        {!isTop && <label className="objective-height-control">Objective height <select aria-label="Objective height scale" value={heightScale} onChange={(event) => setHeightScale(event.target.value as ObjectiveHeightScale)}><option value="linear">Linear</option><option value="log">Log1p</option></select></label>}
        <span id="view-help" className="sr-only">{isTop ? "Hover or tap to inspect coordinates · + / − zoom · drag or use arrow keys to pan when zoomed" : "Drag to rotate · arrow keys rotate · + / − zoom"}</span>
        <div className="view-actions">
          <div className="view-mode-toggle" role="group" aria-label="View mode">
            <button aria-pressed={!isTop} onClick={() => changeViewMode("3d")}>3D</button>
            <button aria-pressed={isTop} onClick={() => changeViewMode("top")}>Top</button>
          </div>
          <button onClick={() => zoom(1.15)} aria-label="Zoom in">+</button>
          <button onClick={() => zoom(1 / 1.15)} aria-label="Zoom out" disabled={isTop && !pannable}>−</button>
          <button onClick={() => { if (isTop) setTopView(initialTopView); else setView(initialView); }}>Reset view</button>
        </div>
      </div>
    </div>
    <details className="scaling-play-3d"><summary aria-label="How to read this view">?</summary><div className="scaling-content">
      <h3>How to read this view</h3>
      {isCmaEs ? <>
        <p>{isTop ? "Hover or tap the map to inspect coordinates, objective values, and log density when Distribution is visible." : "Drag or use arrow keys to rotate. Hover the bell to inspect relative density and log density."} Use + / − to zoom.</p>
        <p>The green bell in 3D shows the current CMA-ES multivariate Gaussian N(m, σ²C), normalized to a peak of 1. The solid 1σ and dashed 2σ rings appear on the bell and on the floor. In Top view, stronger green shading marks higher density.</p>
        <p>The Mean path traces how the distribution center m moved generation by generation (m₀ → m<sub>g</sub>). Each dot marks an earlier generation and the diamond marks the current mean. Focus it to inspect the generation and σ.</p>
        <p>Green points mark the active generation, or the last finished generation until a new trial arrives. CMA-ES updates its mean and covariance after each population. The hollow marker is the next evaluation.</p>
      </> : isTop ? <>
        <p>Hover or tap the map to inspect coordinates and values. Use + / − to zoom, then drag or use arrow keys to pan.</p>
        <p>Lines trace equal values of the objective and visible fitted layers. Stronger shading marks higher values within each fitted layer. When Acquisition has positive values, it highlights regions where ℓ(x) &gt; g(x).</p>
        <p>{constrained ? "The diamond marks the constrained optimum and the boundary outlines the feasible region. ✕ marks infeasible trials. KDEs appear after 2 observations if Good has trials or a prior." : "The diamond marks the optimum (estimated for Multimodal). KDEs appear after 2 observations."} The hollow marker is the next evaluation. {mode === "univariate" ? "When TPE proposes, axis ticks show per-coordinate candidates and dashed lines combine their winners." : "When TPE proposes, dots show sampled candidates and the ringed anchor marks the winner."}</p>
      </> : <>
      <p>Drag or use arrow keys to rotate; + / − to zoom. Hover the surface or focus an observation to read its values.</p>
      <p>The faint surface is the objective; {constrained ? "the diamond marks the constrained optimum and the boundary outlines the feasible region. ✕ marks infeasible trials. KDEs appear after 2 observations if Good has trials or a prior." : "the diamond marks its optimum (estimated for Multimodal). KDEs appear after 2 observations."} The hollow marker is the next evaluation. {mode === "univariate" ? "When TPE proposes, axis ticks show per-coordinate candidates and dashed floor lines combine their winners." : "When TPE proposes, floor dots show sampled candidates and the ringed anchor marks the winner."}</p>
      <p>Heights are rescaled to share one view: Linear keeps relative heights; Log1p expands the valley floor. Scaling never changes the optimizer, and hover shows original values.</p>
      </>}
    </div></details>
    <div className="scene-inspection" aria-live="polite">{seekTarget === null ? inspection : `Moving to trial ${seekTarget}…`}</div>
    {constraintHint && <LabHintBubble textId="constraint-hint-text-play-3d" message="✕ marks trials that break the constraint. TPE fills open spots in the Good group with the trials that break it least. Turn Infeasible filling off in Settings to compare." phase="meaning" placement="bottom" onDismiss={(keyboard) => {
      setConstraintHint(false);
      if (keyboard) guide.workspaceRef.current?.querySelector<HTMLElement>(".settings-toggle")?.focus();
    }} />}
    {guide.active && (guide.active !== "rotate" || showRotateGuide) && <LabHintBubble textId={guide.textId} message={playGuides[guide.active].action} phase="action" placement="bottom" onDismiss={guide.dismiss} />}
    </div>

    <h2 id="play-3d-heading" className="sr-only">Explore two dimensions</h2>
    {isCmaEs ? <CmaEsSettingsPanel experiment={{ page: "play-3d", sampler, preset: objectivePreset, constraint: constraintPreset, cmaEsSettings }}
      onChange={editCmaEsSettings} seed={seed} onNewSeed={newSeed} status={cmaEsStatus}>{experimentSettings}</CmaEsSettingsPanel>
    : <ModelSettingsPanel experiment={{ page: "play-3d", preset: objectivePreset, mode, constraint: constraintPreset, settings }} className="settings-play-3d" idSuffix="-play-3d" labelPrefix="Play 3D " defaultSettings={constrained ? constrainedModelDefaults : twoParamDefaultModelSettings} trialLimit={twoParamSettings.count} domainWidth={domainWidth} widths={goodWidths} disableEi={constrained} guide={guide.settingsGuide} onChange={editSettings} seed={seed} onNewSeed={newSeed}
      status={<div className="proposal">
        <span>{!proposal ? "Search complete" : noFeasibleGood ? `Uniform random · trial ${step + 1}` : proposal.method === "random" ? `Random start · ${step + 1} / ${settings.startupTrials}` : `TPE · trial ${step + 1}`}</span>
        <Help label="Play 3D trial playback">
          {!proposal ? `Search complete. All ${twoParamSettings.count} trials evaluated.` : noFeasibleGood ? "There is no Good group yet. The next trial is a uniform random draw." : proposal.method === "random"
            ? `Initial random exploration · ${step + 1} / ${settings.startupTrials}. ${settings.startupTrials === twoParamSettings.count ? "Every trial in this search is random." : `Uniform random draw until TPE starts at trial ${settings.startupTrials + 1}.`}`
            : `TPE proposal · trial ${step + 1}. Drew ${sceneInput.settings.candidates} candidate${sceneInput.settings.candidates === 1 ? "" : "s"}${sceneInput.mode === "univariate" ? " per coordinate from ℓ and picked the highest ℓ/g for each." : " from ℓ(x) and picked the highest ℓ(x)/g(x)."}`}{" "}
          <span id="trial-seek-help-play-3d">Seeking back discards later trials.</span>
        </Help>
        {constrained && <span> · {feasibleCount}</span>}
      </div>}>
      {experimentSettings}
      <div className="scene-toolbar-group">
        <div className="parameter density-picker"><div className="parameter-label"><label className="sr-only" htmlFor="density-mode">Density model</label><Help label="Play 3D density model"><strong>{mode === "multivariate" ? "Multivariate" : "Univariate"}</strong><br />Multivariate: kernels span both coordinates, keeping each (x₁, x₂) pair together. Univariate: each coordinate has its own KDE and candidate draw.</Help></div><select id="density-mode" value={mode} onChange={(event) => { cancelSeek(); setMode(event.target.value as DensityMode); setPlaying(false); setInspection(""); }}><option value="multivariate">Multivariate</option><option value="univariate">Univariate</option></select></div>
        </div>
    </ModelSettingsPanel>}
    <details className="performance-monitor" onToggle={(event) => setComparisonOpen(event.currentTarget.open)}>
      <summary><span className="performance-caption">Best f(x) <strong title={bestValue}>{bestValue}</strong></span><span>Performance <span aria-hidden="true">⌄</span></span></summary>
      {comparisonOpen && <Play3DPerformance trials={activePlayback.trials} proposals={activePlayback.proposals} seed={seed} objectivePreset={objectivePreset} constraintPreset={constraintPreset} mode={mode} settings={settings} sampler={sampler} cmaEsSettings={cmaEsSettings} />}
    </details>
  </section>;
}
