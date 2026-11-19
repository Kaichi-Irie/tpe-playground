import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function Help({ label, children, trigger = "ⓘ", className, disabled = false }: {
  label: string; children: ReactNode; trigger?: string; className?: string; disabled?: boolean;
}) {
  const id = useId();
  const container = useRef<HTMLSpanElement>(null);
  const [requestedOpen, setOpen] = useState(false);
  const open = requestedOpen && !disabled;
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
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
    <button type="button" className="help-trigger" aria-label={`About ${label}`} aria-expanded={open} aria-controls={id} aria-describedby={open ? id : undefined} disabled={disabled} onFocus={show} onClick={show}>{trigger}</button>
    <span id={id} role="tooltip" className="help-content" hidden={!open}>{children}</span>
  </span>;
}
