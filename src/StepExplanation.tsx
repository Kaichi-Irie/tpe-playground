import { alphaGestureHandlers } from "./alphaGesture";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { acquisitionPlot, completeInitialInputs, buildExplanation, explanationDefaults, explanationGrid, fixedExample, kernelContribution, evaluateExplanation, splitAtThreshold, fractionForCount, type ExplanationExample, type ExplanationSettings } from "./explanation";
import { getObjective } from "./objectives";
import "./step-explanation.css";
import { samplingReducer } from "./labSampling";
import LabIntro from "./LabIntro";
import { splitTrials } from "./tpe";
import { LabAudio } from "./labAudio";
import LabSoundControls from "./LabSoundControls";
import { labLayout } from "./labLayout";
import { usePlotSize } from "./usePlotSize";
import { loadSeenHints, nextHint, saveSeenHints, type LabHintId } from "./labHints";
import LabHintBubble, { labHintElementId } from "./LabHintBubble";

const stages = ["Unknown objective", "Observe", "Split", "Model inputs", "Kernels", "Density", "Sample", "Choose", "Evaluate"];
const journeyStops = [0, 1, 2, 4, 5, 6, 7, 8];
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * clamp(t);
const ease = (t: number) => t * t * (3 - 2 * t);
const goodMath = String.raw`\htmlClass{journey-good}{\ell}`;
const badMath = String.raw`\htmlClass{journey-bad}{g}`;
const alphaMath = String.raw`\htmlClass{journey-prior}{\alpha}`;
const h = String.raw`\htmlClass{journey-accent}{h}`;
export const kernelFormula = String.raw`\begin{gathered}k_i(x;${h})=\mathcal N(x\mid x_i,${h}^2)\\[4pt]=\frac{1}{${h}\sqrt{2\pi}}\exp\!\left(-\frac{(x-x_i)^2}{2${h}^2}\right)\end{gathered}`;

export function JourneyMath({ tex }: { tex: string }) {
  const html = useMemo(() => katex.renderToString(tex, {
    displayMode: true, throwOnError: true, strict: false,
    // Only authored class annotations are needed; no links or external resources.
    trust: (context) => context.command === "\\htmlClass",
  }), [tex]);
  return <div className="journey-math" dangerouslySetInnerHTML={{ __html: html }} />;
}

// Keep the canvas mounted. All geometry follows one reversible playhead.
function usePlayhead(target: number, replay: number, preview: boolean) {
  const [position, setPosition] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const start = current.current;
    if (start === target) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.current = target;
      setPosition(target);
      return;
    }
    let frame = 0;
    let started: number | undefined;
    const duration = preview ? 1400 : target < start ? 650 : target === 4 ? 1200 : target === 5 ? 6500 : target === 6 ? 1200 : target === 8 ? 5000 : 1150;
    const tick = (now: number) => {
      started ??= now;
      const elapsed = clamp((now - started) / duration);
      current.current = mix(start, target, (target === 1 && start === 0) || target === 4 || target === 5 || target === 6 ? elapsed : ease(elapsed));
      setPosition(current.current);
      if (elapsed < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, replay, preview]);
  const jump = useCallback((value: number) => { current.current = value; setPosition(value); }, []);
  return { position, jump };
}

function Range({ name, symbol, value, min, max, step, onChange, audio, hint, hinted }: {
  name: string; symbol: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; audio?: LabAudio;
  hint?: LabHintId; hinted?: boolean;
}) {
  return <label data-hint-anchor={hint} className={`journey-range ${symbol === "γ" ? "journey-gamma-control" : symbol === "h" ? "journey-h-control" : ""}`}><span>{name} <i>{symbol}</i></span>
    <input {...(audio ? alphaGestureHandlers(audio) : {})} aria-label={name} aria-describedby={hinted ? labHintElementId : undefined} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    <output>{Number(value.toFixed(2))}</output></label>;
}

export default function StepExplanation({ example = fixedExample, algorithmContainer, visible = true }: { example?: ExplanationExample; algorithmContainer?: HTMLElement | null; visible?: boolean }) {
  const [audio] = useState(() => new LabAudio());
  // The Lab stays mounted on other tabs; release the audio thread until it is shown again.
  useEffect(() => {
    if (visible) audio.resume();
    else audio.suspend();
  }, [visible, audio]);
  useEffect(() => {
    const stop = () => audio.stop();
    document.addEventListener("visibilitychange", stop);
    window.addEventListener("hashchange", stop);
    return () => {
      document.removeEventListener("visibilitychange", stop);
      window.removeEventListener("hashchange", stop);
      audio.dispose();
    };
  }, [audio]);
  const sectionRef = useRef<HTMLElement>(null);
  const soundPromptRef = useRef<HTMLDivElement>(null);
  const [soundState, setSoundState] = useState<"off" | "pending" | "on" | "error">("off");
  const [soundPromptDismissed, setSoundPromptDismissed] = useState(false);
  const [intro, setIntro] = useState(true);
  const [rounds, setRounds] = useState(0);
  useEffect(() => {
    if (!intro) sectionRef.current?.focus({ preventScroll: true });
  }, [intro]);
  const [stage, setStage] = useState(0);
  const [chosen, setChosen] = useState<number[]>([]);
  const [autoShown, setAutoShown] = useState(0);
  const [inputX, setInputX] = useState(0);
  const [initialComplete, setInitialComplete] = useState(false);
  const [placed, setPlaced] = useState<number[]>([]);
  const [allKernels, setAllKernels] = useState(false);
  // Preserve the sampled prefix when M temporarily hides some candidates.
  const [drawn, dispatchSampling] = useReducer(samplingReducer, 0);
  useEffect(() => {
    if (intro || stage !== 4 || placed.length < 3 || allKernels) return;
    const timer = window.setTimeout(() => { preserveLessonFocus(); setAllKernels(true); setFocused(null); }, 1000);
    return () => window.clearTimeout(timer);
  }, [intro, stage, placed.length, allKernels]);
  useEffect(() => {
    if (intro || chosen.length !== 3 || initialComplete) return;
    const timer = window.setTimeout(() => {
      setAutoShown((count) => count + 1);
      setFocused(null);
      if (autoShown === 6) { preserveLessonFocus(); setInitialComplete(true); }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [intro, chosen.length, initialComplete, autoShown]);
  const [replay, setReplay] = useState(0);
  // Coach hints: point at a control, then explain it once the learner uses it.
  const [seenHints, setSeenHints] = useState<ReadonlySet<LabHintId>>(() => new Set());
  const [usedHints, setUsedHints] = useState<ReadonlySet<LabHintId>>(() => new Set());
  const controlsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setSeenHints(loadSeenHints()); }, []);
  const { position: p, jump } = usePlayhead(stage, replay, intro);
  const [history, setHistory] = useState(() => [...example.trials]);
  const [settings, setSettings] = useState(explanationDefaults);
  const [focused, setFocused] = useState<number | null>(null);
  const [inspected, setInspected] = useState<number | null>(null);
  const canvas = usePlotSize();
  const { width: W, height: H, bottom, lane, minimumPlotHeight, curveHeight: laneCurveHeight } = labLayout(canvas.width, canvas.height, (stage <= 5 ? 28 : 70) * Math.max(1, canvas.typeScale));
  const left = 40, right = W - 32;
  const scoring = clamp((p - 5) / 0.25) * (1 - clamp(p - 7));
  const project = clamp(p - 2) * (1 - clamp((p - 7) / 0.45));
  const goodBase = mix(bottom, lane * 2, scoring);
  const badBase = mix(mix(bottom, H * 0.40, project), lane, scoring);
  const sampleBase = bottom;
  const screenScale = Math.max(1, W / canvas.width);
  // Text-coupled geometry (label offsets, pills) follows the fluid chart type size.
  const ui = screenScale * canvas.typeScale;
  const kernelPicking = !intro && stage === 4;
  const sx = (x: number) => left + (x + 5) / 10 * (right - left);
  const sy = (y: number) => bottom - y / 8 * (bottom - 35);
  const animating = Math.abs(p - stage) > 0.001;
  const lessonExample = useMemo(() => ({ ...example, trials: history }), [example, history]);
  const data = useMemo(() => buildExplanation(lessonExample, settings), [lessonExample, settings]);
  const goodIds = new Set(data.partition.good.map((t) => t.trialId));
  const nextTrial = useMemo(() => evaluateExplanation(lessonExample, settings), [lessonExample, settings]);
  const visibleDrawn = Math.min(drawn, settings.candidates);
  const activeIndex = inspected !== null && inspected < data.candidates.length ? inspected : data.selectedIndex;
  const active = data.candidates[activeIndex];
  const densityVisibility = clamp((p - 3) * 8) * (1 - clamp((p - 7) / 0.4));
  const weighting = clamp((p - 4) / 0.35);
  const stacking = ease(clamp((p - 4.3) / 0.25));
  const sumVisibility = clamp((p - 4.55) / 0.1);
  const priorAddition = ease(clamp((p - 4.65) / 0.35));
  const stackLift = stacking * (1 - sumVisibility);
  const scoreVisibility = clamp(p - 6);
  const evaluation = clamp(p - 7);
  const densityMax = Math.max(0.001, ...data.goodDensity, ...data.badDensity);
  const densityScale = mix(H * 0.25, laneCurveHeight, scoring) / mix(1 / (settings.bandwidth * Math.sqrt(2 * Math.PI)), densityMax, weighting);
  const ratioPlot = acquisitionPlot(data.logRatios, data.candidates.map((candidate) => candidate.score));
  const ratios = ratioPlot.curve;
  const ratioScale = laneCurveHeight;
  const orderedCandidates = data.candidates.map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => Number(a.index === data.selectedIndex) - Number(b.index === data.selectedIndex));
  // The first three queries have separate input, evaluation, and placement beats.
  const observationProgress = (index: number) => !intro && !initialComplete ? Number(index < chosen.length + autoShown) : index < 3
    ? clamp((p - index * 0.24) / 0.24)
    : clamp((p - 0.72 - (index - 3) / Math.max(1, history.length - 3) * 0.20) / 0.08);
  const queryingIndex = intro && stage === 1 && p < 0.72 ? Math.min(2, Math.floor(p / 0.24)) : -1;
  const querying = history[queryingIndex];
  const shownObservation = querying ?? (stage === 1 ? history.find((trial) => trial.id === focused) : undefined);
  const queryProgress = querying ? observationProgress(queryingIndex) : 0;
  const objectiveValues = useMemo(() => explanationGrid.map((x) => getObjective(example.objectivePreset).evaluate(x)), [example.objectivePreset]);
  const truthVisibility = (intro ? Number(p >= 1) : Number(initialComplete)) * (1 - project);
  const kernelProgress = (id: number | null) => {
    if (!intro && stage === 4 && id !== null) return allKernels || placed.includes(id) ? 1 : 0;
    if (id === null) return weighting;
    const index = history.findIndex((trial) => trial.id === id);
    return index < 3 ? clamp((p - 3 - index * 0.22) / 0.22)
      : clamp((p - 3.66 - (index - 3) / Math.max(1, history.length - 3) * 0.22) / 0.12);
  };
  const growingKernel = p > 3 && p < 3.66 ? history[Math.min(2, Math.floor((p - 3) / 0.22))]?.id : null;
  const components = useMemo(() => (["good", "bad"] as const).map((kind) => data.group[kind].kernels.map((kernel) => ({
    kernel, values: explanationGrid.map((x) => kernelContribution(kernel, x)),
    unweighted: explanationGrid.map((x) => kernelContribution({ ...kernel, mixtureWeight: 1 }, x)),
  }))), [data]);
  const path = (values: readonly number[], base: number, scale: number, center = 0, spread = 1) => values.map((v, i) => `${i ? "L" : "M"}${sx(mix(center, explanationGrid[i], spread)).toFixed(2)},${(base - v * scale).toFixed(2)}`).join(" ");
  const weightMath = settings.weights === "uniform"
    ? String.raw`w_i=\frac{1}{n+\alpha},\quad w_0=\frac{\alpha}{n+\alpha}`
    : settings.weights === "recency" ? String.raw`w_i\propto\operatorname{rank}_{\mathrm{time}}(i),\quad w_0=\frac{\alpha}{n+\alpha}` : String.raw`w_i\propto\max(0,y^*-y_i)\; (\mathrm{Good}),\quad w_i=\frac{1}{n+\alpha}\; (\mathrm{Bad})`;
  const weightDescription = settings.weights === "uniform" ? "n = observations in this group" : settings.weights === "recency" ? "Within each group: newer observations weigh more" : "Larger improvement weighs more; uniform if all improvements are zero";
  const messages = [
    "Minimize y using a black-box function.",
    rounds > 0 ? "New observation added. Split the data again." : initialComplete ? "Tap the grid to split Good and Bad." : "Pick a point x. Observe its value.",
    "Split data into Good and Bad.",
    "Model where Good and Bad inputs occur.",
    "Tap a point. Add a probability density.",
    "Sum weighted kernels into densities.",
    "Roll the dice. Find your next move.",
    "Which candidate wins?",
    "Evaluate the chosen input. Add the observation.",
  ];
  const densityTerm = (kind: "Good" | "Bad") => p < 4.3
    ? String.raw`\sum_{i\in\mathrm{${kind}}}\htmlClass{journey-formula-active}{w_i} k_i(x)`
    : p < 4.65 ? String.raw`\htmlClass{journey-formula-active}{\sum_{i\in\mathrm{${kind}}}w_i k_i(x)}`
    : String.raw`\sum_{i\in\mathrm{${kind}}}w_i k_i(x)`;
  const priorTerm = p >= 4.65 ? String.raw`+\htmlClass{journey-prior}{w_0p_0(x)}` : "";
  const densityExpansion = (kind: "Good" | "Bad") => `${densityTerm(kind)}${priorTerm}`;
  const formulas = [
    String.raw`\begin{gathered}\min_x y,\quad y=f(x)\\[4pt]f:\text{ black box}\end{gathered}`,
    querying ? String.raw`x_{${querying.id}}=${querying.x.toFixed(1)},\qquad y_{${querying.id}}=f(x_{${querying.id}})${queryProgress > 0.65 ? `=${querying.y.toFixed(1)}` : ""}` : rounds > 0 ? String.raw`\mathcal D\leftarrow\mathcal D\cup\{(x_{\mathrm{next}},y_{\mathrm{next}})\}` : String.raw`y_i=f(x_i),\quad i=1,\ldots,${!intro && !initialComplete ? chosen.length + autoShown : history.length}`,
    String.raw`\htmlClass{journey-good}{\mathrm{Good}:\ y_i\leq y^*}\quad\htmlClass{journey-bad}{\mathrm{Bad}:\ y_i>y^*}`,
    "",
    kernelFormula,
    String.raw`\begin{aligned}p(x\mid\mathcal D_{\mathrm{Bad}})&\approx ${badMath}(x)\\${badMath}(x)&=${densityExpansion("Bad")}\\[6pt]p(x\mid\mathcal D_{\mathrm{Good}})&\approx ${goodMath}(x)\\${goodMath}(x)&=${densityExpansion("Good")}\end{aligned}`,
    String.raw`z_1,\ldots,z_M\sim ${goodMath}(x)`,
    String.raw`\begin{gathered}${alphaMath}(x)=\frac{${goodMath}(x)}{${badMath}(x)}\\[6pt]x_{\mathrm{next}}=\underset{z_j}{\arg\max}\;${alphaMath}(z_j)\end{gathered}`,
    p < 7.95 ? String.raw`y_{\mathrm{next}}=f(x_{\mathrm{next}})` : String.raw`(x_{\mathrm{next}},y_{\mathrm{next}})=(${nextTrial.x.toFixed(1)},${nextTrial.y.toFixed(1)})`,
  ];

  const taskPending = !intro && ((stage === 1 && !initialComplete) || (stage === 4 && !allKernels) || (stage === 6 && drawn < settings.candidates));
  const activeHint = intro || animating ? null : nextHint({ stage, taskPending }, seenHints);
  const hintPhase = activeHint && usedHints.has(activeHint) ? "meaning" : "action";
  function markHintsSeen(ids: Iterable<LabHintId>) {
    const next = new Set([...seenHints, ...ids]);
    if (next.size === seenHints.size) return;
    saveSeenHints(next);
    setSeenHints(next);
  }
  function dismissHint(id: LabHintId) {
    markHintsSeen([id]);
    // The dismiss button unmounts; keep keyboard focus on the control it described.
    controlsRef.current?.querySelector<HTMLElement>(`[data-hint-anchor="${id}"] :is(input, select)`)?.focus();
  }
  function noteControlUsed(id: LabHintId) {
    if (activeHint === id && !usedHints.has(id)) setUsedHints((current) => new Set([...current, id]));
  }
  function showHintsAgain() {
    saveSeenHints(new Set());
    setSeenHints(new Set());
    setUsedHints(new Set());
  }
  // An explained hint is done once the learner leaves its stage.
  useEffect(() => {
    if (usedHints.size) markHintsSeen(usedHints);
  }, [stage]);
  function pickAt(clientX: number, clientY: number) {
    const matrix = canvas.ref.current?.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    if (point.x >= left && point.x <= right && point.y >= 30 && point.y <= bottom + 20) {
      chooseInput((point.x - left) / (right - left) * 10 - 5);
    }
  }
  function splitAt(clientX: number, clientY: number) {
    const matrix = canvas.ref.current?.getScreenCTM();
    if (!matrix || animating) return;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    if (point.x < left || point.x > right || point.y < 35 || point.y > bottom) return;
    applySplit((bottom - point.y) / (bottom - 35) * 8);
  }
  function confirmSplit(height = data.partition.threshold) {
    setFocused(null);
    setSoundPromptDismissed(true);
    setStage(2);
    audio.play("split", height);
  }
  function applySplit(value: number) {
    const { gamma, threshold } = splitAtThreshold(history, value);
    setSettings((current) => ({ ...current, gamma }));
    // The tap target persists in Split, so keyboard focus stays on the grid.
    confirmSplit(threshold);
  }
  function inspectSplitPoint(clientX: number, clientY: number) {
    const matrix = canvas.ref.current?.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    const distance = (trial: typeof history[number]) => Math.hypot(point.x - sx(trial.x), point.y - sy(trial.y));
    const nearest = history.reduce((best, trial) => distance(trial) < distance(best) ? trial : best);
    setFocused(distance(nearest) <= 14 * screenScale ? nearest.id : null);
  }
  function chooseInput(x: number) {
    if (intro || stage !== 1 || initialComplete || chosen.length >= 3) return;
    const value = Math.round(Math.max(-5, Math.min(5, x)) * 10) / 10;
    if (chosen.includes(value)) return;
    const inputs = [...chosen, value];
    setChosen(inputs); setInputX(value);
    setHistory(completeInitialInputs(inputs, example.objectivePreset));
    setFocused(inputs.length);
  }
  function pickKernel(clientX: number, clientY: number) {
    if (animating) return;
    const matrix = canvas.ref.current?.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    // Touch targets can overlap on a narrow screen. Resolve to the nearest dot.
    const nearest = history.reduce((best, trial) => {
      const distance = (entry: typeof trial) => Math.hypot(point.x - sx(entry.x), point.y - (goodIds.has(entry.id) ? goodBase : badBase));
      return distance(trial) < distance(best) ? trial : best;
    });
    placeKernel(nearest.id);
  }
  function placeKernel(id: number) {
    setFocused(id);
    if (intro || animating || (stage !== 4 && stage !== 5)) return;
    audio.play("kernel");
    if (stage === 4 && !allKernels && !placed.includes(id)) {
      setPlaced((current) => [...current, id]);
    }
  }
  function startLab() {
    sectionRef.current?.focus({ preventScroll: true });
    setIntro(false); setStage(1); jump(1);
    setHistory([...example.trials]);
    setChosen([]); setAutoShown(0); setInitialComplete(true); setPlaced([]); setAllKernels(false); dispatchSampling({ type: "reset" });
    setFocused(null); setInspected(null);
  }
  const showSoundPrompt = !intro && stage === 1 && rounds === 0 && !soundPromptDismissed;
  function dismissSoundPrompt() {
    if (soundPromptRef.current?.contains(document.activeElement)) {
      sectionRef.current?.focus({ preventScroll: true });
    }
    setSoundPromptDismissed(true);
  }
  async function toggleSound() {
    if (soundState === "pending") return;
    if (soundState === "on") {
      audio.disable();
      setSoundState("off");
      return;
    }
    setSoundState("pending");
    const enabled = await audio.enable();
    if (enabled) dismissSoundPrompt();
    setSoundState(enabled ? "on" : "error");
  }
  function change(patch: Partial<ExplanationSettings>) {
    if (intro || controlDisabled) return;
    setSettings((current) => ({ ...current, ...patch }));
    if (patch.bandwidth !== undefined && patch.bandwidth !== settings.bandwidth && (allKernels || placed.length > 0)) audio.play("bandwidth", patch.bandwidth);
    if (patch.gamma !== undefined && patch.gamma !== settings.gamma) audio.adjustSplit(splitTrials(history, patch.gamma).threshold);
    if (patch.priorWeight !== undefined && patch.priorWeight !== settings.priorWeight) audio.play("alpha", patch.priorWeight);
    setInspected(null);
    if (patch.seed !== undefined) dispatchSampling({ type: "reset", revealed: stage === 7 ? settings.candidates : 0 });
    else if (patch.candidates !== undefined) dispatchSampling({ type: "resize", limit: patch.candidates, reveal: stage === 7 });
  }
  function roll(rest = false) {
    if (animating || visibleDrawn >= settings.candidates) return;
    const action = { type: rest ? "rollRest" : "roll", limit: settings.candidates } as const;
    const next = samplingReducer(drawn, action);
    if (next === settings.candidates) preserveLessonFocus();
    dispatchSampling(action);
    audio.play("sample");
    setInspected(next - 1);
  }
  function preserveLessonFocus(includeNavigation = false) {
    const section = sectionRef.current;
    if (section?.contains(document.activeElement)
      && (includeNavigation || !section.querySelector(".journey-navigation")?.contains(document.activeElement))) {
      section.focus({ preventScroll: true });
    }
  }
  function move(direction: number) {
    if (stage === 1 && initialComplete && direction > 0) return;
    if (intro || (rounds === 0 && (animating || (direction > 0 && taskPending)))) return;
    if (rounds > 0 && direction > 0) {
      if (stage === 4) setAllKernels(true);
      if (stage === 6) dispatchSampling({ type: "resize", limit: settings.candidates, reveal: true });
      if (stage === 1 && !initialComplete) {
        setHistory(completeInitialInputs(chosen, example.objectivePreset));
        setInitialComplete(true);
      }
    }
    preserveLessonFocus();
    setInspected(null);
    if (stage === 8 && direction === 1) {
      setHistory((current) => [...current, nextTrial]);
      setRounds((current) => current + 1);
      dispatchSampling({ type: "reset" }); setPlaced([]); setAllKernels(false);
      jump(1); setStage(1);
    } else setStage((current) => journeyStops[Math.max(0, Math.min(journeyStops.length - 1, journeyStops.indexOf(current) + direction))]);
  }
  function replayStep() {
    if (intro || stage === 0 || animating || (taskPending && stage !== 4)) return;
    preserveLessonFocus();
    setFocused(null); setInspected(null);
    if (stage === 4) { setPlaced([]); setAllKernels(false); }
    jump(journeyStops[journeyStops.indexOf(stage) - 1]); setReplay((value) => value + 1);
  }
  function restart() {
    audio.stop();
    preserveLessonFocus(true);
    setIntro(true); setRounds(0); setChosen([]); setAutoShown(0); setInitialComplete(false); setPlaced([]); setAllKernels(false); dispatchSampling({ type: "reset" });
    setHistory([...example.trials]); setSettings(explanationDefaults);
    setFocused(null); setInspected(null); jump(0); setStage(0); setReplay((v) => v + 1);
  }
  const pointStyle = (x: number, y: number, color: string, opacity = 1): CSSProperties => ({
    transform: `translate(${x}px, ${y}px)`, color, opacity,
    transition: animating ? "none" : "transform 350ms ease, color 350ms ease, opacity 200ms ease",
  });
  const controlDisabled = animating || stage === 8;

  function renderObservation(trial: typeof history[number], i: number, base: number) {
    const observed = observationProgress(i);
    let x = sx(trial.x), y = sy(trial.y);
    if (p < 1) y = mix(bottom, y, ease(clamp((observed - 0.15) / 0.5)));
    y = mix(y, base, project);
    const color = p < 1 ? "var(--acquisition)" : `color-mix(in srgb, var(--${goodIds.has(trial.id) ? "good" : "bad"}) ${clamp(p - 1) * 100}%, var(--neutral-point))`;
    const kernel = data.group[goodIds.has(trial.id) ? "good" : "bad"].kernels.find((k) => k.source.kind === "observation" && k.source.trialId === trial.id)!;
    const radius = mix(5.5, 3.5 + Math.sqrt(kernel.mixtureWeight) * 9, clamp(p - 4) * (1 - evaluation));
    const visibleRadius = kernelPicking ? Math.max(radius, 9 * screenScale) : radius;
    const guideLabelX = Math.max((left - x) / ui + 8, Math.min(28, (right - x) / ui - 112));
    // IDs sit right of the point unless that would overflow the plot edge.
    const indexSide = x + 30 * ui > W ? -1 : 1;
    const guided = kernelPicking && !allKernels && placed.length < 3 && history.find((entry) => !placed.includes(entry.id))?.id === trial.id;
    return <g key={trial.id} data-observation={trial.id} aria-hidden={observed === 0} style={{ ...pointStyle(x, y - base, color, observed === 0 ? 0 : !guided && focused !== null && focused !== trial.id ? 0.3 : 1), transition: "color 350ms ease, opacity 200ms ease", pointerEvents: observed === 0 ? "none" : undefined }}>
      <g className="journey-observation-control" tabIndex={observed === 0 ? -1 : 0} role="button" aria-label={`Observation at x ${trial.x.toFixed(1)}${p >= 1 ? `, f(x) ${trial.y.toFixed(1)}` : ""}`} onMouseEnter={() => setFocused(trial.id)} onMouseLeave={() => setFocused(null)} onFocus={() => setFocused(trial.id)} onBlur={() => setFocused(null)} onClick={(event) => kernelPicking && event.detail !== 0 ? pickKernel(event.clientX, event.clientY) : placeKernel(trial.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); placeKernel(trial.id); } }}>
        {kernelPicking && <circle className="journey-observation-hit" r={22 * screenScale} />}
        <circle r={visibleRadius} className="journey-observation" />
        <title>{p < 1 ? `x = ${trial.x.toFixed(1)}` : `x = ${trial.x.toFixed(1)}, f(x) = ${trial.y.toFixed(1)}`}</title>
      </g>
      <text className="journey-point-index" x={(kernelPicking ? visibleRadius + 5 * ui : 10 * ui) * indexSide} y={kernelPicking ? -visibleRadius - 4 * ui : -9 * ui} textAnchor={indexSide < 0 ? "end" : undefined}>{trial.id}</text>
      {guided && <g className="journey-tap-marker journey-kernel-guide" transform={`scale(${ui})`} aria-hidden="true">
        <circle className="journey-tap-ring" r="22" /><circle r="15" />
        <path d={`M14-14L${guideLabelX + 8}-40`} />
        <rect x={guideLabelX} y="-76" width="112" height="36" rx="18" />
        <text x={guideLabelX + 56} y="-53" textAnchor="middle">Tap to add</text>
      </g>}
      {((p < 1 && observed > 0 && observed < 1) || (stage === 1 && focused === trial.id)) && <g className="journey-query-result">
        <line x1="0" x2="0" y1="0" y2={bottom - y} />
        {observed > 0.65 && <>
          <line x1="0" x2={(left - x) * clamp((observed - 0.65) / 0.25)} y1="0" y2="0" />
          <text x={left - x + 8} y="-12">{`y${String(trial.id).split("").map((digit) => "₀₁₂₃₄₅₆₇₈₉"[Number(digit)]).join("")} = ${trial.y.toFixed(1)}`}</text>
        </>}
      </g>}
    </g>;
  }

  return <>{intro && <LabIntro trials={example.trials} nextX={nextTrial.x} objectivePreset={example.objectivePreset} onExplore={startLab} />}<section hidden={intro} ref={sectionRef} data-stage={stage} data-hint={activeHint && hintPhase === "action" ? activeHint : undefined} className={`journey ${intro ? "journey-intro" : "journey-started"}  ${!intro && stage === 1 && !initialComplete ? "journey-picking" : ""}`} aria-label="Interactive TPE walkthrough" tabIndex={0} onKeyDown={(event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1); }
  }}>
    {showSoundPrompt && <div className="lab-sound-prompt" ref={soundPromptRef}>
      <p>Hear sound effects as you interact.</p>
      <div className="lab-sound-prompt-actions">
        <button type="button" className="journey-action lab-enable-sound" aria-disabled={soundState === "pending"} onClick={() => void toggleSound()}>
          {soundState === "pending" ? "Turning sound on…" : "Turn sound on"}
        </button>
        <button type="button" className="journey-action" aria-disabled={soundState === "pending"} onClick={() => {
          if (soundState === "pending") return;
          setSoundState("off");
          dismissSoundPrompt();
        }}>Continue muted</button>
      </div>
      {soundState === "error" && <p className="lab-sound-prompt-error" role="alert">Sound unavailable. Try again.</p>}
    </div>}
    <div className="journey-heading"><div className="journey-heading-main">
    {/* Both split headings share one grid cell, sized to the taller content.
        Revealing the split never resizes or reprojects the canvas. */}
    {(stage === 1 || stage === 2 ? [1, 2] : [stage]).map((headingStage) => <div key={headingStage} className="journey-heading-step" data-heading-stage={headingStage} aria-hidden={headingStage !== stage}>
      <p className="journey-message">{messages[headingStage]}</p>
      <div className={`journey-formula ${headingStage === 3 || headingStage === 4 || headingStage === 5 ? "journey-formula-pair" : ""}`}><JourneyMath tex={formulas[headingStage]} /></div>
    </div>)}
    </div></div>
    {algorithmContainer ? createPortal(<><div className="header-algorithm">
      <button className="algorithm-trigger" popoverTarget="lab-algorithm" aria-label="TPE Algorithm" title="TPE Algorithm"><svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d="M5 3L1 8l4 5M11 3l4 5-4 5" /></svg><span>Algorithm</span></button>
      <aside id="lab-algorithm" className="algorithm-popover" popover="auto" aria-label="TPE Algorithm">
        <div className="algorithm-popover-heading"><strong>TPE Algorithm</strong><button popoverTarget="lab-algorithm" popoverTargetAction="hide" aria-label="Close TPE Algorithm">×</button></div>
      <ol id="journey-algorithm-steps">{[
        "D ← observe initial inputs",
        "repeat:",
        "  Good, Bad ← split(D, γ)",
        "  l, g ← KDE(Good, Bad)",
        "  z₁, …, zₘ ∼ l",
        "  x_next ← argmax α(zⱼ), α = l/g",
        "  D ← D ∪ {(x_next, f(x_next))}",
      ].map((line, index) => <li key={line} aria-current={index === (stage <= 1 ? 0 : stage === 2 ? 2 : stage <= 5 ? 3 : stage === 6 ? 4 : stage === 7 ? 5 : 6) ? "step" : undefined}>{line}</li>)}</ol>
      </aside>
    </div><button type="button" className="algorithm-trigger lab-hints-trigger" onClick={showHintsAgain} aria-label="Show control hints again" title="Show control hints again">
      <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d="M6 12.5h4M6.5 14.5h3M5.2 10.2A4.5 4.5 0 1 1 10.8 10.2c-.5.4-.8 1-.8 1.6V12H6v-.2c0-.6-.3-1.2-.8-1.6Z" /></svg><span>Hints</span>
    </button><LabSoundControls enabled={soundState === "on"} pending={soundState === "pending"}
      error={soundState === "error" && !showSoundPrompt} onToggle={() => void toggleSound()} /></>, algorithmContainer) : null}
    <div className="journey-plot" style={{ minHeight: minimumPlotHeight }}>
    <svg ref={canvas.ref} onPointerMove={(event) => {
      if (intro || stage !== 1 || initialComplete) return;
      const matrix = event.currentTarget.getScreenCTM();
      if (!matrix) return;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      setInputX(Math.round(Math.max(-5, Math.min(5, (point.x - left) / (right - left) * 10 - 5)) * 10) / 10);
    }} onClick={(event) => {
      if (stage !== 1 || intro || initialComplete || (event.target as Element).closest("[role=button]")) return;
      pickAt(event.clientX, event.clientY);
    }} className="journey-canvas" style={{ "--chart-zoom": screenScale } as CSSProperties} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${stages[stage]}: ${stage === 0 ? 0 : !intro && !initialComplete ? chosen.length + autoShown : stage === 8 && !animating ? history.length + 1 : history.length} observations`}>
      <defs><clipPath id="journey-density-clip"><rect x={left} y="0" width={right - left} height={H + 20} /></clipPath></defs>
      <g className="journey-grid" opacity={(1 - project) * 0.3} aria-hidden="true">
        {[-4,-3,-2,-1,0,1,2,3,4].map((x) => <line key={x} x1={sx(x)} x2={sx(x)} y1="35" y2={bottom} />)}
        {[1,2,3,4,5,6,7,8].map((y) => <line key={y} x1={left} x2={right} y1={sy(y)} y2={sy(y)} />)}
      </g>
      {!intro && stage === 1 && !initialComplete && <g className="journey-pick-axis" role="button" tabIndex={0} aria-label={`Pick x = ${inputX.toFixed(1)}. Use left and right arrows to choose, then Enter.`} onClick={(event) => { event.stopPropagation(); pickAt(event.clientX, event.clientY); }} onKeyDown={(event) => {
        if (["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          if (event.key === "Enter" || event.key === " ") chooseInput(inputX);
          else setInputX((value) => Math.round(Math.max(-5, Math.min(5, value + (event.key === "ArrowRight" ? 0.1 : -0.1))) * 10) / 10);
        }
      }}>
        <rect x={left} y={bottom - 13} width={right - left} height="26" rx="13" />
        <line x1={left} x2={right} y1={bottom} y2={bottom} />
        <circle cx={sx(inputX)} cy={bottom} r="9" />
        <text x={Math.min(right - 32, Math.max(left + 32, sx(inputX)))} y={bottom - 22} textAnchor="middle">x = {inputX.toFixed(1)}</text>
      </g>}
      <g className="journey-axis">
        <g opacity={1 - project} aria-hidden={project === 1}>
          <line x1={left} x2={left} y1="30" y2={bottom} />
          {[0,1,2,3,4,5,6,7,8].map((y) => <g key={y}><line x1={left - 4} x2={left} y1={sy(y)} y2={sy(y)} /><text x={left - 10} y={sy(y) + 4} textAnchor="end">{y}</text></g>)}
          <text className="journey-axis-title" x={left} y="24">y</text>
        </g>
      </g>
      <g opacity={truthVisibility} aria-hidden={truthVisibility === 0}>
        <path className="journey-truth" d={objectiveValues.map((value, index) => `${index ? "L" : "M"}${sx(explanationGrid[index])},${sy(value)}`).join(" ")} />
        {stage <= 1 && truthVisibility > 0 && <text className="journey-truth-label" x={right} y="24" textAnchor="end">True y = f(x) · shown for illustration</text>}
      </g>
      <g opacity={clamp(p - 1) * (1 - project) * (1 - evaluation)} aria-hidden={p < 2 || project === 1 || evaluation === 1}>
        <rect x={left} y={sy(data.partition.threshold)} width={right - left} height={Math.max(0, bottom - sy(data.partition.threshold))} fill="var(--good)" opacity="0.06" />
        <rect x={left} y="30" width={right - left} height={Math.max(0, sy(data.partition.threshold) - 30)} fill="var(--bad)" opacity="0.06" />
        <line x1={left} x2={mix(left, right, p - 1)} y1={sy(data.partition.threshold)} y2={sy(data.partition.threshold)} className="journey-threshold" />
        <text className="journey-threshold-label" x={left + 8 * ui} y={sy(data.partition.threshold) - 12 * ui}>y = y*</text>
        <text x={right - 10 * ui} y={sy(data.partition.threshold) - 12 * ui} textAnchor="end" className="journey-group-bad">Bad</text>
        <text x={right - 10 * ui} y={sy(data.partition.threshold) + 28 * ui} textAnchor="end" className="journey-group-good">Good</text>
      </g>
      {/* A lane owns the translation of its axis, densities, and observations.
          Geometry inside the lane uses a zero baseline and no second motion clock. */}
      {(["good", "bad"] as const).map((kind, row) => {
          const laneBase = row === 0 ? goodBase : badBase;
          const base = 0;
          const values = row === 0 ? data.goodDensity : data.badDensity;
          const prior = components[row].find((component) => component.kernel.source.kind === "prior");
          const priorValues = prior?.values ?? explanationGrid.map(() => 0);
          const observedSum = values.map((value, index) => value - priorValues[index]);
          const combined = observedSum.map((value, index) => value + priorValues[index] * priorAddition);
          const sum = path(combined, base, densityScale);
          const observedReverse = explanationGrid.map((x, index) => `${sx(x)},${base - observedSum[index] * densityScale}`).reverse().join(" L");
          return <g key={kind} data-density-lane={kind} transform={`translate(0, ${laneBase})`}>
            <g className="journey-axis" opacity={(kind === "good" ? project : 1) * (1 - evaluation)} aria-hidden={evaluation === 1 || (kind === "good" && project === 0)}>
              <line data-lane-axis={kind} x1={left} x2={right} y1="0" y2="0" />
              {(kind === "bad" && (stage <= 2 || stage === 8) ? [-5,-4,-3,-2,-1,0,1,2,3,4,5] : [-5,0,5]).map((x) => <g key={x}>
                <line x1={sx(x)} x2={sx(x)} y1="0" y2="4" />
                <text x={sx(x)} y="23" textAnchor="middle">{x}</text>
              </g>)}
              {kind === "bad" && <text className="journey-axis-title" x={W - 4 * screenScale} y={-8 * ui} textAnchor="end">x</text>}
              <text x={left} y={mix(-H * 0.29, (kind === "good" ? lane + 50 : 50) - laneBase, scoring)} className={`journey-${kind}`} opacity={project}>{p < 4.5 ? (kind === "good" ? "Good" : "Bad") : kind === "good" ? "ℓ(x)" : "g(x)"}</text>
            </g>
            <g className={`journey-${kind}`} opacity={densityVisibility} aria-hidden={stage < 4 || stage === 8}>
            {components[row].map(({ kernel, values, unweighted }, i) => {
              const id = kernel.source.kind === "observation" ? kernel.source.trialId : null;
              if (id === null) return null;
              const lower = explanationGrid.map((_, index) => components[row].slice(0, i).reduce((total, component) => total + (component.kernel.source.kind === "prior" ? 0 : component.values[index]), 0) * stackLift);
              const upper = values.map((value, index) => lower[index] + mix(unweighted[index], value, weighting));
              const growth = kernelProgress(id);
              if (growth === 0) return null;
              const curve = path(upper, base, densityScale * growth, kernel.center.x, growth);
              const lowerCurve = explanationGrid.map((x, index) => `${sx(x).toFixed(2)},${(base - lower[index] * densityScale * growth).toFixed(2)}`).reverse().join(" L");
              const peak = kernelContribution({ ...kernel, mixtureWeight: mix(1, kernel.mixtureWeight, weighting) }, kernel.center.x);
              const labelVisible = id === null ? (stage === 5 ? weighting : 0) : stage > 5 ? 0 : growth;
              const lane = components[row].filter((component) => component.kernel.center.x < kernel.center.x && kernel.center.x - component.kernel.center.x < 1.2).length % 3;
              const indexLabel = String(id).split("").map((digit) => "₀₁₂₃₄₅₆₇₈₉"[Number(digit)]).join("");
              return <g key={i} className={stage === 4 ? "journey-kernel-reveal" : undefined}>
                <path d={`${curve} L${lowerCurve} Z`} fill="currentColor" opacity={stackLift * 0.18} />
                {(stage === 4 || stage === 5) && <path className="journey-kernel-hit" d={`${curve} L${lowerCurve} Z`}
                  role="button" tabIndex={0} aria-label={`Play kernel for observation ${id}`}
                  style={{ strokeWidth: 20 * screenScale }}
                  onMouseEnter={() => setFocused(id)} onMouseLeave={() => setFocused(null)}
                  onFocus={() => setFocused(id)} onBlur={() => setFocused(null)}
                  onClick={(event) => { event.stopPropagation(); placeKernel(id); }}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); placeKernel(id); } }} />}
                <path className="kernel" d={curve}
                  style={{ opacity: id === null ? weighting : focused === null ? mix(0.8, 0.55, sumVisibility) : focused === id ? 1 : 0.08, strokeWidth: focused === id && id !== null ? 3 : 1.5 }} />
                {id === null && <path className="kernel" d={path(values, base, densityScale)} opacity={weighting} />}
                {id !== null && <line className="journey-kernel-link" x1={sx(kernel.center.x)} x2={sx(kernel.center.x)} y1={base} y2={base - peak * densityScale * growth} opacity={(1 - stackLift) * (focused === null || focused === id ? 0.5 : 0.08)} />}
                {id !== null && stage === 4 && id === (focused ?? growingKernel ?? history[0]?.id) && <g className="journey-bandwidth" opacity={growth}>
                  <line x1={sx(kernel.center.x)} x2={sx(Math.min(5, kernel.center.x + settings.bandwidth))} y1={base - 8 * screenScale} y2={base - 8 * screenScale} />
                  <path d={`M${sx(kernel.center.x)},${base - 11 * screenScale}v${6 * screenScale} M${sx(Math.min(5, kernel.center.x + settings.bandwidth))},${base - 11 * screenScale}v${6 * screenScale}`} />
                  <text x={(sx(kernel.center.x) + sx(Math.min(5, kernel.center.x + settings.bandwidth))) / 2} y={base - 16 * ui} textAnchor="middle">h</text>
                </g>}
                <text className="journey-kernel-label" x={id === null ? right - 8 : Math.max(left + 65, Math.min(right - 65, sx(kernel.center.x)))} y={id === null ? base + 48 : Math.max(18 - laneBase, base - peak * densityScale * growth - 16 - lane * 16)} textAnchor={id === null ? "end" : "middle"} opacity={Number(labelVisible) * (1 - stacking)}>
                  {id === null ? `Prior` : `${weighting > 0 ? `w${indexLabel} ` : ""}k${indexLabel}`}
                </text>
              </g>;
            })}
            <path d={`${sum} L${right},${base} L${left},${base} Z`} className="density-fill" opacity={sumVisibility * 0.1} />
            <path d={sum} className="density-line" opacity={sumVisibility} />
            {stage === 5 && <g className="journey-prior-addition" opacity={priorAddition}>
              <path d={`${sum} L${observedReverse} Z`} className="journey-prior-band" />
              <path d={path(observedSum, base, densityScale)} className="journey-before-prior" />
              <path d={path(priorValues, base, densityScale)} className="journey-prior-curve" />
              <text x={right - 8} y={base + 48} textAnchor="end">+ w₀ p₀(x)</text>
            </g>}
            {stage === 7 && <g className="journey-inspection-probe" opacity={scoreVisibility}>
              <line x1={sx(active.params.x)} x2={sx(active.params.x)} y1={base} y2={base - Math.exp(row === 0 ? active.logL : active.logG) * densityScale} className="journey-probe" />
              <circle cx={sx(active.params.x)} cy={base - Math.exp(row === 0 ? active.logL : active.logG) * densityScale} r="4" fill="currentColor" />
            </g>}
            </g>
            {history.map((trial, index) => goodIds.has(trial.id) === (kind === "good") ? renderObservation(trial, index, laneBase) : null)}
          </g>;
        })}
      <g className="journey-score-axis" opacity={clamp((p - 5) / 0.25)} aria-hidden={stage < 6}>
        <line x1={left} x2={right} y1={sampleBase} y2={sampleBase} />
        <g opacity={1 - evaluation}>
        <path data-ratio-curve="true" d={path(ratios, sampleBase, ratioScale * scoreVisibility)} opacity={scoreVisibility} />
        <text className="journey-acquisition-title" x={left} y={stage === 6 ? sampleBase - 40 : lane * 2 + 50}>{stage === 6 ? `Candidates zⱼ · M = ${settings.candidates}` : ratioPlot.logarithmic ? "Acquisition α(x) · log scale" : "Acquisition α(x)"}</text>
        </g>
        {[-5,-4,-3,-2,-1,0,1,2,3,4,5].map((x) => <g key={x}><line x1={sx(x)} x2={sx(x)} y1={sampleBase} y2={sampleBase + 6} /><text x={sx(x)} y={sampleBase + 23} textAnchor="middle">{x}</text></g>)}
        <text x={W - 4 * screenScale} y={sampleBase - 8 * ui} textAnchor="end">x</text>
      </g>
      <g aria-hidden={stage < 6 || stage === 8} style={{ pointerEvents: stage === 6 || stage === 7 ? "auto" : "none" }}>
        {orderedCandidates.map(({ candidate, index: i }) => {
          const isWinner = i === data.selectedIndex;
          const sampled = !intro ? Number(i < drawn) * clamp((p - 5) * 4) : i < 3 ? clamp((p - 5.25 - i * 0.18) / 0.18) : clamp((p - 5.79 - (i - 3) / Math.max(1, data.candidates.length - 3) * 0.12) / 0.09);
          const ratio = ratioPlot.candidates[i];
          let x = sx(candidate.params.x);
          let y = sampleBase;
          y -= ratio * ratioScale * scoreVisibility;
          if (evaluation > 0 && isWinner) {
            const startY = bottom - ratio * ratioScale;
            if (evaluation < 0.2) y = mix(startY, bottom, ease(evaluation / 0.2));
            else y = mix(bottom, sy(nextTrial.y), ease(clamp((evaluation - 0.35) / 0.5)));
          }
          const opacity = sampled * (isWinner ? 1 : (1 - clamp(evaluation / 0.25)));
          if (!intro && i >= drawn) return null;
          return <g key={`${settings.seed}-${i}`} data-candidate={i} style={pointStyle(x, y, "var(--acquisition)", opacity)}>
            {stage === 6 && ((sampled > 0 && sampled < 1) || inspected === i || (!intro && i === visibleDrawn - 1)) && <g className="journey-draw-source">
              <circle cx="0" cy={goodBase - Math.exp(candidate.logL) * densityScale - y} r="7" />
              <line x1="0" x2="0" y1={sampleBase - y} y2={goodBase - Math.exp(candidate.logL) * densityScale - y} />
              <text x="10" y={goodBase - Math.exp(candidate.logL) * densityScale - y - 12}>z<tspan dy="0.27em" fontSize="73%">{i + 1}</tspan></text>
            </g>}
            {stage === 6 && inspected === i && <text className="journey-candidate-label" x="0" y="49" textAnchor="middle">z<tspan dy="0.27em" fontSize="73%">{i + 1}</tspan></text>}
            {isWinner && p >= 7 && <g className="journey-winner-halo" aria-hidden="true"><circle r="13" /><path d="M0,-24 L-5,-32 L5,-32 Z" /></g>}
            <circle style={{ "--draw-offset": `${goodBase - Math.exp(candidate.logL) * densityScale - sampleBase}px` } as CSSProperties} className={`journey-candidate ${!intro && stage === 6 ? "journey-roll-in" : ""} ${isWinner && p >= 7 ? "winner" : ""}`} r={isWinner && p >= 7 ? 8 : 5} tabIndex={(stage === 6 || stage === 7) && !animating ? 0 : -1} role="button" aria-label={`Candidate z${i + 1} at x ${candidate.params.x.toFixed(1)}${stage >= 7 ? `, acquisition ${Math.exp(candidate.score).toPrecision(4)}${isWinner ? ", selected" : ""}` : ""}`} onClick={() => setInspected(i)} onFocus={() => setInspected(i)} onMouseEnter={() => setInspected(i)} onMouseLeave={() => setInspected(null)} onBlur={() => setInspected(null)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setInspected(i); } }} />
          </g>;
        })}
      </g>
      {p >= 7 && <g className="journey-next-input">
        <line x1={sx(nextTrial.x)} x2={sx(nextTrial.x)} y1={bottom} y2={stage === 8 ? sy(nextTrial.y) : bottom - ratioPlot.candidates[data.selectedIndex] * ratioScale} opacity={stage === 8 ? clamp((evaluation - 0.65) / 0.35) : 0.5} />
        {stage === 8 && evaluation > 0.85 && <g opacity={clamp((evaluation - 0.85) / 0.15)}>
          <line x1={sx(nextTrial.x)} x2={mix(sx(nextTrial.x), left, (evaluation - 0.85) / 0.15)} y1={sy(nextTrial.y)} y2={sy(nextTrial.y)} />
          <g className="journey-next-label journey-y-next-label" transform={`translate(${left + 8 * ui}, ${Math.max(40 * ui, sy(nextTrial.y))}) scale(${ui})`}>
            <text x="0" y="-14">y<tspan baselineShift="sub" fontSize="58%">next</tspan> = {nextTrial.y.toFixed(1)}</text>
          </g>
        </g>}
        <circle cx={sx(nextTrial.x)} cy={bottom} r="5" />
        <g className="journey-next-label" transform={`translate(${Math.max(left + 80 * ui, Math.min(right - 80 * ui, sx(nextTrial.x)))}, ${bottom}) scale(${ui})`}>
          <text x="0" y="38" textAnchor="middle">x<tspan baselineShift="sub" fontSize="58%">next</tspan> = {nextTrial.x.toFixed(1)}</text>
        </g>
      </g>}
      {shownObservation && <g className="journey-next-input">
        <circle cx={sx(shownObservation.x)} cy={bottom} r="4" />
        <text x={Math.max(50 * ui, Math.min(W - 50 * ui, sx(shownObservation.x)))} y={bottom + 27 * ui} textAnchor="middle">x<tspan baselineShift="sub" fontSize="65%">{shownObservation.id}</tspan> = {shownObservation.x.toFixed(1)}</text>
      </g>}
      {!intro && ((stage === 1 && initialComplete) || stage === 2) && <g className="journey-split-target" role="button" tabIndex={0}
        aria-label="Split the observations here. Use up and down arrows to adjust the split, then Enter."
        onPointerDown={(event) => event.preventDefault()}
        onPointerMove={(event) => inspectSplitPoint(event.clientX, event.clientY)}
        onPointerLeave={() => setFocused(null)}
        onClick={(event) => {
          if (animating) return;
          if (event.detail === 0) confirmSplit();
          else splitAt(event.clientX, event.clientY);
        }}
        onKeyDown={(event) => {
          if (!["ArrowUp", "ArrowDown", "Enter", " "].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          if (animating) return;
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            const count = Math.max(1, Math.min(history.length - 1, data.partition.good.length + (event.key === "ArrowUp" ? 1 : -1)));
            change({ gamma: fractionForCount(count, history.length) });
            setFocused(null);
          } else confirmSplit();
        }}>
        <rect x={left} y="35" width={right - left} height={bottom - 35} fill="transparent" />
        <circle className="journey-split-focus" cx={left + 14 * screenScale} cy={sy(data.partition.threshold)} r={10 * screenScale} aria-hidden="true" />
        {stage === 1 && <g className="journey-tap-marker" transform={`translate(${sx(-3.6)}, ${sy(data.partition.threshold)}) scale(${ui})`} aria-hidden="true">
          <circle className="journey-tap-ring" r="21" /><circle r="14" />
          <path d="M-5 0H5M0-5V5" />
          <rect x="28" y="-18" width="112" height="36" rx="18" />
          <text x="84" y="5" textAnchor="middle">Tap to split</text>
        </g>}
      </g>}
    </svg>
    </div>
    {!intro && <div className="journey-task" aria-live="polite">
      {stage === 1 && !initialComplete && <><strong>Pick 3 points on the highlighted x-axis · {chosen.length} / 3</strong>{chosen.length === 3 && <span>Adding 7 spread-out inputs · {autoShown} / 7</span>}</>}
      {(stage === 1 || stage === 2) && initialComplete && <span>{history.length} observations · Tap a height on the grid to split.</span>}
      {stage === 4 && <strong>{allKernels ? "Kernels ready · tune h below" : placed.length >= 3 ? "Adding the remaining kernels…" : `Tap 3 points · ${placed.length} / 3`}</strong>}
      {stage === 6 && <>
        <button className={visibleDrawn === 0 ? "journey-action journey-primary journey-first-roll" : "journey-die"}
          disabled={animating || visibleDrawn >= settings.candidates} onClick={() => roll()}
          aria-label={visibleDrawn === 0 ? "Roll the dice" : `${visibleDrawn >= settings.candidates ? "All candidates sampled" : "Roll next candidate"}. Latest roll: ${data.candidates[visibleDrawn - 1]?.params.x.toFixed(1)}`}>
          {visibleDrawn === 0 ? "⚄ Roll the dice" : <span className="journey-die-face" key={`${settings.seed}-${visibleDrawn}`}>
            <small>z{visibleDrawn}</small><strong>{data.candidates[visibleDrawn - 1]?.params.x.toFixed(1)}</strong>
          </span>}
        </button>
        <span className="journey-roll-status">{visibleDrawn} / {settings.candidates} candidates{visibleDrawn > 0 && visibleDrawn < settings.candidates && <small>Tap the die to roll again</small>}</span>
        {visibleDrawn > 0 && visibleDrawn < settings.candidates && <button className="journey-action" disabled={animating} onClick={() => roll(true)}>Roll the rest →</button>}
      </>}

    </div>}
    <div className="journey-controls" ref={controlsRef}>
      {activeHint && <LabHintBubble key={activeHint} id={activeHint} phase={hintPhase} container={controlsRef} onDismiss={() => dismissHint(activeHint)} />}
      <fieldset disabled={stage === 8} aria-disabled={controlDisabled}>
        {(stage === 2 || stage === 3 || stage === 4) && <Range hint="gamma" hinted={activeHint === "gamma"} name="Good fraction" symbol="γ" value={settings.gamma} min={1 / history.length} max={(history.length - 1) / history.length} step={1 / history.length} onChange={(gamma) => { noteControlUsed("gamma"); change({ gamma: fractionForCount(Math.round(gamma * history.length), history.length) }); }} />}
        {stage === 4 && <Range hint="bandwidth" hinted={activeHint === "bandwidth"} name="Bandwidth" symbol="h" value={settings.bandwidth} min={0.2} max={1.5} step={0.05} onChange={(bandwidth) => { noteControlUsed("bandwidth"); change({ bandwidth }); }} />}
        {stage === 5 && <><Range audio={audio} hint="prior" hinted={activeHint === "prior"} name="Prior" symbol="α" value={settings.priorWeight} min={0} max={10} step={0.25} onChange={(priorWeight) => { noteControlUsed("prior"); change({ priorWeight }); }} />
          <label className="journey-weight" data-hint-anchor="weights">Weighting <select aria-label="Weighting" aria-describedby={activeHint === "weights" ? labHintElementId : undefined} value={settings.weights} onChange={(e) => { noteControlUsed("weights"); change({ weights: e.target.value as ExplanationSettings["weights"] }); }}><option value="uniform">Uniform</option><option value="recency">Recency</option><option value="ei">Improvement</option></select></label>
          <details className="journey-weight-details"><summary aria-label="Weight formula" title="Weight formula">ⓘ</summary><div><span className="journey-weight-note">{weightDescription}</span><JourneyMath tex={weightMath} /></div></details></>}
        {(stage === 6 || stage === 7) && <><Range hint="candidates" hinted={activeHint === "candidates"} name="Candidates" symbol="M" value={settings.candidates} min={1} max={40} step={1} onChange={(candidates) => { noteControlUsed("candidates"); change({ candidates }); }} /><button className="journey-icon" aria-label="Resample candidates" title="Resample candidates" onClick={() => { if (controlDisabled) return; change({ seed: settings.seed + 1 }); }}>↻</button></>}
      </fieldset>
    </div>
    <nav className="journey-navigation" aria-label="Walkthrough navigation">
      <button className="journey-reset" aria-label="Restart walkthrough" title="Reset all observations and settings" onClick={restart}>Start over</button>
      <button className="journey-replay" aria-label="Replay current step" aria-disabled={intro || stage === 0 || animating || (taskPending && stage !== 4)} onClick={replayStep}>↻ Replay</button>
      <button className="journey-arrow" aria-label="Previous step" aria-disabled={stage === 0 || (rounds === 0 && animating)} onClick={() => move(-1)}>←</button>
      <span aria-live="polite">{stages[stage]}</span>
      <button className="journey-arrow" aria-label={stage === 8 ? "Continue with new observation" : "Next step"} title={stage === 8 ? "Continue with new observation" : "Next step"} aria-disabled={intro || (stage === 1 || (rounds === 0 && (animating || taskPending)))} onClick={() => move(1)}>→</button>
    </nav>
  </section></>;
}
