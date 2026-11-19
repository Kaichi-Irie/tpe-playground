import { expect, test } from "vitest";
// @ts-expect-error Node's built-in filesystem is available in Vitest without Node types.
import { readFileSync } from "node:fs";

const stylesheets = ["style.css", "step-explanation.css"].map((file) =>
  (readFileSync(new URL(file, import.meta.url), "utf8") as string).replace(/\/\*[\s\S]*?\*\//g, ""),
);

const iconGlyphs = new Set([
  ".algorithm-popover-heading button",
  ".canvas-playback .playback-buttons > button",
  ".journey-algorithm-toggle",
  ".journey-arrow",
  ".journey-icon",
  ".journey-navigation .journey-restart",
  ".lab-hint-dismiss",
  ".panel-close",
  ".settings-dismiss",
  ".visual-workspace .primary-playback > .play span",
]);

// The code-first list has its own scale to fit long lines at phone widths.
const responsiveExceptions = new Map([
  [".journey-code-first .journey-algorithm ol", "clamp(0.6875rem, 1.7vw, 1.3125rem)"],
  // These Lab formulas have width-specific limits, and coach hints have a 1rem floor.
  ['.journey [data-heading-stage="1"] .journey-math', "clamp(0.8125rem, 3.65vw, var(--type-math))"],
  ['.journey [data-heading-stage="2"] .journey-math', "clamp(0.8125rem, 3.8vw, var(--type-math))"],
  ['.journey [data-heading-stage="5"] .journey-math', "clamp(0.8125rem, 3.65vw, var(--type-math))"],
  [".lab-hint", "max(1rem, var(--type-md))"],
]);

// SVG roots expose the base size for chart geometry and inherited text.
const chartRoots = new Set([".chart-scroll svg", ".comparison-chart svg", ".scene-2d", ".journey-canvas", ".lab-intro-plot svg"]);
const rules = stylesheets.flatMap((css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]);

test("all fluid type references resolve to current root tokens", () => {
  const root = rules.filter(([, selector]) => selector.trim() === ":root").map(([, , declarations]) => declarations).join("\n");
  const tokens = [...root.matchAll(/(--(?:type|chart)-[\w-]+)\s*:\s*([^;]+)/g)];
  const defined = new Set(tokens.map(([, token]) => token));
  expect(tokens.map(([, token]) => token)).toEqual([...defined]);
  expect(tokens.filter(([, , value]) => /\dpx\b/i.test(value)).map(([, token]) => token)).toEqual([]);
  const css = stylesheets.join("\n");
  expect(css).not.toMatch(/--type-2xs\b/);
  const references = Array.from(css.matchAll(/var\(\s*(--type-[\w-]+|--chart-(?:base|px)\b)/g), ([, token]) => token);
  expect(references.filter((token) => !defined.has(token))).toEqual([]);
});

test("text sizing uses fluid values outside the documented exceptions", () => {
  const violations: string[] = [];
  for (const [, selectorList, declarations] of rules) {
    for (const [, property, declaration] of declarations.matchAll(/(?:^|;)\s*(font(?:-size)?)\s*:\s*([^;]+)/g)) {
      const value = declaration.trim();
      const usesScale = /var\(\s*--(?:type-[\w-]+|chart-px)\s*\)/.test(value);
      if (value === "inherit" || (usesScale && !/\d(?:px|rem|em)\b/i.test(value))) continue;
      for (const selector of selectorList.split(",").map((part) => part.trim())) {
        const isFormControl = /(?:^|[\s>])(?:input|select|textarea)(?:\b|$)/.test(selector);
        const preventsFocusZoom = isFormControl && property === "font-size" && value === "16px";
        const setsChartBase = chartRoots.has(selector) && property === "font-size" && value === "var(--chart-base)";
        const isResponsiveException = property === "font-size" && value === responsiveExceptions.get(selector);
        if (!preventsFocusZoom && !setsChartBase && !isResponsiveException && !iconGlyphs.has(selector)) {
          violations.push(`${selector} { ${property}: ${value} }`);
        }
      }
    }
  }
  expect(violations).toEqual([]);
});
