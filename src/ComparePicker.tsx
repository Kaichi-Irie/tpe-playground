import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { compareOptionsForPage, getCompareSampler, type CompareSamplerId, type SamplerId, type SamplerPage } from "./samplers";

export function ComparePicker({ page, focus, selected, constrained = false, onChange }: {
  page: SamplerPage;
  focus: SamplerId;
  selected: readonly CompareSamplerId[];
  constrained?: boolean;
  onChange: (next: CompareSamplerId[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape, true);
    };
  }, [open]);

  return <div className="compare-picker" ref={wrapper}>
    <button ref={trigger} type="button" aria-expanded={open} aria-haspopup="true" aria-controls={open ? id : undefined}
      onClick={() => setOpen(!open)}>{selected.length > 0 ? `Compare (${selected.length})` : "+ Compare"}</button>
    {open && <div className="compare-popover" id={id} role="group" aria-label="Compare samplers">
      {compareOptionsForPage(page, focus).map((option) => {
        const checked = selected.includes(option.id);
        const disabled = constrained && !option.supportsConstraints;
        return <label key={option.id}>
          <input type="checkbox" checked={checked} disabled={disabled}
            onChange={() => onChange(checked ? selected.filter((id) => id !== option.id) : [...selected, option.id])} />
          <CompareSwatch id={option.id} />{option.label}
          {disabled && <span className="compare-unavailable">No constraints</span>}
        </label>;
      })}
      {selected.length > 0 && <button type="button" onClick={() => { onChange([]); trigger.current?.focus(); }}>Clear</button>}
    </div>}
  </div>;
}

function CompareSwatch({ id }: { id: CompareSamplerId }) {
  const { colorToken, dashed } = getCompareSampler(id);
  return <i aria-hidden="true" className={dashed ? "compare-swatch is-dashed" : "compare-swatch"} style={{ "--compare-color": `var(${colorToken})` } as CSSProperties} />;
}

export function CompareLegend({ focus, selected }: { focus: SamplerId; selected: readonly CompareSamplerId[] }) {
  return <div className="compare-legend" role="group" aria-label="Sampler colors">
    {[focus, ...selected].map((id) => <span key={id} aria-label={getCompareSampler(id).label}><CompareSwatch id={id} />{getCompareSampler(id).shortLabel}</span>)}
  </div>;
}
