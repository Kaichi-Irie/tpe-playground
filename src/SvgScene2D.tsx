import { measure2D } from "./performance2D";
import { memo, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { placeSvgNodes2D, planSvgReuse2D } from "./svgReuse2D";

export type SceneItem2D = { id: string; depth: number } & (
  | { path: string; className: string; inspect: () => void; node?: never }
  | { node: ReactNode; path?: never }
);
const namespace = "http://www.w3.org/2000/svg";

// React owns the accessible markers through portals. This component owns only
// the stateless SVG paths and marker containers. Camera updates use paint-order
// slots; other updates anchor immutable objective geometry and move dynamic paths.
export const SvgScene2D = memo(function SvgScene2D({ items, staticGeometry }: { items: SceneItem2D[]; staticGeometry: SceneItem2D[] }) {
  const root = useRef<SVGGElement>(null);
  const paths = useRef<SVGPathElement[]>([]);
  const hosts = useRef(new Map<string, SVGGElement>());
  const previous = useRef<SceneItem2D[]>([]);
  const previousStatic = useRef<SceneItem2D[] | null>(null);
  const inspections = useRef(new WeakMap<SVGPathElement, () => void>());
  const markers = useMemo(() => items.filter((item) => item.path === undefined).map((item) => {
    let host = hosts.current.get(item.id);
    if (!host && typeof document !== "undefined") {
      host = document.createElementNS(namespace, "g");
      hosts.current.set(item.id, host);
    }
    return { item, host };
  }), [items]);
  useLayoutEffect(() => measure2D("svg-commit", () => {
    const container = root.current;
    if (!container) return;
    const focused = container.contains(document.activeElement) ? document.activeElement as SVGElement : null;
    const keep = new Set(markers.map(({ item }) => item.id));
    for (const [id, host] of hosts.current) if (!keep.has(id)) {
      host.remove(); hosts.current.delete(id);
    }
    const geometry = items.filter((item) => item.path !== undefined);
    const { sources, anchors } = previousStatic.current === staticGeometry
      ? planSvgReuse2D(previous.current, geometry)
      : { sources: geometry.map((_, i) => i < paths.current.length ? i : -1), anchors: new Set<number>() };
    const nextPaths: SVGPathElement[] = [];
    for (let slot = 0; slot < geometry.length; slot++) {
      const item = geometry[slot];
      const old = previous.current[sources[slot]];
      let path = paths.current[sources[slot]];
      if (!path) {
        path = document.createElementNS(namespace, "path");
        path.setAttribute("aria-hidden", "true");
        container.appendChild(path);
      }
      if (item.path !== undefined) {
        if (old?.path !== item.path) path.setAttribute("d", item.path);
        if (old?.path === undefined || old.className !== item.className) path.setAttribute("class", item.className);
        inspections.current.set(path, item.inspect);
      }
      nextPaths.push(path);
    }
    const retained = new Set(nextPaths);
    for (const path of paths.current) if (!retained.has(path)) path.remove();
    paths.current = nextPaths;
    previous.current = geometry;
    previousStatic.current = staticGeometry;
    // Reverse iteration places changed geometry and accessible markers around
    // the immutable anchors without disturbing the anchors' relative order.
    placeSvgNodes2D<SVGElement>(container, items, nextPaths, hosts.current, anchors);
    // Moving a focused SVG marker can blur it in some browsers.
    if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
  }), [items, markers, staticGeometry]);
  return <g ref={root} onPointerOver={(event) => {
    const target = event.target;
    if (target instanceof SVGPathElement) inspections.current.get(target)?.();
  }}>{typeof document === "undefined"
    ? items.map((item) => item.path !== undefined ? <path key={item.id} d={item.path} className={item.className} aria-hidden="true" /> : item.node)
    : markers.map(({ item, host }) => createPortal(item.node, host!, item.id))}</g>;
});
