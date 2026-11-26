import { describe, expect, it, vi } from "vitest";
import { drawScene, fitPlay3DViewBox, hitTestPlay3DScene, type Play3DSceneItem } from "./Play3DCanvas";

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
});

it("clips flat scene items and paints field colors without a proposal drop-line", () => {
  const ctx = {
    setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), clip: vi.fn(), rect: vi.fn(), restore: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), fillRect: vi.fn(), stroke: vi.fn(),
    arc: vi.fn(), fill: vi.fn(), setLineDash: vi.fn(), fillStyle: "", strokeStyle: "", globalAlpha: 1,
  };
  ctx.fillRect.mockImplementation(() => {
    expect(ctx.fillStyle).toBe("--good");
    expect(ctx.globalAlpha).toBe(0.2);
  });
  const canvas = { clientWidth: 100, clientHeight: 100, getContext: () => ctx } as unknown as HTMLCanvasElement;
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: (token: string) => token }));
  try {
    drawScene(canvas, [
      { id: "grid", kind: "grid", depth: 0, points: [0, 50, 100, 50] },
      { id: "quad", kind: "quad", depth: 0, layer: "good", alpha: 0.2, points: [0, 50, 20, 30] },
      { id: "iso", kind: "field-contour", depth: 0, layer: "good", points: [20, 10, 10, 30] },
      { id: "proposal", kind: "proposal", depth: 0, x: 50, y: 50, floorX: 50, floorY: 50 },
    ], [], { x: 0, y: 0, width: 100, height: 100 }, { x: 10, y: 10, width: 80, height: 80 });
    expect(ctx.rect).toHaveBeenCalledWith(10, 10, 80, 80);
    expect(ctx.clip).toHaveBeenCalledBefore(ctx.moveTo);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 50, 20, -20);
    expect(ctx.lineTo).toHaveBeenCalledWith(10, 30);
    expect(ctx.arc).toHaveBeenCalledBefore(ctx.restore);
    expect(ctx.setLineDash).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
