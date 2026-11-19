// Opt-in local instrumentation, no telemetry. Open ?profile2d#play-3d and use
// performance.getEntriesByType("measure"). Normal sessions do not record timings.
export const profile2D = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("profile2d");

export function measure2D<T>(name: string, run: () => T): T {
  if (!profile2D) return run();
  const start = performance.now();
  try { return run(); } finally {
    const entry = `tpe2d:${name}`;
    if (performance.getEntriesByName(entry).length >= 500) performance.clearMeasures(entry);
    performance.measure(entry, { start, end: performance.now() });
  }
}
