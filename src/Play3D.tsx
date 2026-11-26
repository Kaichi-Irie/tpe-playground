import { twoParamConstraintPresets, getTwoParamConstraint, type TwoParamConstraintPreset } from "./twoParamConstraints";
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
import { Help } from "./Help";
import { HelpMath } from "./HelpMath";
import { constrainSettings } from "./searchSettings";
import { readPlay3DSharedSearch, type SharedSearch } from "./shareSearch";
import { useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from "react";
import { buildTwoParamView, twoParamDefaultModelSettings, getTwoParamObjective, twoParamObjectivePresets, emptyTwoParamPlayback, moveTwoParamPlayback, proposeTwoParamTrial, twoParamProposalFromTrace, twoParamSettings, type DensityMode, type TwoParamObjectivePreset, type TwoParamModelSettings } from "./twoParamTpe";

type Surface = "objective" | "good" | "bad" | "acquisition";
type Layer = Surface | "observations";
const layers: { key: Layer; label: string }[] = [
  { key: "objective", label: "Objective contours" }, { key: "good", label: "Good KDE ℓ(x)" },
  { key: "bad", label: "Bad KDE g(x)" }, { key: "observations", label: "Observations" },
  { key: "acquisition", label: "Acquisition" },
];
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
  const searchSettings = useMemo(() => ({ ...settings, objectivePreset, constraintPreset }), [settings, objectivePreset, constraintPreset]);
  function changeConstraint(preset: TwoParamConstraintPreset) {
    setConstraintPreset(preset);
    if (preset === "none") setConstraintHint(false);
    else {
      setSettings(constrainSettings);
      if (!constraintHintSeen) {
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
    setPlaying(false);
    setInspection("");
  }
  const [seed, setSeed] = useState(initialSearch.seed);
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(defaultPlaybackSpeed);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const step = playback.trials.length;
  const complete = step === twoParamSettings.count;
  // Slider drags and seeks emit many updates per second. Rebuilding the model and
  // scene for each one queued more work than a phone could finish, freezing the
  // page. The deferred copy is rendered at low priority, interrupted by newer
  // input, so only the latest observations and settings are drawn.
  const liveSceneInput = useMemo(() => ({ trials: playback.trials, mode, settings: searchSettings }), [playback.trials, mode, searchSettings]);
  const sceneInput = useDeferredValue(liveSceneInput);
  const model = useMemo(() => measurePlay3D("model", () => buildTwoParamView(sceneInput.trials, sceneInput.mode, sceneInput.settings)), [sceneInput]);
  const goodWidths = model.fitted?.snapshot.groups.flatMap((group) => {
    const kernels = group.good.kernels.filter((kernel) => kernel.source.kind === "observation");
    return group.parameterIds.map((id) => ({
      label: id === "x1" ? "x₁" : "x₂",
      values: kernels.map((kernel) => kernel.bandwidths[id]),
    }));
  }) ?? [];
  const proposal = useMemo(() => {
    const { trials, mode, settings } = sceneInput;
    if (trials.length === twoParamSettings.count) return null;
    return model.fitted && trials.length >= (settings.startupTrials ?? twoParamSettings.startupTrials) ? twoParamProposalFromTrace(model.fitted.propose(seed)) : proposeTwoParamTrial(trials, seed, mode, settings);
  }, [sceneInput, model.fitted, seed]);
  useEffect(() => {
    if (!playing) return;
    if (complete) { setPlaying(false); return; }
    const timer = window.setTimeout(() => {
      setPlayback((current) => moveTwoParamPlayback(current, current.trials.length + 1, seed, mode, searchSettings));
      setInspection("");
    }, 1000 / playbackSpeed);
    return () => window.clearTimeout(timer);
  }, [playing, playbackSpeed, complete, step, seed, mode, searchSettings]);
  function moveTo(next: number) {
    setPlaying(false);
    cancelSeek();
    setInspection("");
    if (next <= step + 1) {
      setPlayback(moveTwoParamPlayback(playback, next, seed, mode, searchSettings));
      return;
    }
    const controller = new AbortController();
    seekController.current = controller;
    setSeekTarget(next);
    void seekTwoParamPlayback(playback, next, seed, mode, searchSettings, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result) setPlayback(result);
      seekController.current = null;
      setSeekTarget(null);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      seekController.current = null;
      setSeekTarget(null);
      setInspection(error instanceof Error ? error.message : "Could not complete the seek.");
    });
  }

  const [visible, setVisible] = useState<Record<Layer, boolean>>({ objective: true, good: true, bad: true, observations: true, acquisition: false });
  const guide = usePlayGuide({ page: "play-3d", step, startupTrials: settings.startupTrials, acquisitionVisible: visible.acquisition, seeking: seekTarget !== null }, !constraintHint);
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
  const scale = (layer: Surface, value: number) => {
    if (layer === "objective") return 0.25 + 0.75 * objectiveView.normalize(value, heightScale);
    const [low, high] = model.scales[layer];
    const normalized = (value - low) / (high - low);
    return normalized;
  };
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
  const heightLabelRef = useRef<SVGTextElement>(null);
  const [heightLabelWidth, setHeightLabelWidth] = useState(0);
  useLayoutEffect(() => {
    const label = heightLabelRef.current;
    if (label) setHeightLabelWidth(label.getComputedTextLength());
  }, [chartZoom, typeScale, isTop]);
  const viewX = (minX + maxX - fitWidth) / 2, viewY = (minY + maxY - fitHeight) / 2;
  const perspectiveBox = useMemo<Play3DViewBox>(() => ({ x: viewX, y: viewY, width: fitWidth, height: fitHeight }), [viewX, viewY, fitWidth, fitHeight]);
  const viewBox = isTop ? topLayout.viewBox : perspectiveBox;
  const sceneBox = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
  function inspectAt(event: Pick<PointerEvent<SVGSVGElement>, "currentTarget" | "target" | "clientX" | "clientY">) {
    if (drag.current || topDrag.current || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fit = fitPlay3DViewBox(viewBox, rect.width, rect.height);
    const x = (event.clientX - rect.left - fit.x) / fit.scale;
    const y = (event.clientY - rect.top - fit.y) / fit.scale;
    if (isTop) {
      const point = topLayout.unproject(x, y);
      setInspection(point ? formatTopInspection(point, model, visible, objectiveView.feasible) : "");
      return;
    }
    // Surfaces are pixels now; find the topmost painted triangle or contour.
    const hit = hitTestPlay3DScene(scene, x, y, 3 / fit.scale);
    if (hit && (hit.kind === "triangle" || hit.kind === "segment")) hit.inspect?.();
  }
  // Keep compact-screen detail stable while dragging: reuse the resting mesh
  // instead of flattening peaks and rebuilding topology at each drag boundary.
  const objectiveStride = compact ? 2 : 1;
  const densityStride = compact ? 2 : 1;
  const objectiveMesh = useMemo(() => isTop ? [] : twoParamSurfaceMesh(objectiveView.grid, objectiveStride,
    (point) => 0.25 + 0.75 * objectiveView.normalize(point.objective, heightScale)), [isTop, objectiveView, objectiveStride, heightScale]);
  const densityMeshes = useMemo(() => measurePlay3D("density-grid-mesh", () => {
    const mesh = (key: "good" | "bad" | "acquisition") => {
      if (isTop || !visible[key] || !model.hasDensities) return [];
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
    good: prepareSurface(densityMeshes.good, "good", "Good KDE ℓ(x)", (x1, x2) => model.evaluate(x1, x2).good),
    bad: prepareSurface(densityMeshes.bad, "bad", "Bad KDE g(x)", (x1, x2) => model.evaluate(x1, x2).bad),
    acquisition: prepareSurface(densityMeshes.acquisition, "acquisition", "Acquisition", (x1, x2) => model.evaluate(x1, x2).acquisition),
  })), [densityMeshes, model]);
  // Objective geometry and React elements do not depend on the trial history.
  // Reuse them on each search step, including the thousands of contour segments.
  const objectiveScene = useMemo(() => measurePlay3D("objective-project", () => {
    if (isTop || !visible.objective) return [];
    const items: Play3DSceneItem[] = projectTwoParamSurface(preparedObjective, project3D);
    objectiveView.contours.forEach(({ level, a, b, muted }, index) => {
      const start = project3D(a.x1, a.x2, scale("objective", level));
      const end = project3D(b.x1, b.x2, scale("objective", level));
      items.push({ id: `contour-${index}`, kind: "segment", muted, depth: (start.depth + end.depth) / 2 + 0.01, points: [start.x, start.y, end.x, end.y], inspect: () => { if (!drag.current) setInspection(`Objective contour · f(x) = ${level.toPrecision(4)}`); } });
    });
    for (const [lineIndex, line] of objectiveView.boundaries.entries()) {
      for (const onSurface of [false, true]) {
        const points = line.map(({ x1, x2, objective }) => project3D(x1, x2, onSurface ? scale("objective", objective) : 0));
        for (let index = 1; index < points.length; index++) {
          const a = points[index - 1], b = points[index];
          items.push({ id: `boundary-${lineIndex}-${onSurface}-${index}`, kind: "boundary", depth: (a.depth + b.depth) / 2 + 0.015, points: [a.x, a.y, b.x, b.y] });
        }
      }
    }
    return measurePlay3D("objective-sort", () => items.sort((a, b) => a.depth - b.depth));
  }), [isTop, preparedObjective, objectiveView, objectiveDefinition, heightScale, view, visible.objective]);
  const topTint = useMemo(() => isTop && visible.objective ? createTopObjectiveTint(objectiveDefinition.evaluate, objectiveView) : [],
    [isTop, visible.objective, objectiveDefinition, objectiveView]);
  const topFields = useMemo(() => isTop ? createTopFieldItems(model, visible) : [], [isTop, model, visible]);
  const projectTrial = (x1: number, x2: number, value: number) => isTop
    ? topLayout.project(x1, x2) : project3D(x1, x2, scale("objective", value));
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
      if (visible.objective) {
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
    } else for (const { key } of layers) {
      if (key === "observations" || key === "objective" || !visible[key] || !model.hasDensities) continue;
      items.push(...projectTwoParamSurface(preparedDensities[key], project3D));
    }
    if (visible.observations) for (const trial of model.trials) {
      const p = projectTrial(trial.x1, trial.x2, trial.value);
      const group = !model.hasPartition ? "unclassified" : model.goodIds.has(trial.id) ? "good" : "bad";
      items.push({ id: `trial-${trial.id}`, kind: "trial", depth: p.depth + 0.02, x: p.x, y: p.y, group, feasible: model.feasibleIds.has(trial.id) });
    }
    if (proposal) {
      const p = projectTrial(proposal.x1, proposal.x2, objectiveDefinition.evaluate(proposal.x1, proposal.x2));
      const floor = isTop ? p : project3D(proposal.x1, proposal.x2, 0);
      items.push({ id: "next-trial", kind: "proposal", depth: p.depth + 0.03, x: p.x, y: p.y, floorX: floor.x, floorY: floor.y });
    }
    if (isTop) return items;
    return measurePlay3D("merge-sort", () => mergeDepthSorted(objectiveScene, items.sort((a, b) => a.depth - b.depth)));
  // Projection and scaling depend exclusively on these immutable inputs.
  }), [model, view, visible, proposal, objectiveView, heightScale, objectiveScene, preparedDensities, isTop, topLayout, topTint, topFields]);
  // Painted markers live in the canvas; these invisible SVG twins keep trials
  // focusable, labelled and hoverable without adding per-frame paint work.
  const markerTargets = visible.observations ? model.trials.map((trial) => {
    const p = projectTrial(trial.x1, trial.x2, trial.value);
    if (isTop && !topLayout.contains(p.x, p.y)) return null;
    const group = !model.hasPartition ? "Unclassified" : model.goodIds.has(trial.id) ? "Good" : "Bad";
    const feasibility = sceneInput.settings.constraintPreset === "none" ? "" : trial.violation === 0 ? " · Feasible" : ` · Infeasible · violation ${trial.violation.toPrecision(3)}`;
    const label = `Trial ${trial.id} · ${group}${feasibility} · x₁ = ${trial.x1.toFixed(2)}, x₂ = ${trial.x2.toFixed(2)} · f(x) = ${trial.value.toFixed(3)}`;
    return <circle key={`trial-${trial.id}`} cx={p.x} cy={p.y} r={4.5} className="observation-target-play-3d" tabIndex={0} aria-label={label} onFocus={() => setInspection(label)} onPointerEnter={(event) => { if (!drag.current && !topDrag.current && (!isTop || event.pointerType !== "touch")) setInspection(label); }} onClick={() => { if (isTop && !topDidPan.current) setInspection(label); }}><title>{label}</title></circle>;
  }) : null;
  const proposalLabel = proposal ? `Next evaluation · x₁ = ${proposal.x1.toFixed(3)}, x₂ = ${proposal.x2.toFixed(3)}` : null;
  const optimumMarker = (() => {
    if (!visible.objective) return null;
    const optimum = objectiveView.optimum;
    const p = projectTrial(optimum.x1, optimum.x2, optimum.value);
    if (isTop && !topLayout.contains(p.x, p.y)) return null;
    const label = `${constrained ? "Constrained optimum" : objectivePreset === "multimodal" ? "Estimated optimum" : "Optimum"} · x₁ = ${optimum.x1.toFixed(3)}, x₂ = ${optimum.x2.toFixed(3)} · f(x) = ${optimum.value.toPrecision(4)}`;
    return <g className="optimum-play-3d" role="img" tabIndex={0} aria-label={label} onFocus={() => setInspection(label)} onPointerEnter={(event) => { if (!drag.current && !topDrag.current && (!isTop || event.pointerType !== "touch")) setInspection(label); }} onClick={() => { if (isTop && !topDidPan.current) setInspection(label); }}>
      <title>{label}</title><path d={`M${p.x},${p.y - 7} l7,7 l-7,7 l-7,-7 Z`} /><text x={p.x + 12 * labelScale} y={p.y - 12 * labelScale}>{constrained ? "Constrained optimum" : `Optimum (${optimum.x1.toFixed(objectivePreset === "multimodal" ? 2 : 1)}, ${optimum.x2.toFixed(objectivePreset === "multimodal" ? 2 : 1)})`}</text>
    </g>;
  })();
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
  const markers = <>{markerTargets}{proposalLabel && <g className="proposal-play-3d" aria-label={proposalLabel}><title>{proposalLabel}</title></g>}{optimumMarker}</>;
  const feasibleTrials = constrained ? playback.trials.filter((trial) => trial.violation === 0) : playback.trials;
  const feasibleCount = `${feasibleTrials.length} / ${step} feasible`;
  const bestValue = feasibleTrials.length ? Math.min(...feasibleTrials.map((trial) => trial.value)).toFixed(3) : "—";
  const noFeasibleGood = proposal?.trace.method === "random" && proposal.trace.reason === "no-feasible-good";
  return <section className="visual-workspace play-3d" ref={guide.workspaceRef} onKeyDown={guide.onKeyDown} aria-labelledby="play-3d-heading">
    <div className="canvas-plot">
    <div className="canvas-controls">
    <PlaybackControls targetStep={seekTarget} step={step} limit={twoParamSettings.count} playing={playing} speed={playbackSpeed} onSpeedChange={setPlaybackSpeed} guidePlay={guide.active === "playback"} guideDescribedBy={guide.textId} idSuffix="-play-3d" labelPrefix="Play 3D " describedBy="trial-seek-help-play-3d" onMove={moveTo}
      onToggle={() => { cancelSeek(); if (complete) moveTo(0); setPlaying(!playing || complete); }} />

    </div>
    <div className="legend" aria-label="Play 3D plot layers">{layers.map(({ key, label }) => <button key={key} className={`layer ${key}`} aria-pressed={visible[key]} data-guide-target={key === "acquisition" && guideAcquisition || undefined} aria-describedby={key === "acquisition" && guideAcquisition ? guide.textId : undefined} onClick={() => setVisible((v) => ({ ...v, [key]: !v[key] }))}><span className="swatch" /><span className="layer-label">{key === "observations" && constrained ? "Observations · ✕ infeasible" : label}</span><span className="layer-short" aria-hidden="true">{key === "objective" ? "f(x)" : key === "good" ? "Good" : key === "bad" ? "Bad" : key === "observations" ? "Points" : "Acquisition"}</span></button>)}</div>
    <div className="scene-stage">
    <Play3DCanvas items={scene} floor={isTop ? emptyFloor : floor} viewBox={viewBox} clipRect={isTop ? topClip : undefined} />
    <svg className={`scene-play-3d${isTop ? " is-top" : ""}${pannable ? " is-pannable" : ""}`} ref={sceneRef} viewBox={sceneBox} style={{ "--chart-zoom": chartZoom } as CSSProperties} role="group" aria-label={isTop ? "Interactive top-down objective and density contours" : "Interactive 3D landscape and KDE surfaces"} data-guide-target={showRotateGuide || undefined} aria-describedby={showRotateGuide ? `view-help ${guide.textId}` : "view-help"} tabIndex={0}
      onPointerDown={onScenePointerDown} onPointerMove={onScenePointerMove}
      onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
      onPointerLeave={(event) => {
        if (!isTop || event.pointerType === "touch" || (topDrag.current && topDidPan.current)) return;
        endDrag(event);
        setInspection("");
      }}
      onClick={(event) => { if (isTop && !topDidPan.current) inspectAt(event); }}
      onKeyDown={onSceneKeyDown}>
      <title>{isTop ? "Objective and density contours viewed from above" : "Objective landscape, good and bad densities, and optional log density ratio"}</title>
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
          <text ref={heightLabelRef} x={heightEnd.x} y={heightEnd.y - 12 * labelScale} textAnchor={heightLabelAnchor}>Objective / Density · 1</text>
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
      {isTop ? <>
        <p>Hover or tap the map to inspect coordinates and values. Use + / − to zoom, then drag or use arrow keys to pan.</p>
        <p>Lines trace equal values of the objective and visible fitted layers. Stronger shading marks higher values within each fitted layer. When Acquisition has positive values, it highlights regions where ℓ(x) &gt; g(x).</p>
        <p>{constrained ? "The diamond marks the constrained optimum and the boundary outlines the feasible region. ✕ marks infeasible trials. KDEs appear after 2 observations if Good has trials or a prior." : "The diamond marks the optimum (estimated for Multimodal). KDEs appear after 2 observations."} The hollow marker is the next evaluation.</p>
      </> : <>
      <p>Drag or use arrow keys to rotate; + / − to zoom. Hover the surface or focus an observation to read its values.</p>
      <p>The faint surface is the objective; {constrained ? "the diamond marks the constrained optimum and the boundary outlines the feasible region. ✕ marks infeasible trials. KDEs appear after 2 observations if Good has trials or a prior." : "the diamond marks its optimum (estimated for Multimodal). KDEs appear after 2 observations."} The hollow marker is the next evaluation.</p>
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

    <ModelSettingsPanel experiment={{ page: "play-3d", preset: objectivePreset, mode, constraint: constraintPreset }} className="settings-play-3d" idSuffix="-play-3d" labelPrefix="Play 3D " defaultSettings={constrained ? constrainedModelDefaults : twoParamDefaultModelSettings} trialLimit={twoParamSettings.count} domainWidth={domainWidth} widths={goodWidths} settings={settings} disableEi={constrained} guide={guide.settingsGuide} onChange={editSettings} seed={seed} onNewSeed={() => { setSeed(Math.floor(Math.random() * 100)); restart(); }}
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
      <h2 id="play-3d-heading" className="sr-only">Explore two dimensions</h2>
      <div className="scene-toolbar-group">
        <div className="objective-picker parameter">
          <div className="parameter-label"><label htmlFor="objective-preset-play-3d">Objective</label><Help label="Play 3D objective preset"><strong>{objectiveDefinition.label}</strong><br />{objectiveDefinition.description} Minimize over <HelpMath inline tex="[-5,5]^2" />:<HelpMath tex={objectiveDefinition.formula} />Changing it restarts the search.</Help></div><select id="objective-preset-play-3d" value={objectivePreset} onChange={(event) => { setObjectivePreset(event.target.value as TwoParamObjectivePreset); restart(); }}>{(Object.keys(twoParamObjectivePresets) as TwoParamObjectivePreset[]).map((preset) => <option key={preset} value={preset}>{twoParamObjectivePresets[preset].label}</option>)}</select>
        </div>
      </div>
      <Play3DConstraintSettings preset={constraintPreset} infeasibleFilling={settings.infeasibleFilling ?? true} onPresetChange={changeConstraint}
        onFillingChange={(infeasibleFilling) => editSettings({ ...settings, infeasibleFilling })} />
      <div className="scene-toolbar-group">
        <div className="parameter density-picker"><div className="parameter-label"><label className="sr-only" htmlFor="density-mode">Density model</label><Help label="Play 3D density model"><strong>{mode === "multivariate" ? "Multivariate" : "Univariate"}</strong><br />Multivariate: kernels span both coordinates, keeping each (x₁, x₂) pair together. Univariate: each coordinate has its own KDE and candidate draw.</Help></div><select id="density-mode" value={mode} onChange={(event) => { cancelSeek(); setMode(event.target.value as DensityMode); setPlaying(false); setInspection(""); }}><option value="multivariate">Multivariate</option><option value="univariate">Univariate</option></select></div>
        </div>
    </ModelSettingsPanel>
    <details className="performance-monitor" onToggle={(event) => setComparisonOpen(event.currentTarget.open)}>
      <summary><span className="performance-caption">Best f(x) <strong title={bestValue}>{bestValue}</strong></span><span>Performance <span aria-hidden="true">⌄</span></span></summary>
      {comparisonOpen && <Play3DPerformance trials={playback.trials} proposals={playback.proposals} seed={seed} objectivePreset={objectivePreset} constraintPreset={constraintPreset} mode={mode} settings={settings} />}
    </details>
  </section>;
}

export function Play3DConstraintSettings({ preset, infeasibleFilling, onPresetChange, onFillingChange }: {
  preset: TwoParamConstraintPreset;
  infeasibleFilling: boolean;
  onPresetChange: (preset: TwoParamConstraintPreset) => void;
  onFillingChange: (enabled: boolean) => void;
}) {
  const definition = getTwoParamConstraint(preset);
  return <>
    <div className="parameter constraint-picker">
      <div className="parameter-label"><label htmlFor="constraint-preset-play-3d">Constraint</label>
        <Help label="Play 3D constraint preset"><strong>{definition.label}</strong><br />
          {definition.description}{definition.formula && <> Feasible when:<HelpMath tex={definition.formula} /></>}{preset === "none" && <br />}
          {preset !== "none" && <>About {definition.feasibleShare} of the domain is feasible. </>}Changing the constraint restarts the search.
        </Help>
      </div>
      <select id="constraint-preset-play-3d" value={preset} onChange={(event) => onPresetChange(event.target.value as TwoParamConstraintPreset)}>
        {Object.entries(twoParamConstraintPresets).map(([id, constraint]) => <option key={id} value={id}>{constraint.label}</option>)}
      </select>
    </div>
    {preset !== "none" && <div className="parameter infeasible-filling">
      <label><input type="checkbox" checked={infeasibleFilling} onChange={(event) => onFillingChange(event.target.checked)} /> Infeasible filling</label>
      <Help label="infeasible filling">Good takes feasible trials first. With filling on, the least-violating infeasible trials, those closest to the feasible region, fill open slots. With filling off, Good can fall short of its target size.</Help>
    </div>}
  </>;
}
