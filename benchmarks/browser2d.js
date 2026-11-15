// Run in a foreground dev-server tab, on #play-2d. Uses only public DOM controls.
// await (await import('/tpe-playground/benchmarks/browser2d.js')).benchmark2D('rotate')
export async function benchmark2D(scenario, count = 120, trackMutations = false, durationMs = 0) {
  if (!['idle', 'rotate', 'play', 'play-rotate', 'bandwidth', 'seek'].includes(scenario)) throw new Error('Unknown scenario.');
  const scene = document.querySelector('[aria-label="Interactive 3D landscape and KDE surfaces"]');
  const trial = document.querySelector('[aria-label="2D Trial progress"]');
  const bandwidth = document.querySelector('#bandwidth-2d');
  if (!scene || !trial || !bandwidth) throw new Error('Open Play 2D first.');
  if (document.visibilityState !== 'visible') throw new Error('Keep the benchmark tab visible.');
  const frame = () => new Promise((resolve, reject) => {
    if (document.visibilityState !== "visible") return reject(new Error("Benchmark tab became hidden."));
    const timer = setTimeout(() => reject(new Error("Animation frame did not arrive within 2 seconds.")), 2000);
    requestAnimationFrame((time) => { clearTimeout(timer); resolve(time); });
  });
  const input = (element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(value));
    element.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const waitForStep = async (step) => {
    const deadline = performance.now() + 15000;
    while (trial.getAttribute('aria-valuetext') !== `Trial ${step} of 200`) {
      if (performance.now() > deadline) throw new Error('Seek did not complete.');
      await frame();
    }
  };
  document.querySelector('[aria-label="Pause"]')?.click();
  document.querySelector('[aria-label="Reset"]')?.click();
  await waitForStep(0);
  input(bandwidth, 0.65);
  if (scenario !== 'seek') { input(trial, 100); await waitForStep(100); }
  [...document.querySelectorAll('button')].find((button) => button.textContent === 'Reset view')?.click();
  await frame(); await frame();
  // Outside the timed region: compare exact paint order, coordinates, classes,
  // and accessible marker markup across renderer implementations.
  const fingerprint = async () => {
  const canonical = [...scene.querySelectorAll('*')].map((element) => [element.tagName,
    [...element.attributes].filter((a) => a.name !== 'data-slot').map((a) => [a.name, a.value]).sort(),
    element.children.length ? '' : element.textContent]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  };
  const geometryHash = await fingerprint();
  const durations = [], longTasks = [], longFrames = [], phaseEntries = [];
  const seekFrames = [];
  let added = 0, removed = 0, attributes = 0;
  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      added += record.addedNodes.length; removed += record.removedNodes.length;
      if (record.type === 'attributes') attributes++;
    }
  });
  if (trackMutations) mutations.observe(scene, { subtree: true, childList: true, attributes: true });
  const observers = [];
  for (const [type, entries] of [['longtask', longTasks], ['long-animation-frame', longFrames], ['measure', phaseEntries]]) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
    const observer = new PerformanceObserver((list) => entries.push(...list.getEntries().map((entry) => entry.toJSON())));
    observer.observe({ type }); observers.push({ observer, entries });
  }
  performance.getEntriesByType("measure").filter((entry) => entry.name.startsWith("tpe2d:")).forEach((entry) => performance.clearMeasures(entry.name));
  const start = performance.now();
  let seekFrame = null;
  let elapsed;
  try {
    if (scenario === 'seek') {
      let previous;
      const sample = (time) => { if (previous !== undefined) seekFrames.push(time - previous); previous = time; seekFrame = requestAnimationFrame(sample); };
      seekFrame = requestAnimationFrame(sample);
      input(trial, 200);
      await waitForStep(200);
      await frame();
      cancelAnimationFrame(seekFrame);
      seekFrame = null;
    } else {
      if (scenario.includes('play') && !trackMutations) document.querySelector('[aria-label="Play"]').click();
      let previous = await frame();
      for (let i = 0; durationMs ? performance.now() - start < durationMs : i < count; i++) {
        // Mutation/quality diagnostics use deterministic trial inputs; wall-clock
        // Play would advance a different number of trials in faster renderers.
        if (trackMutations && scenario.includes('play')) document.querySelector('[aria-label="Next trial"]').click();
        if (scenario.includes('rotate')) scene.dispatchEvent(new KeyboardEvent('keydown', { key: i % 40 < 20 ? 'ArrowRight' : 'ArrowLeft', bubbles: true }));
        if (scenario === 'bandwidth') input(bandwidth, 0.1 + (i % 30) * 0.05);
        const now = await frame(); durations.push(now - previous); previous = now;
      }
    }
    elapsed = performance.now() - start;
    await frame();
  } finally {
    if (seekFrame !== null) cancelAnimationFrame(seekFrame);
    mutations.disconnect();
    observers.forEach(({ observer, entries }) => {
      entries.push(...observer.takeRecords().map((entry) => entry.toJSON()));
      observer.disconnect();
    });
    document.querySelector('[aria-label="Pause"]')?.click();
  }
  // Observer delivery can lag behind setup. Keep only frames/tasks starting
  // inside this scenario; preserve raw timestamps for overlapping phase analysis.
  const tasks = longTasks.filter((entry) => entry.startTime >= start && entry.startTime < start + elapsed);
  const frames = longFrames.filter((entry) => entry.startTime >= start && entry.startTime < start + elapsed);
  const sorted = durations.toSorted((a, b) => a - b);
  return {
    scenario, playbackInput: trackMutations ? 'one-step-per-frame' : 'one-second-timer', geometryHash, finalGeometryHash: await fingerprint(), visibility: document.visibilityState, frameIntervals: durations, seekFrameIntervals: seekFrames, userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
    startTrials: scenario === 'seek' ? 0 : 100, endTrials: trial.getAttribute('aria-valuetext'),
    elapsed, frames: durations.length, seekMaxFrameGap: seekFrames.length ? Math.max(...seekFrames) : undefined, median: sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2 : undefined, p95: sorted[Math.floor(sorted.length * 0.95)],
    max: sorted.at(-1), mutations: trackMutations ? { added, removed, attributes } : null, elements: scene.querySelectorAll('*').length,
    phases: phaseEntries.filter((entry) => entry.name.startsWith("tpe2d:") && entry.startTime >= start && entry.startTime < start + elapsed).map((entry) => ({ name: entry.name, duration: entry.duration })),
    measurementStart: start,
    supportedEntryTypes: PerformanceObserver.supportedEntryTypes,
    longTasks: { count: tasks.length, max: Math.max(0, ...tasks.map((e) => e.duration)), entries: tasks },
    longFrames: { count: frames.length, max: Math.max(0, ...frames.map((e) => e.duration)), entries: frames },
  };
}
