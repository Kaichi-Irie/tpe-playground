import { scalarContours } from "./contours";
import type { Play3DSceneItem } from "./Play3DCanvas";
import type { createTwoParamObjectiveView } from "./twoParamObjectiveView";
import type { buildTwoParamView } from "./twoParamTpe";

export type Play3DViewMode = "3d" | "top";
export type TopViewState = { zoom: number; panX: number; panY: number };
export const initialTopView: TopViewState = { zoom: 1, panX: 0, panY: 0 };
export const topTicks = [-5, -2.5, 0, 2.5, 5];

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

// Pan is expressed as a fraction of the unzoomed plot size.
export function clampTopPan({ zoom, panX, panY }: TopViewState): TopViewState {
  zoom = clamp(zoom, 1, 4);
  if (zoom === 1) return initialTopView;
  const limit = (zoom - 1) / 2;
  return { zoom, panX: clamp(panX, -limit, limit), panY: clamp(panY, -limit, limit) };
}

export function createTopViewLayout(width: number, height: number, topView: TopViewState) {
  const viewBox = { x: 0, y: 0, width, height };
  const left = 52, right = 24, top = 54, bottom = width <= 700 ? 112 : 80;
  const size = Math.max(1, Math.min(width - left - right, height - top - bottom));
  const x = (width + left - right - size) / 2;
  const y = (height + top - bottom - size) / 2;
  const plotRect = { x, y, size };
  const { zoom, panX, panY } = clampTopPan(topView);
  const centerX = x + size * (0.5 + panX);
  const centerY = y + size * (0.5 + panY);
  const units = size * zoom / 10;
  const project = (x1: number, x2: number) => ({ x: centerX + x1 * units, y: centerY - x2 * units, depth: 0 });
  const contains = (vx: number, vy: number) => vx >= x && vx <= x + size && vy >= y && vy <= y + size;
  const unproject = (vx: number, vy: number) => {
    if (!contains(vx, vy)) return null;
    return { x1: clamp((vx - centerX) / units, -5, 5), x2: clamp((centerY - vy) / units, -5, 5) };
  };
  return { viewBox, plotRect, project, unproject, contains };
}

type Model = ReturnType<typeof buildTwoParamView>;
type ObjectiveView = ReturnType<typeof createTwoParamObjectiveView>;
const fields = [
  { key: "bad", peak: 0.34, label: "g(x)" },
  { key: "good", peak: 0.42, label: "ℓ(x)" },
  { key: "acquisition", peak: 0.32, label: "log ℓ/g" },
] as const;
type FieldVisibility = Record<(typeof fields)[number]["key"], boolean>;

export function formatTopInspection(
  { x1, x2 }: { x1: number; x2: number },
  model: Pick<Model, "evaluate" | "hasDensities">,
  visible: FieldVisibility,
  feasible?: ObjectiveView["feasible"],
) {
  const values = model.evaluate(x1, x2);
  const parts = [`x₁ = ${x1.toFixed(3)}, x₂ = ${x2.toFixed(3)}`, `f(x) = ${values.objective.toPrecision(4)}`];
  if (feasible && !feasible(x1, x2)) parts.push("Infeasible");
  if (model.hasDensities) {
    for (const { key, label } of fields) if (visible[key]) parts.push(`${label} = ${values[key].toPrecision(4)}`);
  }
  return parts.join(" · ");
}

type Quad = Extract<Play3DSceneItem, { kind: "quad" }>;
type FieldContour = Extract<Play3DSceneItem, { kind: "field-contour" }>;
const contourLevels = [0.2, 0.4, 0.6, 0.8];

// A uniform grid also shades the Rosenbrock valley, whose contour mesh is irregular.
export function createTopObjectiveTint(evaluate: (x1: number, x2: number) => number, objective: ObjectiveView) {
  const items: Quad[] = [];
  const resolution = 40, step = 10 / resolution;
  for (let i = 0; i < resolution; i++) for (let j = 0; j < resolution; j++) {
    const x1 = -5 + i * step, x2 = -5 + j * step;
    const cx = x1 + step / 2, cy = x2 + step / 2;
    const muted = objective.feasible?.(cx, cy) === false;
    const elevation = objective.normalize(evaluate(cx, cy), "log");
    items.push({ id: `tint-${i}-${j}`, depth: 0, kind: "quad", layer: "objective", muted,
      alpha: muted ? 0.08 : 0.025 + 0.095 * elevation, points: [x1, x2, x1 + step, x2 + step] });
  }
  return items;
}

export function createTopFieldItems(model: Model, visible: FieldVisibility) {
  const items: (Quad | FieldContour)[] = [];
  if (!model.hasDensities) return items;
  for (const { key, peak } of fields) {
    if (!visible[key]) continue;
    const low = model.scales[key][0];
    const high = Math.max(...model.grid.flatMap((row) => row.map((point) => point[key])));
    if (high <= low) continue;
    const valueAt = (point: Model["grid"][number][number]) => (point[key] - low) / (high - low);
    const grid = model.grid;
    for (let i = 0; i < grid.length - 1; i++) for (let j = 0; j < grid[i].length - 1; j++) {
      const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
      const t = (valueAt(a) + valueAt(b) + valueAt(c) + valueAt(d)) / 4;
      if (t < 0.02) continue;
      items.push({ id: `${key}-cell-${i}-${j}`, depth: 0, kind: "quad", layer: key, alpha: peak * t,
        points: [a.x1, a.x2, c.x1, c.x2] });
    }
    scalarContours(grid, contourLevels, valueAt).forEach(({ a, b }, index) => {
      items.push({ id: `${key}-iso-${index}`, depth: 0, kind: "field-contour", layer: key, points: [a.x1, a.x2, b.x1, b.x2] });
    });
  }
  return items;
}
