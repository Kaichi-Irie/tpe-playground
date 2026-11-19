import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { labHints, type LabHintId } from "./labHints";

export const labHintElementId = "lab-control-hint";
const edge = 8;

/** Points at a control inside `container` (marked with data-hint-anchor). */
export default function LabHintBubble({ id, phase, container, onDismiss }: {
  id: LabHintId;
  phase: "action" | "meaning";
  container: RefObject<HTMLElement | null>;
  onDismiss: () => void;
}) {
  const bubble = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; arrow: number } | null>(null);
  useLayoutEffect(() => {
    const host = container.current;
    if (!host) return;
    const measure = () => {
      const anchor = host.querySelector(`[data-hint-anchor="${id}"]`);
      const box = bubble.current;
      if (!anchor || !box) return;
      const hostRect = host.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const center = anchorRect.left + anchorRect.width / 2 - hostRect.left;
      const width = box.offsetWidth;
      const left = Math.max(edge, Math.min(hostRect.width - width - edge, center - width / 2));
      setPlace({ left, arrow: Math.max(16, Math.min(width - 16, center - left)) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    if (bubble.current) observer.observe(bubble.current);
    return () => observer.disconnect();
  }, [container, id, phase]);
  const hint = labHints[id];
  return <div ref={bubble} id={labHintElementId} className={`lab-hint lab-hint-${phase}`} data-placed={place !== null}
    style={{ "--hint-left": `${place?.left ?? 0}px`, "--hint-arrow": `${place?.arrow ?? 0}px` } as CSSProperties}
    role="status">
    {phase === "action"
      ? <p><span className="lab-hint-try" aria-hidden="true" />{hint.action}</p>
      : <p>{hint.meaning}</p>}
    <button type="button" className="lab-hint-dismiss" onClick={onDismiss} aria-label={phase === "action" ? "Skip this hint" : "Dismiss hint"}>
      {phase === "action" ? "×" : "Got it"}
    </button>
  </div>;
}
