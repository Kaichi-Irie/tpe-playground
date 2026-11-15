import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function Help({ label, children, trigger = "?" }: { label: string; children: ReactNode; trigger?: string }) {
  const id = useId();
  const container = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [open]);
  return <span ref={container} className="help" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); event.stopPropagation(); } }}>
    <button type="button" className="help-trigger" aria-label={`About ${label}`} aria-expanded={open} aria-controls={id} aria-describedby={open ? id : undefined} onFocus={() => setOpen(true)} onClick={() => setOpen(true)}>{trigger}</button>
    <span id={id} role="tooltip" className="help-content" hidden={!open}>{children}</span>
  </span>;
}
