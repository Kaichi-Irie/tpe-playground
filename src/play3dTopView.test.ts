import { expect, it, vi } from "vitest";
import { clampTopPan, createTopFieldItems, createTopViewLayout, formatTopInspection, initialTopView } from "./play3dTopView";
import { buildTwoParamView, emptyTwoParamPlayback, moveTwoParamPlayback } from "./twoParamTpe";

it.each([[390, 490], [1200, 570]])("fits equal scales and increases x₂ upward at %i×%i", (width, height) => {
  const { plotRect, project, unproject } = createTopViewLayout(width, height, initialTopView);
  const bottomLeft = project(-5, -5), topRight = project(5, 5);
  expect(bottomLeft.x).toBeCloseTo(plotRect.x);
  expect(bottomLeft.y).toBeCloseTo(plotRect.y + plotRect.size);
  expect(topRight.x - bottomLeft.x).toBeCloseTo(plotRect.size);
  expect(bottomLeft.y - topRight.y).toBeCloseTo(plotRect.size);
  expect(unproject(plotRect.x - 0.1, plotRect.y)).toBeNull();
  expect(unproject(plotRect.x, bottomLeft.y + 0.1)).toBeNull();
});

it("clamps zoom and pan and inverts a panned projection", () => {
  expect(clampTopPan({ zoom: 0.5, panX: 2, panY: 1 })).toEqual(initialTopView);
  expect(clampTopPan({ zoom: 6, panX: 3, panY: -3 })).toEqual({ zoom: 4, panX: 1.5, panY: -1.5 });
  const { project, unproject, plotRect } = createTopViewLayout(390, 490, { zoom: 2, panX: 2, panY: -2 });
  const p = project(-2.75, -2.25);
  expect(unproject(p.x, p.y)?.x1).toBeCloseTo(-2.75);
  expect(unproject(p.x, p.y)?.x2).toBeCloseTo(-2.25);
  expect(unproject(plotRect.x, plotRect.y + plotRect.size)).toEqual({ x1: -5, x2: -5 });
});

it("reports the evaluated coordinates, constraint, and only visible fitted fields", () => {
  const point = { x1: -1.125, x2: 0.25 };
  const evaluate = vi.fn((x1, x2) => ({ x1, x2, objective: 1.25, good: 0.02, bad: 0.01, acquisition: 0.6931 }));
  const visible = { good: true, bad: false, acquisition: true };
  const base = "x₁ = -1.125, x₂ = 0.250 · f(x) = 1.250";
  expect(formatTopInspection(point, { evaluate, hasDensities: false }, visible)).toBe(base);
  expect(formatTopInspection(point, { evaluate, hasDensities: true }, visible, () => false))
    .toBe(`${base} · Infeasible · ℓ(x) = 0.02000 · log ℓ/g = 0.6931`);
  expect(evaluate).toHaveBeenLastCalledWith(-1.125, 0.25);
});

it("builds translucent fills and contours for fitted layers in painter order", () => {
  const visible = { good: true, bad: true, acquisition: true };
  expect(createTopFieldItems(buildTwoParamView([]), visible)).toEqual([]);
  const { trials } = moveTwoParamPlayback(emptyTwoParamPlayback(), 2);
  const items = createTopFieldItems(buildTwoParamView(trials), visible);
  expect([...new Set(items.map(({ layer }) => layer))]).toEqual(["bad", "good", "acquisition"]);
  for (const [layer, peak] of [["bad", 0.34], ["good", 0.42], ["acquisition", 0.32]] as const) {
    const fills = items.flatMap((item) => item.kind === "quad" && item.layer === layer ? [item.alpha] : []);
    expect(Math.min(...fills)).toBeGreaterThanOrEqual(0.02 * peak);
    expect(Math.max(...fills)).toBeLessThanOrEqual(peak);
    expect(Math.max(...fills)).toBeGreaterThan(Math.min(...fills));
    expect(items.some((item) => item.kind === "field-contour" && item.layer === layer)).toBe(true);
  }
});
