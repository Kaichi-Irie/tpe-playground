# Play 2D performance (#22)

## Reproduce

Use Node 22 and the locked dependencies (`npm ci`). Numerical evaluation only:

```sh
npm run bench:model
```

This compares point-by-point evaluation with the shared 31×31 grid, alternating
order for 40 rounds and discarding the first 10. It does not measure browser FPS.

For a production browser comparison:

```sh
npm run bench:browser
```

Open `http://127.0.0.1:4173/tpe-playground/benchmarks/runner.html?profile2d#play-2d`
in a visible foreground tab. Wait for the explorer to load, then press **Run browser
benchmark**. The suite runs idle, keyboard rotation, timed Play, Play + rotation,
bandwidth changes (about 10 seconds each), then 0→200 seek. Download the results;
optionally put them in ignored `benchmarks/results/` and summarize with:

```sh
node benchmarks/summarize.mjs benchmarks/results/foreground-results.json
```

Use `?profile2d&mutations#play-2d` for a separate 10-input diagnostic. It counts DOM
mutations and hashes exact scene geometry/attributes/painter order. Play uses one
Next trial per frame in this diagnostic so faster renderers still end at trial 110.
It is not a timing comparison. Normal timed runs use the real one-second timer.
Hashes are calculated outside the timed region. Internal historical `data-slot`
attributes are excluded so old/new renderer geometry can be compared.

The runner resets trials, bandwidth (.65) and camera per scenario. Use a fresh
page for default seed 42, Multimodal, Multivariate, gamma .25, Log1p height, default
layers and closed Performance panel. Keep viewport, DPR, browser and settings equal
between builds; alternate build order. Results record visibility, viewport, DPR,
trial counts, frame intervals, phase measures and supported long-frame/task data.
Do not compare hidden-tab measurements with foreground frames. Keyboard rotation
uses full desktop detail; it does not measure compact pointer-drag behavior.

To compare development mode, stop preview and run `npm run dev`, then open the same
runner path on port 5173. The benchmark build is separate from `dist/` and never
included in the deployed app. Results download locally; no collection server or
external telemetry is used. Normal app sessions record no profiling measures.

## Retained evidence (2026-11-14)

[measurements-2026-11-14.json](measurements-2026-11-14.json) contains the selected
runs, original source-file hashes, raw frame intervals for eight final timed
comparisons, geometry hashes, mutation
counts and phase medians. Full long-frame traces, repeated phase samples and
superseded exploratory runs are omitted. The tables below are descriptive results,
not confidence intervals. Historical frame medians use the upper middle sample;
the current harness averages the two middle samples, matching the phase summarizer.
Frame gaps are quantized near the display refresh period (about 16.7 ms here);
the projection measures provide additional evidence for the rotation improvement.
Two repetitions do not establish device-wide guarantees.
Historical hidden-tab diagnostics are intentionally not used as FPS evidence.

All foreground comparisons below use Chrome 157 in the integrated browser on the
local Mac, 1280×720 CSS px, DPR 1.100000023841858, profiling enabled and the default
settings above. No mobile hardware measurements were obtained. Timed runs do not
enable MutationObserver. Normal Play ends at trial 109, Play + rotate at 108.

### Production versus development

Same source, production → development → production:

| Scenario | Development median / p95 (ms) | Production A (ms) | Production B (ms) |
| --- | --- | --- | --- |
| Rotate | 183.4 / 216.8 | 100 / 133.3 | 100 / 148.2 |
| Play + rotate | 183.4 / 233.4 | 100 / 150 | 100 / 149.9 |
| Bandwidth | 83.4 / 150 | 66.7 / 83.4 | 66.7 / 100 |

This isolates build mode, not a source optimization. Earlier DPR 2 measurements
are not comparable. Long-animation-frame data helps distinguish script and later
rendering work, but is not an isolated React commit, paint or GPU measurement.

### Immutable SVG reuse

Baseline renderer: `17bb179`. Unchanged objective geometry becomes an anchor;
dynamic paths move around anchors and reuse existing nodes. Camera changes use
paint-order slots. Attribute comparisons use the last scene instead of DOM reads.

| Scenario | Before medians A / B (ms) | After medians A / B (ms) |
| --- | --- | --- |
| Rotate | 100 / 100 | 100 / 100 |
| Play + rotate | 100 / 100 | 100 / 100 |
| Bandwidth | 66.7 / 66.7 | 49.9 / 49.9 |

Separate 10-input bandwidth diagnostics: attribute writes 174,474 → 11,811
(−93.2%), added/removed nodes 862/862 → 9,866/9,866. Counts include movement of
existing nodes. This trades fewer attribute writes for more node moves; it is not
an across-the-board improvement. All six initial/final SVG hashes matched.
Play SVG-commit median increased 15.5/15.7 → 18.5/16.5 ms; ordinary playback is
not claimed faster. Its frame median is mostly idle time between trial updates.

### Rotation projection reuse

Baseline: the immutable SVG reuse version above. Surface topology, centroids and
inspection callbacks are prepared once per mesh; formatted vertex coordinates are
shared between incident triangles. Resolution, rounding, opacity, contours and
depth order remain unchanged. Run order: after A, before A, after B, before B.
The intermediate baseline was an uncommitted stage; source reconstruction patches
were one-off experiments and are not retained as maintained benchmark code.

| Scenario | Before median A / B (ms) | After median A / B (ms) | Before p95 A / B (ms) | After p95 A / B (ms) |
| --- | --- | --- | --- | --- |
| Rotate | 100 / 100 | 83.4 / 83.4 | 133.4 / 133.4 | 116.7 / 116.7 |
| Play + rotate | 100 / 100.1 | 83.4 / 83.4 | 133.4 / 150 | 116.7 / 116.7 |
| Bandwidth | 49.9 / 49.9 | 33.5 / 34.2 | 51.5 / 65.9 | 50.7 / 66.7 |

Rotation median fell 16.6%, roughly 10 → 12 frames/s: still slow. Objective
projection including sort fell 15.0/16.9 → 4.7/4.7 ms; dynamic projection including
merge-sort fell 4.1/4.0 → 1.2/1.3 ms. Nested measures must not be added twice. SVG
commit remains 28.5/28.4 → 27.5/27.2 ms. Preparation is moved, not eliminated:
after B records median surface preparation 1.6 ms on Play, .7 ms on bandwidth.
Those scenarios rebuild density meshes only. The current instrumentation names
objective and density preparation separately, and streams phase measures to avoid
losing early samples when the app bounds its performance buffer at 500 entries.
Bandwidth tails did not consistently improve. Seek elapsed 240.9/234.0 →
235.0/238.1 ms, maximum frame gap about 50 ms in both: no new seek speedup claim.
Historical seek samples include a first timestamp delta against performance.now(),
which can be negative; use their maximum only, not their mean. The current harness
uses only differences between animation-frame timestamps.

All six fixed-input initial/final SVG hashes match. Projection tests compare exact
paths and depth against the previous formula over three presets, two scales, three
detail strides and three camera configurations. Browser checks covered retained
marker focus during rotation, layer hide/show and original-value inspection. This
is not an exhaustive pixel comparison across all camera angles, themes or devices.

### Canvas surfaces and deferred rebuilds

The scene's ~9,600 SVG paths (5,596 contour segments, 3,074 objective and 900 KDE
triangles; 18,248 page elements) are painted into one canvas. Only invisible,
focusable marker targets, the proposal label and the optimum remain SVG; surface
and contour inspection uses a JS hit test. Model and scene rebuilds read a
`useDeferredValue` input, so rapid slider or playback updates coalesce instead of
queueing one synchronous rebuild each.

Chromium, 375 px viewport: page elements 18,248 → 697 (1,064 at 200 trials), SVG
scene elements ~9,600 → 48, DOM mutations per update ~1,750 → 1. Forty rapid
bandwidth inputs produced 2 scene rebuilds and 1 canvas draw (2.8 ms). iOS
Simulator Safari (iPhone 17e), 200 trials, 8 s of rapid bandwidth drags: the old
build stalled several seconds and dropped a tap until queued input drained; the
canvas build applied every value and the next tap at once. Not yet measured on a
physical phone. `browser2d.js` fingerprints only SVG markup, so its hash no longer
covers painted geometry; compare canvas output visually or by pixels instead.

## Issue status

- Density evaluation: lazy hidden-layer grids, shared Univariate axes and shared
  Multivariate Gaussian terms implemented. Grid remains 31×31; numerical tests
  cover narrow peaks, tails, prior, weights and adaptive bandwidth rules. Earlier
  local CPU measurements were 2.37× Multivariate / 22.04× Univariate; not FPS gains.
- Large seeks: task chunking and cancellation for newer seek/reset/settings are
  implemented and tested. New requests supersede pending work. Worker execution
  and explicit slider-event batching remain candidates. About 235–238 ms elapsed
  is not one uninterrupted block; sampled maximum frame gap was about 50 ms.
- Rendering: production comparisons and projection/sort/SVG measures exist, with
  the gains above. Canvas painting with batched contours is implemented; adaptive
  quality remains a candidate.
- Other duplicate work: mesh preparation and coordinate formatting are reused.
  Proposal-preview reuse, explicit GC/buffer analysis and broader settings-event
  coalescing remain outstanding.

Two of four areas have their main density/seek interventions implemented; this is
not a weighted completion percentage. #22 remains open for mobile performance and
quality, broader theme/high-DPI coverage, rendering breakdown and remaining cost.
Run `npm run check` before merging. SSR smoke tests do not replace browser checks.
