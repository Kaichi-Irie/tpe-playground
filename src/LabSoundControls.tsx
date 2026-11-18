export default function LabSoundControls({ enabled, pending, error, onToggle }: {
  enabled: boolean;
  pending: boolean;
  error: boolean;
  onToggle: () => void;
}) {
  return <div className="lab-sound-controls">
    <button type="button" className="lab-sound-toggle" role="switch" aria-label="Sound effects" aria-checked={enabled} aria-busy={pending} aria-disabled={pending}
      title={enabled ? "Sound is on · click to mute" : "Sound is off · click to enable"} onClick={onToggle}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4Z" />
        {enabled ? <><path d="M15 8a6 6 0 0 1 0 8" /><path d="M18 5a10 10 0 0 1 0 14" /></> : <path d="m16 9 6 6m0-6-6 6" />}
      </svg>
      <span aria-hidden="true">{pending ? "…" : enabled ? "ON" : "OFF"}</span>
    </button>
    {error && <span role="alert">Sound unavailable. Try again.</span>}
  </div>;
}
