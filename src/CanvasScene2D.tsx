import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { measure2D } from "./performance2D";

export type SurfaceLayer2D = "objective" | "good" | "bad" | "acquisition";
// Plain, depth-sorted drawing commands in SVG viewBox units. Thousands of these
// are painted into one canvas, so no per-item DOM nodes, layout or style exist.
export type SceneItem2D = { id: string; depth: number } & (
  | { kind: "triangle"; layer: SurfaceLayer2D; points: readonly number[]; inspect: () => void; muted?: boolean }
  | { kind: "segment"; points: readonly number[]; inspect: () => void; muted?: boolean }
  | { kind: "boundary"; points: readonly number[] }
  | { kind: "trial"; feasible?: boolean; x: number; y: number; group: "good" | "bad" | "unclassified" }
  | { kind: "proposal"; x: number; y: number; floorX: number; floorY: number }
);
export interface ViewBox2D { x: number; y: number; width: number; height: number }

// Matches the former SVG classes (.surface-*, .objective-contour, .observation-2d, .proposal-2d).
const surfaceStyles: Record<SurfaceLayer2D, { color: string; fill: number; stroke: number }> = {
  objective: { color: "--objective", fill: 0.075, stroke: 0 },
  good: { color: "--good", fill: 0.45, stroke: 0.3 },
  bad: { color: "--bad", fill: 0.35, stroke: 0.3 },
  acquisition: { color: "--acquisition", fill: 0.3, stroke: 0.4 },
};
const trialColors = { good: "--good", bad: "--bad", unclassified: "--muted" } as const;
// Mobile screens report DPR 3; 2 keeps lines crisp at less than half the pixels.
const maxPixelRatio = 2;

// Same mapping as SVG's default preserveAspectRatio="xMidYMid meet".
export function fitViewBox2D(box: ViewBox2D, width: number, height: number) {
  const scale = Math.min(width / box.width, height / box.height);
  return { scale, x: (width - box.width * scale) / 2 - box.x * scale, y: (height - box.height * scale) / 2 - box.y * scale };
}

// Topmost painted surface triangle or contour under (x, y), in viewBox units.
export function hitTestScene2D(items: readonly SceneItem2D[], x: number, y: number, tolerance: number) {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === "triangle") {
      const [ax, ay, bx, by, cx, cy] = item.points;
      const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
      const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
      const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return item;
    } else if (item.kind === "segment") {
      const [ax, ay, bx, by] = item.points;
      const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
      if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= tolerance) return item;
    }
  }
  return null;
}

type Floor2D = readonly (readonly [number, number, number, number])[];

function drawScene(canvas: HTMLCanvasElement, items: readonly SceneItem2D[], floor: Floor2D, viewBox: ViewBox2D) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx || !width || !height) return;
  const ratio = Math.min(maxPixelRatio, window.devicePixelRatio || 1);
  const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pixelWidth, pixelHeight);
  const fit = fitViewBox2D(viewBox, width, height);
  ctx.setTransform(ratio * fit.scale, 0, 0, ratio * fit.scale, ratio * fit.x, ratio * fit.y);
  const style = getComputedStyle(canvas);
  const colors = new Map<string, string>();
  const color = (name: string) => {
    let value = colors.get(name);
    if (value === undefined) { value = style.getPropertyValue(name).trim() || "#888"; colors.set(name, value); }
    return value;
  };
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";

  ctx.beginPath();
  for (const [x1, y1, x2, y2] of floor) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
  ctx.globalAlpha = 1; ctx.strokeStyle = color("--grid"); ctx.lineWidth = 1;
  ctx.stroke();

  // Consecutive contour segments share one stroke call; surfaces keep one fill
  // per triangle so translucent overlaps accumulate exactly as SVG painted them.
  let lineStyle: "contour" | "muted" | "boundary" | undefined;
  const flushContour = () => {
    if (!lineStyle) return;
    ctx.globalAlpha = lineStyle === "muted" ? 0.28 : lineStyle === "boundary" ? 0.95 : 0.7;
    ctx.strokeStyle = color(lineStyle === "muted" ? "--neutral-point" : lineStyle === "boundary" ? "--constraint-boundary" : "--objective");
    ctx.lineWidth = (lineStyle === "boundary" ? 1.8 : 1.1) / fit.scale;
    ctx.stroke();
    lineStyle = undefined;
  };
  for (const item of items) {
    if (item.kind === "segment" || item.kind === "boundary") {
      const nextStyle = item.kind === "boundary" ? "boundary" : item.muted ? "muted" : "contour";
      if (lineStyle !== nextStyle) {
        flushContour();
        ctx.beginPath();
        lineStyle = nextStyle;
      }
      const [ax, ay, bx, by] = item.points;
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      continue;
    }
    flushContour();
    if (item.kind === "triangle") {
      const surface = surfaceStyles[item.layer];
      const [ax, ay, bx, by, cx, cy] = item.points;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath();
      const value = color(item.muted ? "--neutral-point" : surface.color);
      ctx.globalAlpha = item.muted ? 0.035 : surface.fill; ctx.fillStyle = value; ctx.fill();
      if (surface.stroke) { ctx.globalAlpha = surface.stroke; ctx.strokeStyle = value; ctx.lineWidth = 0.35; ctx.stroke(); }
    } else if (item.kind === "trial" && item.feasible === false) {
      const { x, y } = item;
      const r = Math.max(4.5, 2.4 / fit.scale);
      ctx.beginPath();
      ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
      ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y - r);
      ctx.globalAlpha = 1; ctx.strokeStyle = color("--surface"); ctx.lineWidth = 3 / fit.scale; ctx.stroke();
      ctx.strokeStyle = color(trialColors[item.group]); ctx.lineWidth = 1.6 / fit.scale; ctx.stroke();
    } else if (item.kind === "trial") {
      ctx.beginPath(); ctx.arc(item.x, item.y, 4.5, 0, 2 * Math.PI);
      ctx.globalAlpha = 1; ctx.fillStyle = color(trialColors[item.group]); ctx.fill();
      ctx.strokeStyle = color("--surface"); ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(item.floorX, item.floorY); ctx.lineTo(item.x, item.y);
      ctx.setLineDash([5, 4]); ctx.strokeStyle = color("--muted"); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(item.x, item.y, 7, 0, 2 * Math.PI);
      ctx.fillStyle = color("--surface"); ctx.fill();
      ctx.strokeStyle = color("--text"); ctx.lineWidth = 2; ctx.stroke();
    }
  }
  flushContour();
  ctx.globalAlpha = 1;
}

// One bitmap replaces ~10k SVG paths. Each update costs one redraw instead of
// thousands of DOM mutations, style/layout passes and retained render objects.
export const CanvasScene2D = memo(function CanvasScene2D({ items, floor, viewBox }: { items: readonly SceneItem2D[]; floor: Floor2D; viewBox: ViewBox2D }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ items, floor, viewBox });
  const frame = useRef<number | null>(null);
  useLayoutEffect(() => {
    latest.current = { items, floor, viewBox };
    const element = canvas.current;
    if (element) measure2D("canvas-draw", () => drawScene(element, items, floor, viewBox));
  }, [items, floor, viewBox]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    // Resizes and theme switches have no new geometry; coalesce them per frame.
    const redraw = () => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const { items, floor, viewBox } = latest.current;
        drawScene(element, items, floor, viewBox);
      });
    };
    const resize = new ResizeObserver(redraw);
    resize.observe(element);
    const theme = new MutationObserver(redraw);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      resize.disconnect();
      theme.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, []);
  return <canvas ref={canvas} className="scene-canvas-2d" aria-hidden="true" />;
});
