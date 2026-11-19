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

// The About page retains its existing typography.
const aboutOnly = new Set([
  ".about-page > h2",
  ".about-page > h3",
  ".about-page > p",
  ".algorithm-comparison > p",
  ".algorithm-comparison h3",
  ".algorithm-software",
  ".algorithm-table",
  ".explanation-steps",
  ".references h2",
  ".references li",
  ".tpe-mascot figcaption",
]);

test("all fluid type references resolve to current root tokens", () => {
  const [base] = stylesheets;
  const root = base.match(/:root\s*\{([^{}]*)\}/)?.[1] ?? "";
  const defined = new Set(Array.from(root.matchAll(/(--type-[\w-]+)\s*:/g), ([, token]) => token));
  const css = stylesheets.join("\n");
  expect(css).not.toMatch(/--type-2xs\b/);
  const references = Array.from(css.matchAll(/var\(\s*(--type-[\w-]+)/g), ([, token]) => token);
  expect(references.filter((token) => !defined.has(token))).toEqual([]);
});

test("text sizing uses fluid values outside the documented exceptions", () => {
  const violations: string[] = [];
  for (const css of stylesheets) {
    for (const [, selectorList, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const [, property, value] of declarations.matchAll(/(?:^|;)\s*(font(?:-size)?)\s*:\s*([^;]+)/g)) {
        const sizes = Array.from(value.matchAll(/\b(\d+(?:\.\d+)?)px\b/g), ([, size]) => size);
        if (sizes.length === 0) continue;
        for (const selector of selectorList.split(",").map((part) => part.trim())) {
          const isFormControl = /(?:^|[\s>])(?:input|select|textarea)(?:\b|$)/.test(selector);
          const preventsFocusZoom = isFormControl && sizes.every((size) => size === "16");
          if (!preventsFocusZoom && !iconGlyphs.has(selector) && !aboutOnly.has(selector)) {
            violations.push(`${selector} { ${property}: ${value.trim()} }`);
          }
        }
      }
    }
  }
  expect(violations).toEqual([]);
});
