export type PlayGuideId = "playback" | "gamma" | "bandwidth" | "rotate" | "acquisition";
type PlayGuidePage = "play-2d" | "play-3d";

export const playGuides: Record<PlayGuideId, { label: string; action: string }> = {
  playback: {
    label: "Playback",
    action: "Press Play, or step forward with →, to evaluate trials one at a time.",
  },
  gamma: {
    label: "Good fraction",
    action: "Drag Good fraction γ to move the Good/Bad split and reshape ℓ and g.",
  },
  bandwidth: {
    label: "Bandwidth",
    action: "Drag Bandwidth h to widen or narrow every kernel bump.",
  },
  rotate: {
    label: "Rotate and zoom",
    action: "Drag the landscape to turn it. Use + and − to zoom.",
  },
  acquisition: {
    label: "Acquisition",
    action: "Turn on Acquisition to see log ℓ/g. TPE picks the candidate where it is highest.",
  },
};

export interface PlayGuideContext {
  page: PlayGuidePage;
  step: number;
  startupTrials: number;
  acquisitionVisible: boolean;
  seeking: boolean;
}

export function nextPlayGuide(
  { page, step, startupTrials, acquisitionVisible, seeking }: PlayGuideContext,
  seen: ReadonlySet<PlayGuideId>,
): PlayGuideId | null {
  if (seeking) return null;
  if (step === 0 && !seen.has("playback")) return "playback";
  if (step >= 2 && !seen.has("gamma")) return "gamma";
  if (step >= 2 && !seen.has("bandwidth")) return "bandwidth";
  if (page === "play-3d" && step >= 2 && !seen.has("rotate")) return "rotate";
  if (step >= startupTrials && !acquisitionVisible && !seen.has("acquisition")) return "acquisition";
  return null;
}

export function completedPlayGuides({ step, acquisitionVisible }: PlayGuideContext): PlayGuideId[] {
  const completed: PlayGuideId[] = [];
  if (step > 0) completed.push("playback");
  if (acquisitionVisible) completed.push("acquisition");
  return completed;
}

function storageKey(page: PlayGuidePage) {
  return `tpe-play-guides-seen-${page}`;
}

export function loadSeenPlayGuides(page: PlayGuidePage): Set<PlayGuideId> {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(storageKey(page)) ?? "[]");
    return new Set(Array.isArray(parsed)
      ? parsed.filter((id): id is PlayGuideId => typeof id === "string" && Object.hasOwn(playGuides, id))
      : []);
  } catch {
    return new Set();
  }
}

export function saveSeenPlayGuides(page: PlayGuidePage, seen: ReadonlySet<PlayGuideId>) {
  try {
    sessionStorage.setItem(storageKey(page), JSON.stringify([...seen]));
  } catch { /* Guides still work for this visit when storage is blocked. */ }
}
