import tippyGuide from "./assets/tippy-guide.webp";

export const labHintElementId = "lab-guide-text";

export default function LabHintBubble({ message, phase, onDismiss }: {
  message: string;
  phase: "action" | "meaning";
  onDismiss: () => void;
}) {
  return <div className="lab-guide" onKeyDown={(event) => {
    if (event.key === "Escape" && !event.defaultPrevented) onDismiss();
  }}>
    <img className="lab-guide-tippy" src={tippyGuide} width="288" height="245" alt="" />
    <div className={`lab-hint lab-hint-${phase}`}>
      <p id={labHintElementId}>{message}</p>
      <button type="button" className="lab-hint-dismiss" onClick={onDismiss}
        aria-label={phase === "action" ? "Skip this hint" : "Dismiss hint"}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  </div>;
}
