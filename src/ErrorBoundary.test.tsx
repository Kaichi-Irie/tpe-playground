import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ErrorBoundary, ErrorFallback } from "./ErrorBoundary";
import { reloadAfterChunkError } from "./chunkReload";

it("offers recovery controls and keeps the error message in details", () => {
  const html = renderToStaticMarkup(<ErrorFallback error={new Error("3D render failed")} />);

  expect(html).toContain("Something went wrong");
  expect(html).toMatch(/<button[^>]*>Reload<\/button>/);
  expect(html).toContain(`<a href="${import.meta.env.BASE_URL}">Back to Play 2D</a>`);
  expect(html).toMatch(/<details>.*3D render failed.*<\/details>/);
});

it("renders the fallback from captured state and resets it on navigation", () => {
  const error = new Error("x");
  const captured = ErrorBoundary.getDerivedStateFromError(error);
  expect(captured).toEqual({ error });

  const props = { children: <p>Play 2D content</p>, routeKey: "play-3d:1", onError: vi.fn() };
  const boundary = new ErrorBoundary(props);
  boundary.state = { ...boundary.state, ...captured };
  expect(renderToStaticMarkup(boundary.render())).toContain("Something went wrong");
  expect(ErrorBoundary.getDerivedStateFromProps(props, boundary.state)).toBeNull();

  const reset = ErrorBoundary.getDerivedStateFromProps({ ...props, routeKey: "play-2d:2" }, boundary.state);
  expect(reset).toEqual({ error: null, routeKey: "play-2d:2" });
  boundary.state = { ...boundary.state, ...reset };
  expect(renderToStaticMarkup(boundary.render())).toBe("<p>Play 2D content</p>");
});

it("automatically reloads once until a successful load clears the flag", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const reload = vi.fn(() => expect(values.get("tpe-chunk-reload")).toBe("1"));

  reloadAfterChunkError(storage, reload);
  reloadAfterChunkError(storage, reload);
  expect(reload).toHaveBeenCalledTimes(1);

  values.delete("tpe-chunk-reload");
  reloadAfterChunkError(storage, reload);
  expect(reload).toHaveBeenCalledTimes(2);
});

it("avoids an automatic reload when the session guard cannot be saved", () => {
  const reload = vi.fn();
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error("Storage blocked"); },
  };

  expect(() => reloadAfterChunkError(storage, reload)).not.toThrow();
  expect(reload).not.toHaveBeenCalled();
});
