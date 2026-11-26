import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import App from "./App";
import { defaults, trialLimit } from "./oneParamTpe";
import * as playback from "./playback";
import * as plotSize from "./usePlotSize";

it("renders the density explorer with playback controls and an empty initial history", () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain("What is TPE?");
  expect(html).toContain('href="#lab"');
  expect(html).toContain(`href="${import.meta.env.BASE_URL}" aria-current="page">Play 2D`);
  expect(html).toContain(`href="${import.meta.env.BASE_URL}" aria-label="TPE Playground"`);
  expect(html).toContain('href="#play-3d">Play 3D');
  expect(html).toMatch(/<header\b[^>]*>.*<a class="source-link" href="https:\/\/github\.com\/Kaichi-Irie\/tpe-playground" target="_blank" rel="noopener" aria-label="View source code on GitHub \(opens in a new tab\)"[^>]*><svg\b[^>]*aria-hidden="true"[^>]*><path\b[^>]*><\/path><\/svg><\/a>/);
  expect(html).not.toContain('href="#explain"');
  expect(html).toContain("Minimize f(x)");
  expect(html).not.toContain("TPE density explorer");
  expect(html).not.toContain("Changes restart the search");
  expect(html).toContain("About Multimodal preset");
  expect(html).toContain("Probability density");
  expect(html).toContain("Acquisition");
  expect(html).toContain('class="layer acquisition" aria-pressed="false"');
  expect(html).not.toContain('aria-label="Plot view"');
  expect(html).toContain("Horizontal gray dashes: good/bad split");
  expect(html).toContain("Vertical gray dashes: next evaluation");
  expect(html).not.toContain('class="point ');
  expect(html).toContain("KDEs appear after 2 observations.");
  expect(html).not.toContain("Hover, tap, or focus a point to inspect a trial.");
  expect(html).toContain('<div class="plot-inspection" data-selected="false" aria-live="polite"></div>');
  expect(html).toContain("Next trial");
  expect(html).not.toContain("Run to end");
  expect(html).toContain('aria-label="Trial progress"');
  expect(html).toMatch(/<button type="button" class="playback-speed" aria-label="Playback speed: 1x"[^>]*><span class="speed-gauge" aria-hidden="true">››<\/span><span aria-hidden="true">1×<\/span><\/button>/);
  expect(html).toContain("/ 200");
  expect(html).toContain("Previous trial");
  expect(html).toMatch(/<button class="play" aria-label="Play"[^>]*data-guide-target="true"[^>]*aria-describedby="play-guide-text-play-2d"/);
  expect(html).toContain('<p id="play-guide-text-play-2d">Press Play, or step forward with →, to evaluate trials one at a time.</p>');
  expect(html).toContain("Switch to light theme");
  expect(html).toContain("Uniform");
  expect(html).toContain("Recency");
  expect(html).toContain("EI weights");
  expect(html).toContain('id="weights"');
  expect(html).toContain('id="bandwidth-rule"');
  expect(html).toContain("Scott");
  expect(html).not.toContain("Silverman");
  expect(html).toContain("Dragging sets a constant width.");
  expect(html).toContain("Gaussian prior");
  expect(html).toContain("About Gaussian prior");
  expect(html).toContain("Algorithms for Hyper-Parameter Optimization");
  expect(html).toContain("https://arxiv.org/abs/2304.11127");
  expect(html).toContain("↻ New seed");
  expect(html).toContain("<h3>Random start · 1 / 10</h3>");
  expect(html).toMatch(/role="tooltip"[^>]*>Initial random exploration · 1 \/ 10\. Uniform random draw/);
  expect(html).toMatch(/class="model-controls">.*class="model-status" aria-live="polite">.*class="stats"><span class="good-text"><strong>0<\/strong> good<\/span><span class="bad-text"><strong>0<\/strong> bad/);
  expect(html).not.toContain('class="canvas-status"');
  expect(html).toContain("Next x =");
  expect(html).toContain("Uniform random draw until TPE starts at trial 11.");
  expect(html).toContain('<a href="https://github.com/Kaichi-Irie/tpe-playground">View the playground’s source code on GitHub</a>');
});

it("renders a synchronized comparison with no results before evaluation", () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain("Best so far");
  expect(html).toContain("Random search");
  expect(html).not.toContain("evaluations each");
  expect(html).toContain("Play or step forward");
  expect(html).toContain("to compare progress.");
  expect(html).toContain("Average regret");
  expect(html).not.toContain("Curated");
  expect(html).not.toContain("selected for");
  expect(html).not.toContain("Comparison scale");
  expect(html).toContain("Comparison metric");
  expect(html).not.toContain("Absolute error because");
  expect(html).toContain('aria-label="About Best so far"');
  expect(html).toContain("Lower is better");
  expect(html).not.toContain("Comparison setup");
  expect(html).not.toContain("About this metric");
  expect(html).toContain("settings-dialog");
  expect(html).toContain("How to read this plot");
});

it("renders About as a named article with parallel section headings", () => {
  const html = renderToStaticMarkup(<App initialRoute={{ page: "about", share: null }} />);
  const article = html.match(/<article\b[^>]*class="about-page"[^>]*>[\s\S]*?<\/article>/)?.[0] ?? "";

  expect(article).toMatch(/^<article\b[^>]* aria-label="About"/);
  expect(article).toContain('<a href="#lab">Lab</a>');
  expect(article).toContain(`<a href="${import.meta.env.BASE_URL}">Play 2D</a>`);
  expect(article).toContain('<a href="#play-3d">Play 3D</a>');
  expect(article).toContain("<strong>joint</strong>");
  expect(article).not.toMatch(/<h3\b/);
  expect(Array.from(article.matchAll(/<h2\b[^>]*>(.*?)<\/h2>/g), ([, heading]) => heading)).toEqual([
    "What is TPE?",
    "TPE in Optuna",
    "Inside TPE",
    "Explore the playground",
    "Constrained TPE",
    "TPE and other optimizers",
    "References",
  ]);
});

it("starts a shared Play 2D search at trial zero with the linked settings", () => {
  const initialRoute = { page: "play-2d", share: new URLSearchParams("preset=quadratic&seed=0&startupTrials=2&gamma=0.15&constraint=disk") } as const;
  const html = renderToStaticMarkup(<App initialRoute={initialRoute} />);
  expect(html).toContain("Trial 0 / 200");
  expect(html).toContain("<h3>Random start · 1 / 2</h3>");
  expect(html).toMatch(/role="tooltip"[^>]*>Initial random exploration · 1 \/ 2\./);
  expect(html).toContain('value="quadratic" selected=""');
  expect(html).toContain('aria-label="Search seed">0</output>');
  expect(html).toContain('aria-valuetext="15 percent"');
  expect(html).toContain('Share<span class="share-search-link-word"> link</span>');
  expect(html.replace(/<article\b[^>]*class="about-page"[\s\S]*?<\/article>/, "")).not.toContain("Infeasible filling");
});

it("describes Replay at the end of a search", () => {
  const completed = playback.movePlayback(playback.emptyPlayback(), trialLimit, 0, 1, { ...defaults, startupTrials: trialLimit });
  const initialPlayback = vi.spyOn(playback, "emptyPlayback").mockReturnValueOnce(completed);
  try {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("Replay reruns the search from trial 0 with the current settings.");
  } finally {
    initialPlayback.mockRestore();
  }
});

it.each([380, 800])("mentions candidate ticks only when shown at plot width %i", (width) => {
  const started = playback.movePlayback(playback.emptyPlayback(), 2, 0, 1, { ...defaults, startupTrials: 2 });
  const initialPlayback = vi.spyOn(playback, "emptyPlayback").mockReturnValueOnce(started);
  const size = vi.spyOn(plotSize, "usePlotSize").mockReturnValueOnce({ ref: { current: null }, width, height: 300, typeScale: 1 });
  try {
    const html = renderToStaticMarkup(<App initialRoute={{ page: "play-2d", share: new URLSearchParams("startupTrials=2") }} />);
    const hasTicks = width >= 600;
    expect(html.includes('class="candidate-tick"')).toBe(hasTicks);
    expect(html.includes("Gray ticks: sampled candidates")).toBe(hasTicks);
    expect(html.includes("Gray ticks show candidates.")).toBe(hasTicks);
    expect(html).toContain("The dashed line marks the pick.");
  } finally {
    size.mockRestore();
    initialPlayback.mockRestore();
  }
});
