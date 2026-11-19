export type LabHintId = "gamma" | "bandwidth" | "prior" | "weights" | "candidates";

export interface LabHint {
  id: LabHintId;
  /** First phase: what to touch and what visibly changes. */
  action: string;
  /** Second phase, after the control is used: what the parameter means. */
  meaning: string;
}

export const labHints: Record<LabHintId, LabHint> = {
  gamma: {
    id: "gamma",
    action: "Drag to move the Good/Bad line.",
    meaning: "γ is the share of observations counted as Good. A smaller γ is pickier about what counts as good.",
  },
  bandwidth: {
    id: "bandwidth",
    action: "Drag to make each bump wider or narrower.",
    meaning: "h sets how far one observation's influence spreads. Wide bumps blur the data; narrow ones trust each point.",
  },
  prior: {
    id: "prior",
    action: "Drag to thicken the pink prior layer.",
    meaning: "α mixes in a broad guess that good inputs could be anywhere, so the search keeps exploring.",
  },
  weights: {
    id: "weights",
    action: "Change to reshape the bump heights.",
    meaning: "Weighting decides which observations count more: all equally, newer ones, or ones that improved more.",
  },
  candidates: {
    id: "candidates",
    action: "Drag to change how many candidates compete.",
    meaning: "M is how many candidates are drawn from ℓ. Only the one with the best ℓ/g is evaluated.",
  },
};

export interface HintContext {
  stage: number;
  /** A guided task (tapping kernels) still needs the learner's attention. */
  taskPending: boolean;
}

/** Controls introduced in each stage, in the order their hints appear. */
export function hintsForStage({ stage, taskPending }: HintContext): LabHintId[] {
  if (stage === 2) return ["gamma"];
  // The kernel-tapping task comes first; a hint would compete with it.
  if (stage === 4) return taskPending ? [] : ["bandwidth"];
  if (stage === 5) return ["prior", "weights"];
  // Sample is about rolling the dice, and raising M there restarts that task.
  // In Choose, M immediately changes which candidates compete and the winner.
  if (stage === 7) return ["candidates"];
  return [];
}

export function nextHint(context: HintContext, seen: ReadonlySet<LabHintId>): LabHintId | null {
  return hintsForStage(context).find((id) => !seen.has(id)) ?? null;
}

const storageKey = "tpe-lab-hints-seen";

export function loadSeenHints(): Set<LabHintId> {
  try {
    localStorage.removeItem(storageKey);
  } catch { /* The legacy key is independent of the current tab's storage. */ }
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is LabHintId => typeof id === "string" && id in labHints) : []);
  } catch {
    return new Set();
  }
}

export function saveSeenHints(seen: ReadonlySet<LabHintId>) {
  if (!seen.size) {
    clearSeenHints();
    return;
  }
  try {
    sessionStorage.setItem(storageKey, JSON.stringify([...seen]));
  } catch { /* Hints still work for this visit when storage is blocked. */ }
}

export function clearSeenHints() {
  try {
    sessionStorage.removeItem(storageKey);
  } catch { /* Hints still work for this visit when storage is blocked. */ }
}
