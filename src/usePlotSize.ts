import { useEffect, useRef, useState, type RefObject } from "react";

/** Design size of --chart-base: chart text and label geometry are authored at 1×. */
const chartBaseDesignPx = 14.4;

// The chart's type factor comes from the CSS token, so text and the geometry
// around it (pills, label offsets) grow together.
function readTypeScale(element: Element) {
  const size = parseFloat(getComputedStyle(element).fontSize);
  return Number.isFinite(size) && size > 0 ? Math.round(size / chartBaseDesignPx * 1000) / 1000 : 1;
}

export function useChartTypeScale(ref: RefObject<SVGSVGElement | null>) {
  const [typeScale, setTypeScale] = useState(1);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // The viewport can change --chart-base while the SVG keeps its dimensions.
    const update = () => setTypeScale(readTypeScale(element));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [ref]);
  return typeScale;
}

export function usePlotSize() {
  const ref = useRef<SVGSVGElement>(null);
  const typeScale = useChartTypeScale(ref);
  const [size, setSize] = useState({ width: 1110, height: 470 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = (width: number, height: number) => {
      if (width > 0 && height > 0) setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height });
    };
    const observer = new ResizeObserver(([entry]) => update(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size, typeScale };
}
