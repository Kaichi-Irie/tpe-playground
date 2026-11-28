import { expect, it, vi } from "vitest";
import { clampTopPan, createTopFieldItems, createTopGpFieldItems, createTopViewLayout, formatTopGpInspection, formatTopInspection, initialTopView } from "./play3dTopView";
import { buildTwoParamView, emptyTwoParamPlayback, moveTwoParamPlayback } from "./twoParamTpe";
import { gpDefaults } from "./gpSettings";
import { buildTwoParamGpView, emptyTwoParamGpPlayback, moveTwoParamGpPlayback } from "./twoParamGp";

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

it("includes edge ticks and markers after zooming and panning to a plot corner", () => {
  const zoom = 1.15;
  const limit = (zoom - 1) / 2;
  const { contains, plotRect, project } = createTopViewLayout(384, 480, { zoom, panX: limit, panY: limit });
  const corner = project(-5, 5);
  expect(contains(corner.x, plotRect.y + plotRect.size)).toBe(true);
  expect(contains(plotRect.x, corner.y)).toBe(true);
  expect(contains(corner.x, corner.y)).toBe(true);
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

it("draws Acquisition fills and contours only on the positive side of the grid when its peak is positive", () => {
  const grid = [-4, -3, -1, 0, 2, 4].map((acquisition, i) => [-5, 5].map((x2) => ({
    x1: -5 + i * 2, x2, objective: 0, good: 0, bad: 0, acquisition,
  })));
  const model = buildTwoParamView([]);
  const items = createTopFieldItems({
    ...model, hasDensities: true, grid, scales: { ...model.scales, acquisition: [-4, 4] },
  }, { good: false, bad: false, acquisition: true });
  expect(items.some(({ kind }) => kind === "quad")).toBe(true);
  expect(items.some(({ kind }) => kind === "field-contour")).toBe(true);
  for (const { points: [startX, , endX] } of items) {
    expect(Math.min(startX, endX)).toBeGreaterThanOrEqual(1);
  }
});

it("shades and contours the selected GP fields with clearer cells near observations", () => {
  const visible = { mean: true, uncertainty: true, acquisition: true };
  expect(createTopGpFieldItems(buildTwoParamGpView([], gpDefaults), visible)).toEqual([]);
  const { trials } = moveTwoParamGpPlayback(emptyTwoParamGpPlayback(), 2, 42, gpDefaults);
  const model = buildTwoParamGpView(trials, gpDefaults);
  const items = createTopGpFieldItems(model, visible);
  for (const layer of ["gp-mean", "gp-uncertainty", "gp-acquisition"]) {
    expect(items.some((item) => item.kind === "quad" && item.layer === layer)).toBe(true);
    expect(items.some((item) => item.kind === "field-contour" && item.layer === layer)).toBe(true);
  }
  const fog = createTopGpFieldItems(model, { mean: false, uncertainty: true, acquisition: false });
  expect(fog.every((item) => item.layer === "gp-uncertainty")).toBe(true);
  const [{ x1, x2 }] = trials;
  const local = fog.find((item) => {
    const [left, bottom, right, top] = item.points;
    return item.kind === "quad" && left <= x1 && x1 <= right && bottom <= x2 && x2 <= top;
  });
  expect(local?.kind === "quad" ? local.alpha : 0).toBeLessThan(0.3);
  expect(fog.some((item) => item.kind === "quad" && item.alpha > 0.45)).toBe(true);
});

it("inspects raw GP mean, two standard deviations and the named acquisition when visible", () => {
  const point = { x1: -1.125, x2: 0.25 };
  const evaluate = vi.fn((x1, x2) => ({ x1, x2, objective: 1.25, mean: 0.5, std: 0.125, acquisition: -0.25 }));
  const visible = { mean: true, uncertainty: true, acquisition: true };
  const base = "x₁ = -1.125, x₂ = 0.250 · f(x) = 1.250";
  expect(formatTopGpInspection(point, { evaluate, hasModel: false }, visible, "UCB")).toBe(base);
  expect(formatTopGpInspection(point, { evaluate, hasModel: true }, visible, "UCB"))
    .toBe(`${base} · μ = 0.5000 · 2σ = 0.2500 · UCB = -0.2500`);
  expect(formatTopGpInspection(point, { evaluate, hasModel: true }, { ...visible, uncertainty: false, acquisition: false }, "EI", () => false))
    .toBe(`${base} · Infeasible · μ = 0.5000`);
});
