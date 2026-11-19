import { useEffect, useRef, useState } from "react";

/** Design size of --chart-base: chart text and label geometry are authored at 1×. */
export const chartBaseDesignPx = 14.4;

// The chart's type factor comes from the CSS token, so text and the geometry
// around it (pills, label offsets) grow together.
function readTypeScale(element: Element) {
  const size = parseFloat(getComputedStyle(element).fontSize);
  return Number.isFinite(size) && size > 0 ? Math.round(size / chartBaseDesignPx * 1000) / 1000 : 1;
}

export function usePlotSize() {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 1110, height: 470, typeScale: 1 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = (width: number, height: number) => {
      const typeScale = readTypeScale(element);
      if (width > 0 && height > 0) setSize((previous) => previous.width === width && previous.height === height && previous.typeScale === typeScale ? previous : { width, height, typeScale });
    };
    const observer = new ResizeObserver(([entry]) => update(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height)));
    // --chart-base depends on vw/vh, which can change while the plot keeps its
    // size (e.g. a short window pinned at the plot's minimum height).
    const onViewportResize = () => {
      const box = element.getBoundingClientRect();
      update(Math.round(box.width), Math.round(box.height));
    };
    observer.observe(element);
    window.addEventListener("resize", onViewportResize);
    return () => { observer.disconnect(); window.removeEventListener("resize", onViewportResize); };
  }, []);
  return { ref, ...size };
}
