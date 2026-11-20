import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSeenHints, completedTaskGuides, guidePlacement, hintsForStage, labHintIds, loadSeenHints, nextHint, nextLabGuide, saveSeenHints, taskGuideIds, type GuideContext, type LabHintId, type LabTaskGuideId } from "./labHints";

const storageKey = "tpe-lab-hints-seen";

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  });
  return store;
}

function blockedStorage(): never {
  throw new Error("blocked");
}

describe("lab hints", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("introduces each control in the stage where it first appears", () => {
    expect(hintsForStage({ stage: 2, taskPending: false })).toEqual(["gamma"]);
    expect(hintsForStage({ stage: 3, taskPending: false })).toEqual([]);
    expect(hintsForStage({ stage: 5, taskPending: false })).toEqual(["prior", "weights"]);
    expect(hintsForStage({ stage: 7, taskPending: false })).toEqual(["candidates"]);
    expect(hintsForStage({ stage: 8, taskPending: false })).toEqual([]);
  });

  it("waits for the kernel task and leaves the dice stage to its task", () => {
    expect(hintsForStage({ stage: 4, taskPending: true })).toEqual([]);
    expect(hintsForStage({ stage: 4, taskPending: false })).toEqual(["bandwidth"]);
    expect(hintsForStage({ stage: 6, taskPending: true })).toEqual([]);
    expect(hintsForStage({ stage: 6, taskPending: false })).toEqual([]);
  });

  it("shows one unseen hint at a time, in order", () => {
    const context = { stage: 5, taskPending: false };
    expect(nextHint(context, new Set())).toBe("prior");
    expect(nextHint(context, new Set<LabHintId>(["prior"]))).toBe("weights");
    expect(nextHint(context, new Set<LabHintId>(["prior", "weights"]))).toBeNull();
  });

  it("remembers seen hints and ignores unknown or corrupt storage", () => {
    const store = stubStorage();
    saveSeenHints(new Set<LabHintId>(["gamma", "prior"]));
    expect([...loadSeenHints()]).toEqual(["gamma", "prior"]);
    store.set(storageKey, JSON.stringify(["gamma", "unknown", 3]));
    expect([...loadSeenHints()]).toEqual(["gamma"]);
    store.set(storageKey, "{not json");
    expect(loadSeenHints().size).toBe(0);
    saveSeenHints(new Set());
    expect(store.has(storageKey)).toBe(false);
  });

  it("clears the seen hints stored for this tab", () => {
    const store = stubStorage();
    saveSeenHints(new Set(["gamma"]));
    expect(loadSeenHints()).toEqual(new Set(["gamma"]));

    clearSeenHints();

    expect(store.has(storageKey)).toBe(false);
    expect(loadSeenHints().size).toBe(0);
  });

  it("works without storage", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: blockedStorage,
      setItem: blockedStorage,
      removeItem: blockedStorage,
    });
    expect(loadSeenHints().size).toBe(0);
    expect(() => saveSeenHints(new Set<LabHintId>(["gamma"]))).not.toThrow();
    expect(() => clearSeenHints()).not.toThrow();
  });
});

describe("Lab guide priority and milestones", () => {
  it.each([["plot", "bottom"], ["control", "top"], ["task", "top"]] as const)(
    "places the bubble opposite the %s region",
    (region, placement) => expect(guidePlacement(region)).toBe(placement),
  );

  const initial: GuideContext = {
    stage: 1, taskPending: true, paused: false, initialComplete: false, splitConfirmed: false,
    chosenCount: 0, placedCount: 0, drawnCount: 0, candidateCount: 3,
  };

  function guide(patch: Partial<GuideContext>, doneTasks: LabTaskGuideId[] = [], seen: LabHintId[] = []) {
    return nextLabGuide({ ...initial, ...patch }, new Set(seen), new Set(doneTasks));
  }

  it.each<[Partial<GuideContext>, LabTaskGuideId[]]>([
    [{ initialComplete: true }, ["observe"]],
    [{ splitConfirmed: true }, ["split"]],
    [{ stage: 4, placedCount: 3 }, ["kernels"]],
    [{ stage: 4, placedCount: 2 }, []],
    [{ stage: 6, drawnCount: 3 }, ["sample"]],
    [{ stage: 6, drawnCount: 4 }, ["sample"]],
    [{ stage: 6, drawnCount: 2 }, []],
    [{ stage: 7, drawnCount: 3 }, []],
  ])("recognizes completed tasks for %j", (patch, completed) => {
    expect(completedTaskGuides({ ...initial, ...patch })).toEqual(completed);
  });

  it("guides observation and then splitting, without resurfacing after a confirmed split", () => {
    expect(guide({ chosenCount: 2 })).toEqual({ kind: "task", id: "observe" });
    expect(guide({ chosenCount: 3 })).toBeNull();
    expect(guide({ initialComplete: true, taskPending: false })).toEqual({ kind: "task", id: "split" });
    expect(guide({ initialComplete: true, splitConfirmed: true, taskPending: false })).toBeNull();
  });

  it("waits for automatic kernel placement before introducing Bandwidth", () => {
    expect(guide({ stage: 4, placedCount: 2 })).toEqual({ kind: "task", id: "kernels" });
    expect(guide({ stage: 4, placedCount: 2 }, ["kernels"])).toBeNull();
    expect(guide({ stage: 4, placedCount: 3 })).toBeNull();
    expect(guide({ stage: 4, taskPending: false, placedCount: 3 }, ["kernels"])).toEqual({ kind: "control", id: "bandwidth" });
  });

  it("keeps one Sample cue through repeated rolls until all candidates are drawn", () => {
    expect(guide({ stage: 6, drawnCount: 0, candidateCount: 1 })).toEqual({ kind: "task", id: "sample" });
    expect(guide({ stage: 6, drawnCount: 1, candidateCount: 1 })).toBeNull();
    expect(guide({ stage: 6, drawnCount: 1 })).toEqual({ kind: "task", id: "sample" });
    expect(guide({ stage: 6, drawnCount: 2 }, ["sample"])).toBeNull();
    expect(guide({ stage: 6, drawnCount: 3 })).toBeNull();
  });

  it("does not reopen a completed Sample guide after the candidate count grows", () => {
    const patch = { stage: 6, drawnCount: 3, candidateCount: 10 };
    expect(guide(patch, ["sample"])).toBeNull();
    expect(guide(patch)).toEqual({ kind: "task", id: "sample" });
  });

  it.each([1, 2, 4, 5, 6, 7])("suppresses all guides in stage %i after the round ends", (stage) => {
    for (const taskPending of [true, false]) {
      expect(guide({ stage, taskPending }, taskGuideIds, labHintIds)).toBeNull();
      expect(guide({ stage, taskPending, initialComplete: true }, taskGuideIds, labHintIds)).toBeNull();
    }
  });

  it("suspends task and control cues while keeping their dismissal and sequence", () => {
    expect(guide({ stage: 6, paused: true })).toBeNull();
    expect(guide({ stage: 5, paused: true }, [], ["prior"])).toBeNull();
    expect(guide({ stage: 5 }, [], ["prior"])).toEqual({ kind: "control", id: "weights" });
    expect(guide({ initialComplete: true }, ["split"])).toBeNull();
    expect(guide({ initialComplete: true })).toEqual({ kind: "task", id: "split" });
  });
});
