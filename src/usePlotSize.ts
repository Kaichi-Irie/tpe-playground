import { useEffect, useRef, useState } from "react";

/** Design size of --chart-base: chart text and label geometry are authored at 1×. */
export const chartBaseDesignPx = 14.4;

// The chart's type factor comes from the CSS token, so text and the geometry
// around it (pills, label offsets) grow together.
function readTypeScale(element: Element) {
  const size = parseFloat(getComputedStyle(element).fontSize);
  return Number.isFinite(size) && size > 0 ? size / chartBaseDesignPx : 1;
}

export function usePlotSize() {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 1110, height: 470, typeScale: 1 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      const typeScale = Math.round(readTypeScale(element) * 1000) / 1000;
      if (width > 0 && height > 0) setSize((previous) => previous.width === width && previous.height === height && previous.typeScale === typeScale ? previous : { width, height, typeScale });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}
