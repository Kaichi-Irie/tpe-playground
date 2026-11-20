// Opt-in local instrumentation, no telemetry. Open ?profilePlay3d#play-3d and use
// performance.getEntriesByType("measure"). Normal sessions do not record timings.
const profilePlay3D = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("profilePlay3d");

export function measurePlay3D<T>(name: string, run: () => T): T {
  if (!profilePlay3D) return run();
  const start = performance.now();
  try { return run(); } finally {
    const entry = `play3d:${name}`;
    if (performance.getEntriesByName(entry).length >= 500) performance.clearMeasures(entry);
    performance.measure(entry, { start, end: performance.now() });
  }
}
