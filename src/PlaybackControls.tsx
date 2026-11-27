import { nextPlaybackSpeed, playbackSpeeds, type PlaybackSpeed } from "./playbackSpeed";

interface Props {
  step: number;
  limit: number;
  playing: boolean;
  speed: PlaybackSpeed;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  onMove: (step: number) => void;
  onToggle: () => void;
  idSuffix?: string;
  labelPrefix?: string;
  describedBy?: string;
  guidePlay?: boolean;
  guideDescribedBy?: string;
  targetStep?: number | null;
  disabled?: boolean;
}

const actionIcons = {
  Play: <path fill="currentColor" d="M8 5.6v12.8a1 1 0 0 0 1.52.85l10.2-6.4a1 1 0 0 0 0-1.7L9.52 4.75A1 1 0 0 0 8 5.6z" />,
  Pause: <>
    <rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" />
    <rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" />
  </>,
  Replay: <path d="M5 4v5h5M5.6 9A7 7 0 1 1 5 14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
};

// Owns only the controls: the explorer decides how moving affects its history.
export function PlaybackControls({ step, limit, playing, speed, onSpeedChange, onMove, onToggle, idSuffix = "", labelPrefix = "", describedBy, targetStep = null, guidePlay, guideDescribedBy, disabled = false }: Props) {
  const complete = step === limit;
  const active = playing && !complete;
  const action = active ? "Pause" : complete ? "Replay" : "Play";
  const speedLabel = `Playback speed: ${speed}x`;
  const timeline = <input id={`trial-progress${idSuffix}`} type="range" min="0" max={limit} step="1" value={targetStep ?? step} aria-label={`${labelPrefix}Trial progress`} aria-valuetext={targetStep === null ? `Trial ${step} of ${limit}` : `Moving to trial ${targetStep}; currently ${step} of ${limit}`} aria-describedby={describedBy} disabled={disabled} onChange={(event) => onMove(Number(event.target.value))} />;
  return <div className="playback canvas-playback primary-playback" aria-label={`${labelPrefix}Trial playback`}>
    <div className="playback-capsule">
      <button type="button" aria-label="Reset" title="Reset to trial 0" onClick={() => onMove(0)} disabled={disabled || (step === 0 && targetStep === null)}>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
          <rect x="4" y="5" width="3" height="14" rx="1" />
          <path d="M19 5.6v12.8a1 1 0 0 1-1.52.85l-8.2-6.4a1 1 0 0 1 0-1.7l8.2-6.4A1 1 0 0 1 19 5.6z" />
        </svg>
      </button>
      <button type="button" aria-label="Previous trial" title="Back one trial" onClick={() => onMove(step - 1)} disabled={disabled || step === 0}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M20 12H4m6-6-6 6 6 6" />
        </svg>
      </button>
      <button className="play" aria-label={action} title={action} data-guide-target={guidePlay || undefined} aria-describedby={guidePlay ? guideDescribedBy : undefined} disabled={disabled} onClick={onToggle}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">{actionIcons[action]}</svg>
        <span>{action}</span>
      </button>
      <button type="button" aria-label="Next trial" title="Forward one trial" onClick={() => onMove(step + 1)} disabled={disabled || complete}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M4 12h16m-6-6 6 6-6 6" />
        </svg>
      </button>
      <span className="playback-divider" aria-hidden="true" />
      <button type="button" className="playback-speed" aria-label={`${labelPrefix}${speedLabel}`} title={`${speedLabel}. Click for faster, Shift+click for slower.`}
        onClick={(event) => onSpeedChange(nextPlaybackSpeed(speed, event.shiftKey ? -1 : 1))}>
        <span className="speed-gauge" aria-hidden="true">{"›".repeat(playbackSpeeds.indexOf(speed) + 1)}</span>
        <span aria-hidden="true">{speed === 0.5 ? "½×" : `${speed}×`}</span>
      </button>
    </div>
    <div className="trial-timeline"><label htmlFor={`trial-progress${idSuffix}`} aria-label={`Trial ${step} / ${limit}`}>Trial <span>{step} / {limit}</span></label>{timeline}</div>
  </div>;
}
