import { afterEach, describe, expect, it, vi } from "vitest";
import { completedPlayGuides, loadSeenPlayGuides, nextPlayGuide, saveSeenPlayGuides, type PlayGuideContext, type PlayGuideId } from "./playGuides";

const initial: PlayGuideContext = { page: "1d", step: 0, startupTrials: 10, acquisitionVisible: false, seeking: false };

describe("Play guide eligibility", () => {
  it.each(["1d", "2d"] as const)("orders eligible guides on %s", (page) => {
    const context = { ...initial, page };
    const seen = new Set<PlayGuideId>();
    expect(nextPlayGuide(context, seen)).toBe("playback");
    expect(nextPlayGuide({ ...context, step: 1 }, seen)).toBeNull();
    expect(nextPlayGuide({ ...context, step: 2 }, seen)).toBe("gamma");

    seen.add("gamma");
    expect(nextPlayGuide(context, new Set([...seen, "playback"]))).toBeNull();
    expect(nextPlayGuide({ ...context, step: 2 }, seen)).toBe("bandwidth");
    expect(nextPlayGuide({ ...context, step: 10 }, seen)).toBe("bandwidth");

    seen.add("bandwidth");
    expect(nextPlayGuide({ ...context, step: 1 }, seen)).toBeNull();
    expect(nextPlayGuide({ ...context, step: 2 }, seen)).toBe(page === "2d" ? "rotate" : null);
    expect(nextPlayGuide({ ...context, step: 9 }, seen)).toBe(page === "2d" ? "rotate" : null);
    expect(nextPlayGuide({ ...context, step: 10 }, seen)).toBe(page === "2d" ? "rotate" : "acquisition");

    seen.add("rotate");
    expect(nextPlayGuide({ ...context, step: 9 }, seen)).toBeNull();
    expect(nextPlayGuide({ ...context, step: 10 }, seen)).toBe("acquisition");
    expect(nextPlayGuide({ ...context, step: 10, acquisitionVisible: true }, seen)).toBeNull();

    seen.add("acquisition");
    expect(nextPlayGuide({ ...context, step: 10 }, seen)).toBeNull();
  });

  it("hides guides while seeking and restores eligibility afterwards", () => {
    const context = { ...initial, page: "2d" as const, step: 2 };
    expect(nextPlayGuide({ ...context, seeking: true }, new Set())).toBeNull();
    expect(nextPlayGuide(context, new Set())).toBe("gamma");
  });

  it("reports playback and acquisition as soon as their actions are observable", () => {
    expect(completedPlayGuides(initial)).toEqual([]);
    expect(completedPlayGuides({ ...initial, step: 1 })).toEqual(["playback"]);
    expect(completedPlayGuides({ ...initial, acquisitionVisible: true })).toEqual(["acquisition"]);
    expect(completedPlayGuides({ ...initial, step: 10, acquisitionVisible: true })).toEqual(["playback", "acquisition"]);
  });
});

describe("Play guide session storage", () => {
  const key = "tpe-play-guides-seen-1d";
  afterEach(() => vi.unstubAllGlobals());

  function mockStorage() {
    const values = new Map<string, string>();
    const storage = {
      getItem: (name: string) => values.get(name) ?? null,
      setItem: (name: string, value: string) => values.set(name, value),
    };
    vi.stubGlobal("sessionStorage", storage);
    return storage;
  }

  it("round-trips retired guides independently of the other Play tab and the Lab", () => {
    const storage = mockStorage();
    storage.setItem("tpe-lab-hints-seen", '["gamma"]');
    expect(loadSeenPlayGuides("1d")).toEqual(new Set());
    saveSeenPlayGuides("1d", new Set(["playback", "gamma"]));
    expect(loadSeenPlayGuides("2d")).toEqual(new Set());
    saveSeenPlayGuides("2d", new Set(["rotate"]));
    expect(loadSeenPlayGuides("1d")).toEqual(new Set(["playback", "gamma"]));
    expect(loadSeenPlayGuides("2d")).toEqual(new Set(["rotate"]));
    expect(storage.getItem("tpe-lab-hints-seen")).toBe('["gamma"]');
  });

  it("ignores malformed JSON, non-arrays, and unknown ids", () => {
    const storage = mockStorage();
    storage.setItem(key, "[");
    expect(loadSeenPlayGuides("1d")).toEqual(new Set());
    storage.setItem(key, '"gamma"');
    expect(loadSeenPlayGuides("1d")).toEqual(new Set());
    storage.setItem(key, '["gamma","future","toString",null,42]');
    expect(loadSeenPlayGuides("1d")).toEqual(new Set(["gamma"]));
  });

  it("tolerates blocked reads and writes", () => {
    const blocked = () => { throw new Error("Storage blocked"); };
    vi.stubGlobal("sessionStorage", { getItem: blocked, setItem: blocked });
    expect(loadSeenPlayGuides("1d")).toEqual(new Set());
    expect(() => saveSeenPlayGuides("1d", new Set(["playback"]))).not.toThrow();
  });
});
