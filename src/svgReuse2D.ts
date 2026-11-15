// Keep immutable geometry in place when only the other layers change. If its
// relative order changed (e.g. a camera update), fall back to paint-order slots.
export function planSvgReuse2D<T extends { id: string }>(previous: T[], next: T[]): { sources: number[]; anchors: Set<number> } {
  const indices = new Map(previous.map((item, index) => [item.id, index]));
  const anchors = new Set<number>();
  let last = -1;
  for (let i = 0; i < next.length; i++) {
    const source = indices.get(next[i].id);
    if (source !== undefined && previous[source] === next[i]) {
      if (source <= last) return { sources: next.map((_, index) => index < previous.length ? index : -1), anchors: new Set() };
      anchors.add(i);
      last = source;
    }
  }
  if (!anchors.size) return { sources: next.map((_, index) => index < previous.length ? index : -1), anchors };
  const sources = next.map((item) => indices.get(item.id) ?? -1);
  const used = new Set(sources.filter((index) => index >= 0));
  let spare = 0;
  for (let i = 0; i < sources.length; i++) if (sources[i] < 0) {
    while (spare < previous.length && used.has(spare)) spare++;
    if (spare < previous.length) { sources[i] = spare; used.add(spare++); }
  }
  return { sources, anchors };
}

// paths follows current paint order, including after an anchored update. Without
// anchors those existing DOM slots stay put; only marker hosts need moving.
export function placeSvgNodes2D<T extends { nextSibling: unknown; parentNode: unknown }>(
  container: { insertBefore(node: T, before: T | null): unknown },
  items: readonly { id: string; path?: string }[], paths: readonly T[],
  hosts: ReadonlyMap<string, T>, anchors: ReadonlySet<number>,
) {
  let before: T | null = null;
  let slot = paths.length;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.path !== undefined) {
      const path = paths[--slot];
      if (anchors.size && !anchors.has(slot) && path.nextSibling !== before) container.insertBefore(path, before);
      before = path;
    } else {
      const host = hosts.get(item.id)!;
      if (host.parentNode !== container || host.nextSibling !== before) container.insertBefore(host, before);
      before = host;
    }
  }
}
