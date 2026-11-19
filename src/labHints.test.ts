import { afterEach, describe, expect, it, vi } from "vitest";
import { hintsForStage, loadSeenHints, nextHint, saveSeenHints, type LabHintId } from "./labHints";

describe("lab hints", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("introduces each control in the stage where it first appears", () => {
    expect(hintsForStage({ stage: 2, taskPending: false })).toEqual(["gamma"]);
    expect(hintsForStage({ stage: 3, taskPending: false })).toEqual([]);
    expect(hintsForStage({ stage: 5, taskPending: false })).toEqual(["prior", "weights"]);
    expect(hintsForStage({ stage: 7, taskPending: false })).toEqual(["candidates"]);
    expect(hintsForStage({ stage: 8, taskPending: false })).toEqual([]);
  });

  it("waits for kernel and dice tasks before pointing at a control", () => {
    expect(hintsForStage({ stage: 4, taskPending: true })).toEqual([]);
    expect(hintsForStage({ stage: 4, taskPending: false })).toEqual(["bandwidth"]);
    expect(hintsForStage({ stage: 6, taskPending: true })).toEqual([]);
    expect(hintsForStage({ stage: 6, taskPending: false })).toEqual(["candidates"]);
  });

  it("shows one unseen hint at a time, in order", () => {
    const context = { stage: 5, taskPending: false };
    expect(nextHint(context, new Set())).toBe("prior");
    expect(nextHint(context, new Set<LabHintId>(["prior"]))).toBe("weights");
    expect(nextHint(context, new Set<LabHintId>(["prior", "weights"]))).toBeNull();
  });

  it("remembers seen hints and ignores unknown or corrupt storage", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    });
    saveSeenHints(new Set<LabHintId>(["gamma", "prior"]));
    expect([...loadSeenHints()]).toEqual(["gamma", "prior"]);
    store.set("tpe-lab-hints-seen", JSON.stringify(["gamma", "unknown", 3]));
    expect([...loadSeenHints()]).toEqual(["gamma"]);
    store.set("tpe-lab-hints-seen", "{not json");
    expect(loadSeenHints().size).toBe(0);
    saveSeenHints(new Set());
    expect(store.has("tpe-lab-hints-seen")).toBe(false);
  });

  it("works without storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } });
    expect(loadSeenHints().size).toBe(0);
    expect(() => saveSeenHints(new Set<LabHintId>(["gamma"]))).not.toThrow();
  });
});
