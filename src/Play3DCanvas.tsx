import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { measurePlay3D } from "./play3dProfiling";

export type Play3DSurfaceLayer = "objective" | "good" | "bad" | "acquisition";
// Plain drawing commands in SVG viewBox units. Thousands of these
// are painted into one canvas, so no per-item DOM nodes, layout or style exist.
export type Play3DSceneItem = { id: string; depth: number } & (
  | { kind: "triangle"; layer: Play3DSurfaceLayer; points: readonly number[]; inspect: () => void; muted?: boolean }
  | { kind: "segment"; points: readonly number[]; inspect?: () => void; muted?: boolean }
  | { kind: "boundary" | "grid"; points: readonly number[] }
  | { kind: "quad"; layer: Play3DSurfaceLayer; alpha: number; points: readonly number[]; muted?: boolean }
  | { kind: "field-contour"; layer: Play3DSurfaceLayer; points: readonly number[] }
  | { kind: "guide"; points: readonly number[]; dashOffset: number }
  | { kind: "floor-anchor"; x: number; y: number }
  | { kind: "candidate"; x: number; y: number; selected: boolean; inspect: () => void }
  | { kind: "axis-candidate"; points: readonly number[]; x: number; y: number; selected: boolean; inspect: () => void }
  | { kind: "trial"; feasible?: boolean; x: number; y: number; group: "good" | "bad" | "unclassified" }
  | { kind: "proposal"; x: number; y: number; floorX: number; floorY: number }
);
export interface Play3DViewBox { x: number; y: number; width: number; height: number }

// Matches the former SVG classes (.surface-*, .objective-contour, .observation-play-3d, .proposal-play-3d).
const surfaceStyles: Record<Play3DSurfaceLayer, { color: string; fill: number; stroke: number }> = {
  objective: { color: "--objective", fill: 0.075, stroke: 0 },
  good: { color: "--good", fill: 0.45, stroke: 0.3 },
  bad: { color: "--bad", fill: 0.35, stroke: 0.3 },
  acquisition: { color: "--acquisition", fill: 0.3, stroke: 0.4 },
};
const trialColors = { good: "--good", bad: "--bad", unclassified: "--muted" } as const;
// Mobile screens report DPR 3; 2 keeps lines crisp at less than half the pixels.
const maxPixelRatio = 2;

// Same mapping as SVG's default preserveAspectRatio="xMidYMid meet".
export function fitPlay3DViewBox(box: Play3DViewBox, width: number, height: number) {
  const scale = Math.min(width / box.width, height / box.height);
  return { scale, x: (width - box.width * scale) / 2 - box.x * scale, y: (height - box.height * scale) / 2 - box.y * scale };
}

const candidateDotRadius = (selected: boolean, fitScale: number) =>
  selected ? Math.max(4.5, 4 / fitScale) : Math.max(2.9, 2.5 / fitScale);
const candidateStrokeWidth = (selected: boolean, fitScale: number) => (selected ? 1.8 : 1.1) / fitScale;
const axisWinnerRadius = (fitScale: number) => Math.max(3.8, 3.4 / fitScale);
const axisTickWidth = (selected: boolean, fitScale: number) => (selected ? 2.2 : 1.8) / fitScale;

function segmentDistance(x: number, y: number, points: readonly number[]) {
  const [ax, ay, bx, by] = points;
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

// Matches Canvas 2D stroke geometry when lineCap === "butt".
function isOnButtSegment(x: number, y: number, points: readonly number[], halfWidth: number) {
  const [ax, ay, bx, by] = points;
  const dx = bx - ax, dy = by - ay, lenSq = dx * dx + dy * dy;
  if (!lenSq) return false;
  const proj = (x - ax) * dx + (y - ay) * dy;
  if (proj < 0 || proj > lenSq) return false;
  const perp = Math.abs((x - ax) * dy - (y - ay) * dx) / Math.sqrt(lenSq);
  return perp <= halfWidth;
}

// Topmost painted candidate, surface triangle, or contour under (x, y), in viewBox units.
// Painted candidate geometry always wins over proximity tolerance; proximity ties resolve by distance.
export function hitTestPlay3DScene(
  items: readonly Play3DSceneItem[],
  x: number,
  y: number,
  tolerance: number,
  candidates?: readonly Play3DSceneItem[],
  fitScale?: number,
) {
  const candidateItems = candidates ?? items;
  const proximityTolerance = tolerance * 2;
  let closestProximity: Play3DSceneItem | null = null;
  let closestDistance = Infinity;
  for (let i = candidateItems.length - 1; i >= 0; i--) {
    const item = candidateItems[i];
    if (item.kind === "candidate") {
      const distance = Math.hypot(x - item.x, y - item.y);
      const directRadius = fitScale !== undefined
        ? candidateDotRadius(item.selected, fitScale) + candidateStrokeWidth(item.selected, fitScale) / 2
        : item.selected ? tolerance * 1.5 : tolerance;
      if (distance <= directRadius) return item;
      if (distance <= proximityTolerance && distance < closestDistance) {
        closestDistance = distance;
        closestProximity = item;
      }
    } else if (item.kind === "axis-candidate") {
      const segDist = segmentDistance(x, y, item.points);
      const anchorDist = Math.hypot(x - item.x, y - item.y);
      const tickRadius = fitScale !== undefined ? axisTickWidth(item.selected, fitScale) / 2 : tolerance * 0.6;
      const winnerRadius = fitScale !== undefined
        ? axisWinnerRadius(fitScale) + 0.9 / fitScale
        : tolerance * 1.5;
      if (isOnButtSegment(x, y, item.points, tickRadius) || (item.selected && anchorDist <= winnerRadius)) return item;
      const distance = item.selected ? Math.min(segDist, anchorDist) : segDist;
      if (distance <= proximityTolerance && distance < closestDistance) {
        closestDistance = distance;
        closestProximity = item;
      }
    }
  }
  if (closestProximity) return closestProximity;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === "triangle") {
      const [ax, ay, bx, by, cx, cy] = item.points;
      const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
      const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
      const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return item;
    } else if (item.kind === "segment") {
      if (segmentDistance(x, y, item.points) <= tolerance) return item;
    }
  }
  return null;
}

type Play3DFloor = readonly (readonly [number, number, number, number])[];

export function drawScene(canvas: HTMLCanvasElement, items: readonly Play3DSceneItem[], floor: Play3DFloor, viewBox: Play3DViewBox, clipRect?: Play3DViewBox) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx || !width || !height) return;
  const ratio = Math.min(maxPixelRatio, globalThis.devicePixelRatio || 1);
  const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pixelWidth, pixelHeight);
  const fit = fitPlay3DViewBox(viewBox, width, height);
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

  if (clipRect) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(clipRect.x, clipRect.y, clipRect.width, clipRect.height);
    ctx.clip();
  }

  ctx.beginPath();
  for (const [x1, y1, x2, y2] of floor) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
  ctx.globalAlpha = 1; ctx.strokeStyle = color("--grid"); ctx.lineWidth = 1;
  ctx.stroke();

  // Consecutive contour segments share one stroke call; surfaces keep one fill
  // per triangle so translucent overlaps accumulate exactly as SVG painted them.
  const lineStyles = {
    contour: { token: "--objective", alpha: 0.7, width: 1.1 },
    muted: { token: "--neutral-point", alpha: 0.28, width: 1.1 },
    boundary: { token: "--constraint-boundary", alpha: 0.95, width: 1.8 },
    grid: { token: "--grid", alpha: 1, width: 1 },
    objective: { token: "--objective", alpha: 0.8, width: 1.1 },
    good: { token: "--good", alpha: 0.8, width: 1.1 },
    bad: { token: "--bad", alpha: 0.8, width: 1.1 },
    acquisition: { token: "--acquisition", alpha: 0.8, width: 1.1 },
  };
  let lineStyle: keyof typeof lineStyles | undefined;
  const flushContour = () => {
    if (!lineStyle) return;
    const { token, alpha, width } = lineStyles[lineStyle];
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color(token);
    ctx.lineWidth = width / fit.scale;
    ctx.stroke();
    lineStyle = undefined;
  };
  for (const item of items) {
    if (item.kind === "segment" || item.kind === "boundary" || item.kind === "grid" || item.kind === "field-contour") {
      const nextStyle = item.kind === "segment" ? (item.muted ? "muted" : "contour")
        : item.kind === "field-contour" ? item.layer : item.kind;
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
    if (item.kind === "quad") {
      const [ax, ay, bx, by] = item.points;
      ctx.globalAlpha = item.alpha;
      ctx.fillStyle = color(item.muted ? "--neutral-point" : surfaceStyles[item.layer].color);
      ctx.fillRect(ax, ay, bx - ax, by - ay);
    } else if (item.kind === "triangle") {
      const surface = surfaceStyles[item.layer];
      const [ax, ay, bx, by, cx, cy] = item.points;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath();
      const value = color(item.muted ? "--neutral-point" : surface.color);
      ctx.globalAlpha = item.muted ? 0.035 : surface.fill; ctx.fillStyle = value; ctx.fill();
      if (surface.stroke) { ctx.globalAlpha = surface.stroke; ctx.strokeStyle = value; ctx.lineWidth = 0.35; ctx.stroke(); }
    } else if (item.kind === "guide") {
      const [ax, ay, bx, by] = item.points;
      ctx.globalAlpha = 0.65;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      ctx.setLineDash([4 / fit.scale, 4 / fit.scale]);
      ctx.lineDashOffset = item.dashOffset;
      ctx.strokeStyle = color("--text"); ctx.lineWidth = 1.5 / fit.scale; ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    } else if (item.kind === "floor-anchor") {
      const floorRadius = Math.max(3.4, 3 / fit.scale);
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(item.x, item.y, floorRadius, 0, 2 * Math.PI);
      ctx.fillStyle = color("--surface"); ctx.fill();
      ctx.strokeStyle = color("--text"); ctx.lineWidth = 1.6 / fit.scale; ctx.stroke();
    } else if (item.kind === "candidate") {
      if (item.selected) {
        const outer = candidateDotRadius(true, fit.scale);
        const inner = Math.max(1.8, 1.6 / fit.scale);
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(item.x, item.y, outer, 0, 2 * Math.PI);
        ctx.fillStyle = color("--surface"); ctx.fill();
        ctx.strokeStyle = color("--text"); ctx.lineWidth = candidateStrokeWidth(true, fit.scale); ctx.stroke();
        ctx.beginPath(); ctx.arc(item.x, item.y, inner, 0, 2 * Math.PI);
        ctx.fillStyle = color("--text"); ctx.fill();
      } else {
        const r = candidateDotRadius(false, fit.scale);
        ctx.beginPath(); ctx.arc(item.x, item.y, r, 0, 2 * Math.PI);
        ctx.globalAlpha = 0.82; ctx.fillStyle = color("--proposal"); ctx.fill();
        ctx.globalAlpha = 0.85; ctx.strokeStyle = color("--surface"); ctx.lineWidth = candidateStrokeWidth(false, fit.scale); ctx.stroke();
      }
    } else if (item.kind === "axis-candidate") {
      const [ax, ay, bx, by] = item.points;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      if (item.selected) {
        ctx.globalAlpha = 1; ctx.strokeStyle = color("--text"); ctx.lineWidth = axisTickWidth(true, fit.scale); ctx.stroke();
        const outer = axisWinnerRadius(fit.scale);
        const inner = Math.max(1.4, 1.3 / fit.scale);
        ctx.beginPath(); ctx.arc(item.x, item.y, outer, 0, 2 * Math.PI);
        ctx.fillStyle = color("--surface"); ctx.fill();
        ctx.strokeStyle = color("--text"); ctx.lineWidth = 1.8 / fit.scale; ctx.stroke();
        ctx.beginPath(); ctx.arc(item.x, item.y, inner, 0, 2 * Math.PI);
        ctx.fillStyle = color("--text"); ctx.fill();
      } else {
        ctx.globalAlpha = 0.85; ctx.strokeStyle = color("--proposal"); ctx.lineWidth = axisTickWidth(false, fit.scale); ctx.stroke();
      }
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
    } else if (item.kind === "proposal") {
      ctx.globalAlpha = 1;
      if (item.floorX !== item.x || item.floorY !== item.y) {
        ctx.beginPath(); ctx.moveTo(item.floorX, item.floorY); ctx.lineTo(item.x, item.y);
        ctx.setLineDash([5, 4]); ctx.strokeStyle = color("--muted"); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.beginPath(); ctx.arc(item.x, item.y, 7, 0, 2 * Math.PI);
      ctx.fillStyle = color("--surface"); ctx.fill();
      ctx.strokeStyle = color("--text"); ctx.lineWidth = 2; ctx.stroke();
    }
  }
  flushContour();
  ctx.globalAlpha = 1;
  if (clipRect) ctx.restore();
}

// One bitmap replaces ~10k SVG paths. Each update costs one redraw instead of
// thousands of DOM mutations, style/layout passes and retained render objects.
export const Play3DCanvas = memo(function Play3DCanvas({ items, floor, viewBox, clipRect }: { items: readonly Play3DSceneItem[]; floor: Play3DFloor; viewBox: Play3DViewBox; clipRect?: Play3DViewBox }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ items, floor, viewBox, clipRect });
  const frame = useRef<number | null>(null);
  useLayoutEffect(() => {
    latest.current = { items, floor, viewBox, clipRect };
    const element = canvas.current;
    if (element) measurePlay3D("canvas-draw", () => drawScene(element, items, floor, viewBox, clipRect));
  }, [items, floor, viewBox, clipRect]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    // Resizes and theme switches have no new geometry; coalesce them per frame.
    const redraw = () => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const { items, floor, viewBox, clipRect } = latest.current;
        drawScene(element, items, floor, viewBox, clipRect);
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
  return <canvas ref={canvas} className="scene-canvas-play-3d" aria-hidden="true" />;
});
