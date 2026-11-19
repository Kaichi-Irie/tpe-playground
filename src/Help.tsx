import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// The top edge of the nearest ancestor that clips overflow, or the viewport.
function clippingTop(element: Element): number {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (getComputedStyle(parent).overflowY !== "visible") return parent.getBoundingClientRect().top;
  }
  return 0;
}

export function Help({ label, children, trigger = "ⓘ", className, disabled = false }: {
  label: string; children: ReactNode; trigger?: string; className?: string; disabled?: boolean;
}) {
  const id = useId();
  const container = useRef<HTMLSpanElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [below, setBelow] = useState(false);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useLayoutEffect(() => {
    if (!open) { setBelow(false); return; }
    const tooltip = content.current;
    if (tooltip && tooltip.getBoundingClientRect().top < clippingTop(tooltip)) setBelow(true);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [open]);
  const show = () => { if (!disabled) setOpen(true); };
  return <span ref={container} className={className ? `help ${className}` : "help"} onMouseEnter={show} onMouseLeave={() => setOpen(false)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); event.stopPropagation(); } }}>
    <button type="button" className="help-trigger" aria-label={`About ${label}`} aria-expanded={open} aria-controls={id} aria-describedby={open ? id : undefined} aria-disabled={disabled || undefined} onFocus={show} onClick={show}>{trigger}</button>
    <span ref={content} id={id} role="tooltip" className="help-content" data-placement={below ? "below" : undefined} hidden={!open}>{children}</span>
  </span>;
}
