import { expect, test } from "vitest";
// @ts-expect-error Node's built-in filesystem is available in Vitest without Node types.
import { readFileSync } from "node:fs";

const html: string = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const canonical = "https://kaichi-irie.github.io/tpe-playground/";
const title = "TPE Playground: Interactive Tree-structured Parzen Estimator";
const image = `${canonical}social-card.png`;

function readMeta(attribute: "name" | "property", key: string) {
  return html.match(new RegExp(`<meta\\s+${attribute}="${key}"\\s+content="([^"]+)"`))?.[1];
}

test("declares the canonical page and its search and social metadata", () => {
  expect(html).toContain('<html lang="en">');
  expect(html).toContain(`<title>${title}</title>`);
  expect(html).toContain(`<link rel="canonical" href="${canonical}"`);

  const description = readMeta("name", "description");
  expect(description).toMatch(/Tree-structured Parzen Estimator \(TPE\).*Bayesian optimization.*Optuna.*Play 2D.*Play 3D.*Lab/i);
  const imageAlt = readMeta("property", "og:image:alt");
  expect(imageAlt).toMatch(/TPE Playground.+/);

  const openGraph = {
    "og:type": "website",
    "og:site_name": "TPE Playground",
    "og:title": title,
    "og:description": description,
    "og:url": canonical,
    "og:image": image,
    "og:image:width": "1200",
    "og:image:height": "630",
    "og:image:alt": imageAlt,
  };
  for (const [name, content] of Object.entries(openGraph)) {
    expect(readMeta("property", name), name).toBe(content);
  }

  const twitter = {
    "twitter:card": "summary_large_image",
    "twitter:title": title,
    "twitter:description": description,
    "twitter:image": image,
    "twitter:image:alt": imageAlt,
  };
  for (const [name, content] of Object.entries(twitter)) {
    expect(readMeta("name", name), name).toBe(content);
  }
});

test("includes a useful intro in the React root before mounting", () => {
  const root = html.match(/<div id="root">([\s\S]*?)<\/div>/)?.[1];
  expect(root).toContain("<h1>TPE Playground</h1>");
  expect(root).toContain("Tree-structured Parzen Estimator (TPE)");
  expect(root).toContain("Loading…");
  expect(root).toContain('href="https://github.com/Kaichi-Irie/tpe-playground"');
});

test("lists only the canonical page in the sitemap", () => {
  const sitemap: string = readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");
  const locations = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), ([, url]) => url);
  expect(locations).toEqual([canonical]);
});
