import { describe, expect, it } from "vitest";
import { fitPlay3DViewBox, hitTestPlay3DScene, type Play3DSceneItem } from "./Play3DCanvas";

describe("canvas scene", () => {
  it("maps the viewBox like SVG xMidYMid meet", () => {
    expect(fitPlay3DViewBox({ x: 100, y: 0, width: 200, height: 100 }, 400, 400)).toEqual({ scale: 2, x: -200, y: 100 });
  });
  it("inspects the topmost painted triangle or contour", () => {
    const calls: string[] = [];
    const inspect = (id: string) => () => calls.push(id);
    const items: Play3DSceneItem[] = [
      { id: "back", kind: "triangle", layer: "objective", depth: 0, points: [0, 0, 10, 0, 0, 10], inspect: inspect("back") },
      { id: "front", kind: "triangle", layer: "good", depth: 1, points: [0, 0, 4, 0, 0, 4], inspect: inspect("front") },
      { id: "line", kind: "segment", depth: 2, points: [20, 0, 20, 10], inspect: inspect("line") },
      { id: "trial", kind: "trial", depth: 3, x: 1, y: 1, group: "good" },
    ];
    expect(hitTestPlay3DScene(items, 1, 1, 0.5)?.id).toBe("front");
    expect(hitTestPlay3DScene(items, 6, 2, 0.5)?.id).toBe("back");
    expect(hitTestPlay3DScene(items, 20.4, 5, 0.5)?.id).toBe("line");
    expect(hitTestPlay3DScene(items, 21, 5, 0.5)).toBeNull();
    expect(hitTestPlay3DScene(items, 9, 9, 0.5)).toBeNull();
  });

  it("inspects multivariate and axis candidates even beneath translucent surfaces", () => {
    const inspect = () => {};
    const items: Play3DSceneItem[] = [
      { id: "cand-other", kind: "candidate", depth: 0.2, x: 2, y: 2, selected: false, inspect },
      { id: "cand-winner", kind: "candidate", depth: 0.3, x: 2, y: 2, selected: true, inspect },
      { id: "axis-x1", kind: "axis-candidate", depth: 0.2, points: [10, 10, 14, 10], x: 10, y: 10, selected: false, inspect },
      { id: "surface", kind: "triangle", layer: "good", depth: 5, points: [0, 0, 20, 0, 0, 20], inspect },
    ];
    expect(hitTestPlay3DScene(items, 2.5, 2, 0.5)?.id).toBe("cand-winner");
    expect(hitTestPlay3DScene(items, 12, 10.6, 0.5)?.id).toBe("axis-x1");
    expect(hitTestPlay3DScene(items, 6, 2, 0.5)?.id).toBe("surface");
  });
});
