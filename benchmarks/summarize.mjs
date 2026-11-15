import { readFile } from "node:fs/promises";

const median = (values) => {
  if (!values.length) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
for (const file of process.argv.slice(2)) {
  const runs = JSON.parse(await readFile(file, "utf8"));
  console.log(JSON.stringify({ file, runs: runs.map((run) => {
    const entries = run.longFrames.entries;
    return {
      scenario: run.scenario, viewport: run.viewport, dpr: run.dpr,
      visibility: run.visibility, median: run.median, p95: run.p95,
      max: run.max, elapsed: run.elapsed, frames: run.frames,
      endTrials: run.endTrials, seekMaxFrameGap: run.seekMaxFrameGap,
      phaseMedians: Object.fromEntries([...new Set(run.phases.map((p) => p.name))]
        .map((name) => [name, median(run.phases.filter((p) => p.name === name).map((p) => p.duration))])),
      longFrameCount: entries.length,
      longFrameScriptMedian: median(entries.map((e) => e.scripts.reduce((total, script) => total + script.duration, 0))),
      styleStartToFrameEndMedian: median(entries.filter((e) => e.styleAndLayoutStart)
        .map((e) => e.startTime + e.duration - e.styleAndLayoutStart)),
      // Scheduling/presentation interval, NOT isolated GPU work.
      presentationGapMedian: median(entries.filter((e) => e.presentationTime && e.paintTime)
        .map((e) => e.presentationTime - e.paintTime)),
    };
  }) }, null, 2));
}
