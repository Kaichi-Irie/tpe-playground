import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Help } from "./Help";

it("renders a collapsed info trigger and a hidden tooltip by default", () => {
  const html = renderToStaticMarkup(<Help label="Bandwidth">Kernel width</Help>);
  expect(html).toMatch(/<button[^>]*aria-label="About Bandwidth"[^>]*aria-expanded="false"[^>]*>ⓘ<\/button>/);
  expect(html).toMatch(/<span[^>]*role="tooltip"[^>]*hidden="">Kernel width<\/span>/);
});

it("keeps a custom trigger and appends a custom root class", () => {
  const html = renderToStaticMarkup(<Help label="preset" trigger="Preset details" className="preset-details">Preset info</Help>);
  expect(html).toMatch(/^<span class="help preset-details">/);
  expect(html).toContain(">Preset details</button>");
  expect(html).not.toContain("ⓘ");
});

it("disables the trigger and keeps it collapsed", () => {
  const html = renderToStaticMarkup(<Help label="Bandwidth" disabled>Kernel width</Help>);
  expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*disabled=""[^>]*>ⓘ<\/button>/);
  expect(html).toMatch(/role="tooltip"[^>]*hidden=""/);
});
