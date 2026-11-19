import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { completedPlayGuides, loadSeenPlayGuides, nextPlayGuide, saveSeenPlayGuides, type PlayGuideContext, type PlayGuideId } from "./playGuides";

export function usePlayGuide<T extends HTMLElement = HTMLElement>({ page, step, startupTrials, acquisitionVisible, seeking }: PlayGuideContext, enabled = true) {
  const [seen, setSeen] = useState(() => loadSeenPlayGuides(page));
  const workspaceRef = useRef<T>(null);
  const textId = `play-guide-text-${page}`;
  const context = useMemo(() => ({ page, step, startupTrials, acquisitionVisible, seeking }), [page, step, startupTrials, acquisitionVisible, seeking]);
  const active = enabled ? nextPlayGuide(context, seen) : null;

  function retire(...ids: PlayGuideId[]) {
    setSeen((current) => ids.some((id) => !current.has(id)) ? new Set([...current, ...ids]) : current);
  }

  useEffect(() => { retire(...completedPlayGuides(context)); }, [context]);
  useEffect(() => { saveSeenPlayGuides(page, seen); }, [page, seen]);

  function dismiss(keyboard: boolean) {
    if (!active) return;
    if (keyboard) {
      workspaceRef.current?.querySelector<HTMLElement | SVGElement>("[data-guide-target]")?.focus({ preventScroll: true });
    }
    retire(active);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    // Keep native Escape behavior inside the settings dialog.
    if (event.key === "Escape" && active && !event.defaultPrevented && !(event.target as Element).closest("dialog")) {
      event.preventDefault();
      dismiss(true);
    }
  }

  const settingsGuide = active === "gamma" || active === "bandwidth" ? { id: active, describedBy: textId } as const : undefined;
  return { workspaceRef, textId, active, settingsGuide, retire, dismiss, onKeyDown };
}
