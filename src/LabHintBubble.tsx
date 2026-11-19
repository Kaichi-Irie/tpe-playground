import "./guide-bubble.css";
import tippyGuide from "./assets/tippy-guide.webp";

export const labHintElementId = "lab-guide-text";

export default function LabHintBubble({ message, phase, placement, onDismiss, textId = labHintElementId }: {
  message: string;
  phase: "action" | "meaning";
  placement: "top" | "bottom";
  textId?: string;
  onDismiss: (keyboard: boolean) => void;
}) {
  return <div className="lab-guide" data-placement={placement}>
    <img className="lab-guide-tippy" src={tippyGuide} width="288" height="245" alt="" />
    <div className={`lab-hint lab-hint-${phase}`}>
      <p id={textId}>{message}</p>
      <button type="button" className="lab-hint-dismiss" onClick={(event) => onDismiss(event.detail === 0)}
        aria-label={phase === "action" ? "Skip this hint" : "Dismiss hint"}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  </div>;
}
