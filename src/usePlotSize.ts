import { useEffect, useRef, useState } from "react";

export function usePlotSize() {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 1110, height: 470 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width > 0 && height > 0) setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}
