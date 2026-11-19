import { describe, expect, it } from "vitest";
import { fitViewBox2D, hitTestScene2D, type SceneItem2D } from "./CanvasScene2D";

describe("canvas scene", () => {
  it("maps the viewBox like SVG xMidYMid meet", () => {
    expect(fitViewBox2D({ x: 100, y: 0, width: 200, height: 100 }, 400, 400)).toEqual({ scale: 2, x: -200, y: 100 });
  });
  it("inspects the topmost painted triangle or contour", () => {
    const calls: string[] = [];
    const inspect = (id: string) => () => calls.push(id);
    const items: SceneItem2D[] = [
      { id: "back", kind: "triangle", layer: "objective", depth: 0, points: [0, 0, 10, 0, 0, 10], inspect: inspect("back") },
      { id: "front", kind: "triangle", layer: "good", depth: 1, points: [0, 0, 4, 0, 0, 4], inspect: inspect("front") },
      { id: "line", kind: "segment", depth: 2, points: [20, 0, 20, 10], inspect: inspect("line") },
      { id: "trial", kind: "trial", depth: 3, x: 1, y: 1, group: "good" },
    ];
    expect(hitTestScene2D(items, 1, 1, 0.5)?.id).toBe("front");
    expect(hitTestScene2D(items, 6, 2, 0.5)?.id).toBe("back");
    expect(hitTestScene2D(items, 20.4, 5, 0.5)?.id).toBe("line");
    expect(hitTestScene2D(items, 21, 5, 0.5)).toBeNull();
    expect(hitTestScene2D(items, 9, 9, 0.5)).toBeNull();
  });
});
