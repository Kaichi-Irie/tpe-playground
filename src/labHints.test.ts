import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSeenHints, hintsForStage, loadSeenHints, nextHint, saveSeenHints, type LabHintId } from "./labHints";

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
