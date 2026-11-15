interface Props {
  step: number;
  limit: number;
  playing: boolean;
  onMove: (step: number) => void;
  onToggle: () => void;
  idSuffix?: string;
  labelPrefix?: string;
  describedBy?: string;
  targetStep?: number | null;
}

// Owns only the controls: the explorer decides how moving affects its history.
export function PlaybackControls({ step, limit, playing, onMove, onToggle, idSuffix = "", labelPrefix = "", describedBy, targetStep = null }: Props) {
  const complete = step === limit;
  const active = playing && !complete;
  const action = active ? "Pause" : complete ? "Replay" : "Play";
  const play = <button className="play" aria-label={action} title={action} onClick={onToggle}><span aria-hidden="true">{active ? "Ⅱ" : "▶"}</span>{action}</button>;
  const timeline = <input id={`trial-progress${idSuffix}`} type="range" min="0" max={limit} step="1" value={targetStep ?? step} aria-label={`${labelPrefix}Trial progress`} aria-valuetext={targetStep === null ? `Trial ${step} of ${limit}` : `Moving to trial ${targetStep}; currently ${step} of ${limit}`} aria-describedby={describedBy} onChange={(event) => onMove(Number(event.target.value))} />;
  return <div className="playback canvas-playback primary-playback" aria-label={`${labelPrefix}Trial playback`}>
    {play}
    <div className="playback-buttons">
      <button aria-label="Reset" title="Reset to trial 0" onClick={() => onMove(0)} disabled={step === 0 && targetStep === null}>↺</button>
      <button aria-label="Previous trial" title="Back one trial" onClick={() => onMove(step - 1)} disabled={step === 0}>←</button>
      <button aria-label="Next trial" title="Forward one trial" onClick={() => onMove(step + 1)} disabled={complete}>→</button>
    </div>
    <div className="trial-timeline"><label htmlFor={`trial-progress${idSuffix}`} aria-label={`Trial ${step} / ${limit}`}>Trial <span>{step} / {limit}</span></label>{timeline}</div>
  </div>;
}
