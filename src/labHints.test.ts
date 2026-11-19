import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSeenHints, guidePlacement, hintsForStage, loadSeenHints, nextHint, nextLabGuide, saveSeenHints, type LabHintId, type LabTaskGuideId } from "./labHints";

const storageKey = "tpe-lab-hints-seen";

function stubStorage(name: "localStorage" | "sessionStorage") {
  const store = new Map<string, string>();
  vi.stubGlobal(name, {
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
    const store = stubStorage("sessionStorage");
    saveSeenHints(new Set<LabHintId>(["gamma", "prior"]));
    expect([...loadSeenHints()]).toEqual(["gamma", "prior"]);
    store.set(storageKey, JSON.stringify(["gamma", "unknown", 3]));
    expect([...loadSeenHints()]).toEqual(["gamma"]);
    store.set(storageKey, "{not json");
    expect(loadSeenHints().size).toBe(0);
    saveSeenHints(new Set());
    expect(store.has(storageKey)).toBe(false);
  });

  it("removes the legacy local entry without restoring it", () => {
    const local = stubStorage("localStorage");
    const session = stubStorage("sessionStorage");
    local.set(storageKey, JSON.stringify(["gamma"]));

    expect(loadSeenHints().size).toBe(0);
    expect(local.has(storageKey)).toBe(false);
    expect(session.has(storageKey)).toBe(false);
    saveSeenHints(new Set(["prior"]));
    expect(local.has(storageKey)).toBe(false);
  });

  it("clears the seen hints stored for this tab", () => {
    const store = stubStorage("sessionStorage");
    saveSeenHints(new Set(["gamma"]));
    expect(loadSeenHints()).toEqual(new Set(["gamma"]));

    clearSeenHints();

    expect(store.has(storageKey)).toBe(false);
    expect(loadSeenHints().size).toBe(0);
  });

  it("loads tab storage when legacy cleanup is blocked", () => {
    vi.stubGlobal("localStorage", { removeItem: blockedStorage });
    const store = stubStorage("sessionStorage");
    store.set(storageKey, JSON.stringify(["gamma"]));

    expect(loadSeenHints()).toEqual(new Set(["gamma"]));
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

  const initial = {
    stage: 1, taskPending: true, paused: false, initialComplete: false, splitConfirmed: false,
    chosenCount: 0, placedCount: 0, drawnCount: 0, candidateCount: 3,
  };

  function guide(patch: Partial<typeof initial>, dismissed: LabTaskGuideId[] = [], seen: LabHintId[] = []) {
    return nextLabGuide({ ...initial, ...patch }, new Set(seen), new Set(dismissed));
  }

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

  it("suspends task and control cues while keeping their dismissal and sequence", () => {
    expect(guide({ stage: 6, paused: true })).toBeNull();
    expect(guide({ stage: 5, paused: true }, [], ["prior"])).toBeNull();
    expect(guide({ stage: 5 }, [], ["prior"])).toEqual({ kind: "control", id: "weights" });
    expect(guide({ initialComplete: true }, ["split"])).toBeNull();
    expect(guide({ initialComplete: true })).toEqual({ kind: "task", id: "split" });
  });
});
