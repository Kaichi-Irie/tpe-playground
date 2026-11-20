import { useEffect, useMemo, useRef, useState } from "react";
import { usePlotSize } from "./usePlotSize";
import { getObjective, type ObjectivePreset } from "./objectives";
import { explanationGrid } from "./explanation";
import type { Trial } from "./oneParamTpe";

const command = "python tpe.py";

export default function LabIntro({ trials, nextX, objectivePreset, onExplore }: {
  trials: readonly Trial[];
  nextX: number;
  objectivePreset: ObjectivePreset;
  onExplore: () => void;
}) {
  const exploreRef = useRef<HTMLButtonElement>(null);
  const skipFocused = useRef(false);
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const typed = Math.min(command.length, Math.max(0, tick - 5));
  const observed = Math.min(trials.length, Math.max(0, Math.floor((tick - 21) / 6)));
  const doneAt = 21 + trials.length * 6 + 8;
  const ready = tick >= doneAt;
  useEffect(() => {
    if (ready && skipFocused.current) {
      exploreRef.current?.focus({ preventScroll: true });
      skipFocused.current = false;
    }
  }, [ready]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTick(doneAt);
      return;
    }
    if (paused || ready) return;
    const timer = window.setTimeout(() => setTick((value) => value + 1), 100);
    return () => window.clearTimeout(timer);
  }, [tick, paused, ready, doneAt]);
  const objectiveValues = useMemo(() => explanationGrid.map((x) => getObjective(objectivePreset).evaluate(x)), [objectivePreset]);
  const revealObjective = observed === trials.length;
  const plot = usePlotSize();
  const width = Math.max(240, plot.width), height = Math.max(140, plot.height);
  // Margins and label offsets grow with the fluid chart text size.
  const u = plot.typeScale;
  const left = 30 * u, right = width - 20 * u, top = 26 * u, bottom = height - 28 * u;
  const sx = (x: number) => left + (x + 5) / 10 * (right - left);
  const sy = (y: number) => bottom - y / 8 * (bottom - top - 8);
  const proposalX = sx(nextX);
  return <section className="lab-intro" aria-label="TPE experiment preview">
    <div className="lab-intro-heading"><h2>Find the x that minimizes y.</h2><p>Try x. Observe y = f(x). Let TPE choose where to try next.</p></div>
    <div className="lab-intro-workbench">
      <div className="lab-terminal" aria-label="Simulated Python terminal">
        <div className="lab-terminal-title"><span>tpe.py · experiment</span><div className="lab-terminal-actions">{!ready && <button className="lab-skip" onFocus={() => { skipFocused.current = true; }} onBlur={() => { skipFocused.current = false; }} onClick={() => setTick(doneAt)}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M3 3l7 5-7 5V3ZM11 3h2v10h-2z" /></svg>Skip</button>}<button onClick={() => setPaused((value) => !value)} disabled={ready}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d={paused ? "M4 2l9 6-9 6V2Z" : "M3 2h4v12H3zM9 2h4v12H9z"} /></svg>{paused ? "Resume" : "Pause"}</button></div></div>
        <div className="lab-command" aria-label={`Command: ${command}`}><span aria-hidden="true"><span className="lab-prompt">$ </span><span className="lab-executable">{command.slice(0, Math.min(typed, 6))}</span><span className="lab-filename">{command.slice(6, typed)}</span><span className={typed < command.length ? "lab-cursor" : "lab-cursor lab-cursor-rest"}>▍</span></span></div>
        <div className="lab-log" aria-label={`${observed} completed observations`}>
          {trials.slice(0, observed).map((trial, index) => <div key={trial.id} className={`${index === observed - 1 ? "lab-log-current" : ""} ${index < observed - 3 ? "lab-log-older" : ""}`}><span>trial {String(trial.id).padStart(2, "0")}</span><span>x <b className="lab-log-x">{trial.x.toFixed(2)}</b></span><span>y <b className="lab-log-y">{trial.y.toFixed(2)}</b></span></div>)}
          {ready && <div className="lab-proposal-log"><span className="lab-proposal-source">TPE suggests:</span><span className="lab-proposal-value">observe y at x = {nextX.toFixed(2)}</span></div>}
        </div>
      </div>
      <div className="lab-intro-plot">
        <div className="lab-plot-caption"><span>Lower y is better ↓</span><span>{observed} observations</span></div>
        <div className="lab-curve-caption">{revealObjective ? "Dashed curve: true y = f(x), revealed for illustration" : "The function is hidden. Each trial reveals one value."}</div>
        <div className="lab-plot-explore" aria-live="polite">
          {ready && <>
            <span id="lab-explore-question">Why here?</span>
            <button ref={exploreRef} className="journey-action journey-primary" aria-describedby="lab-explore-question" onClick={onExplore}>Explore →</button>
          </>}
        </div>
        <svg ref={plot.ref} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${observed} observations${ready ? `; next proposed x ${nextX.toFixed(2)}, not yet evaluated` : ""}`}>
          <g className="lab-axes"><line x1={left} y1={top} x2={left} y2={bottom} /><line x1={left} y1={bottom} x2={right} y2={bottom} />{[-5, 0, 5].map((x) => <text key={x} x={sx(x)} y={height - 7 * u} textAnchor="middle">{x}</text>)}{[0, 4, 8].map((y) => <text key={y} x={20 * u} y={sy(y) + 5 * u} textAnchor="end">{y}</text>)}<text x={width - 9 * u} y={height - 7 * u}>x</text><text x={left + 6 * u} y={top + 4 * u}>y</text></g>
          {revealObjective && <path className="lab-objective-curve" d={objectiveValues.map((y, index) => `${index ? "L" : "M"}${sx(explanationGrid[index])},${sy(y)}`).join(" ")} />}
          {trials.slice(0, observed).map((trial, index) => <g key={trial.id} className={index === observed - 1 ? "lab-point lab-point-current" : "lab-point"}><circle cx={sx(trial.x)} cy={sy(trial.y)} r={index === observed - 1 ? 5 : 3.5} /><text x={sx(trial.x)} y={sy(trial.y) + (index === observed - 1 ? 19 : -10) * u} textAnchor="middle">{trial.id}</text></g>)}
          {ready && <g className="lab-next">
            <line x1={proposalX} x2={proposalX} y1={top} y2={bottom} />
            <text x={Math.max(70 * u, Math.min(width - 70 * u, proposalX))} y={top - 9 * u} textAnchor="middle">next x = {nextX.toFixed(2)}</text>
          </g>}
        </svg>
      </div>
    </div>
  </section>;
}
