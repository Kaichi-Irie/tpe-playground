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
    expect(hitTestPlay3DScene(items, 2, 2, 0.5, [])?.id).toBe("surface");
  });

  it("prefers painted candidate geometry over a nearer-depth neighbor in proximity range", () => {
    const inspect = () => {};
    const candidates: Play3DSceneItem[] = [
      { id: "winner", kind: "candidate", depth: 0.2, x: 0, y: 0, selected: true, inspect },
      { id: "nearby-front", kind: "candidate", depth: 0.5, x: 5, y: 0, selected: false, inspect },
      { id: "far-back", kind: "candidate", depth: 0.1, x: 20, y: 0, selected: false, inspect },
      { id: "far-front", kind: "candidate", depth: 0.6, x: 29, y: 0, selected: false, inspect },
    ];
    // At fitScale = 1, the ordinary dot's painted radius is 3.45 px, so 5 px away does not cover the winner.
    expect(hitTestPlay3DScene([], 0, 0, 3, candidates, 1)?.id).toBe("winner");
    // Outside painted radii of both (20, 0) and (29, 0), proximity resolves by distance rather than depth.
    expect(hitTestPlay3DScene([], 24, 0, 3, candidates, 1)?.id).toBe("far-back");
  });

  it("uses butt-capped tick geometry so an unpainted end extension cannot steal a direct hit", () => {
    const inspect = () => {};
    const candidates: Play3DSceneItem[] = [
      { id: "back-tick", kind: "axis-candidate", depth: 0.2, points: [10.5, 0, 10.5, 6], x: 10.5, y: 0, selected: false, inspect },
      { id: "front-tick", kind: "axis-candidate", depth: 0.5, points: [0, 0, 10, 0], x: 0, y: 0, selected: false, inspect },
    ];
    // (10.5, 0) is 0.5 px past front-tick's butt-capped free end, but directly on back-tick.
    expect(hitTestPlay3DScene([], 10.5, 0, 3, candidates, 1)?.id).toBe("back-tick");
    // (5, 0.5) is inside front-tick's painted stroke.
    expect(hitTestPlay3DScene([], 5, 0.5, 3, candidates, 1)?.id).toBe("front-tick");
  });
});

it("paints the CMA-ES bell, clips only the footprint to the floor, and draws mean markers", () => {
  const strokes: { color: string; alpha: number; width: number }[] = [];
  const fills: string[] = [];
  const ctx = {
    setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), clip: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), arc: vi.fn(), setLineDash: vi.fn(),
    strokeStyle: "", fillStyle: "", globalAlpha: 1, lineWidth: 0,
    stroke: () => strokes.push({ color: ctx.strokeStyle, alpha: ctx.globalAlpha, width: ctx.lineWidth }),
    fill: () => fills.push(ctx.fillStyle),
  };
  const canvas = { clientWidth: 200, clientHeight: 200, getContext: () => ctx } as unknown as HTMLCanvasElement;
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: (token: string) => token }));
  try {
    drawScene(canvas, [
      { id: "bell", kind: "triangle", layer: "cmaes", depth: 0, points: [0, 0, 10, 10, 20, 0], inspect: vi.fn() },
      { id: "inner", footprint: true, kind: "ellipse-segment", depth: 0, sigmaLevel: 1, points: [10, 10, 20, 20, 10, 10] },
      { id: "outer", footprint: true, kind: "ellipse-segment", depth: 0, sigmaLevel: 2, points: [0, 0, 30, 30, 0, 0] },
      { id: "rise", kind: "ellipse-segment", depth: 0, sigmaLevel: 2, points: [0, 0, 30, 30], dashOffset: -20 },
      { id: "drop", kind: "mean-drop", depth: 0, points: [10, 10, 10, 0] },
      { id: "step", kind: "mean-step", depth: 0, x: 5, y: 5 },
      { id: "path", kind: "mean-path", depth: 0, points: [5, 5, 10, 10] },
      { id: "mean", kind: "mean-marker", depth: 0, x: 10, y: 10 },
      { id: "current", kind: "trial", depth: 0, x: 5, y: 5, group: "cmaes-current" },
      { id: "past", kind: "trial", depth: 0, x: 20, y: 20, group: "cmaes-past" },
    ], [], { x: 0, y: 0, width: 100, height: 100 }, undefined,
    [{ x: 1, y: 1 }, { x: 90, y: 1 }, { x: 90, y: 90 }, { x: 1, y: 90 }]);
    expect(ctx.clip).toHaveBeenCalledTimes(2);
    expect(ctx.restore).toHaveBeenCalledTimes(2);
    expect(ctx.setLineDash.mock.calls).toEqual([[[2.5, 2]], [[]], [[2.5, 2]], [[]], [[2.5, 2]], [[]]]);
    expect(strokes.slice(1, 8)).toEqual([
      { color: "--cmaes", alpha: 0.28, width: 0.35 },
      { color: "--cmaes", alpha: 0.45, width: 1 },
      { color: "--cmaes-soft", alpha: 0.35, width: 0.75 },
      { color: "--cmaes-soft", alpha: 0.9, width: 0.75 },
      { color: "--cmaes", alpha: 0.5, width: 0.5 },
      { color: "--surface", alpha: 0.9, width: 0.5 },
      { color: "--cmaes", alpha: 0.8, width: 0.9 },
    ]);
    expect(ctx.arc).toHaveBeenCalledWith(5, 5, 1.25, 0, 2 * Math.PI);
    expect(fills).toEqual(["--cmaes", "--cmaes", "--cmaes", "--cmaes-gen", "--muted"]);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("clips flat scene items and paints field colors without a proposal drop-line", () => {
  const ctx = {
    setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), clip: vi.fn(), rect: vi.fn(), restore: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fillRect: vi.fn(), stroke: vi.fn(),
    arc: vi.fn(), fill: vi.fn(), setLineDash: vi.fn(), fillStyle: "", strokeStyle: "", globalAlpha: 1,
  };
  const fills: { color: string; alpha: number }[] = [];
  ctx.fill.mockImplementation(() => fills.push({ color: ctx.fillStyle, alpha: ctx.globalAlpha }));
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
      { id: "band", kind: "ellipse-fill", depth: 0, alpha: 0.14, points: [5, 5, 50, 20, 20, 50] },
      { id: "proposal", kind: "proposal", depth: 0, x: 50, y: 50, floorX: 50, floorY: 50 },
    ], [], { x: 0, y: 0, width: 100, height: 100 }, { x: 10, y: 10, width: 80, height: 80 });
    expect(ctx.rect).toHaveBeenCalledWith(10, 10, 80, 80);
    expect(ctx.clip).toHaveBeenCalledBefore(ctx.moveTo);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 50, 20, -20);
    expect(ctx.lineTo).toHaveBeenCalledWith(10, 30);
    expect(ctx.arc).toHaveBeenCalledBefore(ctx.restore);
    expect(fills).toEqual([{ color: "--cmaes", alpha: 0.14 }, { color: "--surface", alpha: 1 }]);
    expect(ctx.setLineDash).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it.each([
  ["gp-mean", "--gp", 0.42, 0.3],
  ["gp-uncertainty", "--gp-soft", 0.34, 0.25],
  ["gp-acquisition", "--gp-acq", 0.32, 0.38],
] as const)("paints the %s surface, Top shading and isolines, and purple observations", (layer, color, fill, stroke) => {
  const fills: [string, number][] = [], strokes: [string, number][] = [];
  const ctx = {
    setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), arc: vi.fn(),
    fillStyle: "", strokeStyle: "", globalAlpha: 1,
    fill: () => fills.push([ctx.fillStyle, ctx.globalAlpha]),
    fillRect: () => fills.push([ctx.fillStyle, ctx.globalAlpha]),
    stroke: () => strokes.push([ctx.strokeStyle, ctx.globalAlpha]),
  };
  const canvas = { clientWidth: 100, clientHeight: 100, getContext: () => ctx } as unknown as HTMLCanvasElement;
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: (token: string) => token }));
  try {
    drawScene(canvas, [
      { id: "surface", kind: "triangle", layer, depth: 0, points: [0, 0, 10, 10, 20, 0], inspect: vi.fn() },
      { id: "shade", kind: "quad", layer, depth: 0, alpha: 0.16, points: [0, 10, 20, 0] },
      { id: "iso", kind: "field-contour", layer, depth: 0, points: [0, 0, 10, 10] },
      { id: "trial", kind: "trial", depth: 0, x: 5, y: 5, group: "gp" },
    ], [], { x: 0, y: 0, width: 100, height: 100 });
    expect(fills).toEqual([[color, fill], [color, 0.16], ["--sampler-gp", 1]]);
    expect(strokes).toContainEqual([color, stroke]);
    expect(strokes).toContainEqual([color, 0.8]);
  } finally {
    vi.unstubAllGlobals();
  }
});
