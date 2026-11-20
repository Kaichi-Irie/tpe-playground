export type LabHintId = "gamma" | "bandwidth" | "prior" | "weights" | "candidates";

export interface LabHint {
  label: string;
  /** First phase: what to touch and what visibly changes. */
  action: string;
  /** Second phase, after the control is used: what the parameter means. */
  meaning: string;
}

export const labHints: Record<LabHintId, LabHint> = {
  gamma: {
    label: "Good fraction",
    action: "Drag the Good fraction slider to move the Good/Bad line.",
    meaning: "γ sets the share of observations counted as Good. A lower γ is more selective.",
  },
  bandwidth: {
    label: "Bandwidth",
    action: "Drag the Bandwidth slider to make the bumps wider or narrower.",
    meaning: "h sets how far each point influences the curve. Wider bumps smooth out detail.",
  },
  prior: {
    label: "Prior",
    action: "Drag the Prior slider to change how much of the pink layer is mixed in.",
    meaning: "α mixes in a broad guess so the search keeps exploring more of the range.",
  },
  weights: {
    label: "Weighting",
    action: "Choose a Weighting option to change the height of the bumps.",
    meaning: "Weighting can favor newer or more improved points, or count all equally.",
  },
  candidates: {
    label: "Candidates",
    action: "Drag the Candidates slider to change how many candidates compete.",
    meaning: "Draw M candidates from ℓ. Evaluate the one with the best ℓ/g.",
  },
};

export const labHintIds = Object.keys(labHints) as LabHintId[];

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

export const taskGuides = {
  observe: { action: "Tap or click three different positions along the highlighted x-axis.", announcement: "Hint available for choosing inputs." },
  split: { action: "Tap or click the grid at the height that divides Good and Bad.", announcement: "Hint available for splitting the observations." },
  kernels: { action: "Select any three dots to add their kernels. Try the outlined dot first.", announcement: "Hint available for adding kernels." },
  sample: { action: "Select Roll the dice to sample a candidate.", announcement: "Hint available for sampling candidates." },
};

export type LabTaskGuideId = keyof typeof taskGuides;
export const taskGuideIds = Object.keys(taskGuides) as LabTaskGuideId[];

export function guidePlacement(region: "plot" | "control" | "task") {
  return region === "plot" ? "bottom" : "top";
}

export interface GuideContext extends HintContext {
  paused: boolean;
  initialComplete: boolean;
  chosenCount: number;
  splitConfirmed: boolean;
  placedCount: number;
  drawnCount: number;
  candidateCount: number;
}

export function completedTaskGuides({ initialComplete, splitConfirmed, placedCount, stage, drawnCount, candidateCount }: GuideContext): LabTaskGuideId[] {
  const completed: LabTaskGuideId[] = [];
  if (initialComplete) completed.push("observe");
  if (splitConfirmed) completed.push("split");
  if (placedCount >= 3) completed.push("kernels");
  if (stage === 6 && drawnCount >= candidateCount) completed.push("sample");
  return completed;
}

export function nextLabGuide(context: GuideContext, seen: ReadonlySet<LabHintId>, doneTasks: ReadonlySet<LabTaskGuideId>) {
  if (context.paused) return null;
  const { stage, initialComplete, chosenCount, splitConfirmed, taskPending, placedCount, drawnCount, candidateCount } = context;
  let task: LabTaskGuideId | null = null;
  if (stage === 1 && !initialComplete && chosenCount < 3) task = "observe";
  if (stage === 1 && initialComplete && !splitConfirmed) task = "split";
  if (stage === 4 && taskPending && placedCount < 3) task = "kernels";
  if (stage === 6 && drawnCount < candidateCount) task = "sample";
  if (task) return doneTasks.has(task) ? null : { kind: "task", id: task } as const;

  const control = nextHint(context, seen);
  return control ? { kind: "control", id: control } as const : null;
}

const storageKey = "tpe-lab-hints-seen";

export function loadSeenHints(): Set<LabHintId> {
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
