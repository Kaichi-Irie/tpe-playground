import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { ComparePicker } from "./ComparePicker";
import { ProgressPlot } from "./ProgressPlot";
import { ComparisonPanel } from "./ProgressComparison";
import Play2D from "./Play2D";
import Play3D from "./Play3D";
import { PlaybackControls } from "./PlaybackControls";
import { Play3DCanvas } from "./Play3DCanvas";
import { Play3DConstraintSettings } from "./Play3DConstraintSettings";
import { gpDefaults } from "./gpSettings";
import { compareOptionsForPage, getCompareSampler } from "./samplers";
import { createShareUrl, readPlay2DSharedSearch, readPlay3DSharedSearch, readRoute, type ShareExperiment } from "./shareSearch";
import { defaults, prior, searchDefaults, trialLimit } from "./oneParamTpe";
import { objectivePresets } from "./objectives";
import { twoParamDefaultModelSettings, twoParamObjectivePresets, twoParamSettings } from "./twoParamTpe";

vi.mock("react", { spy: true });

const settings2D = { ...defaults, ...searchDefaults, priorWeight: prior.weight };
const settings3D = { ...twoParamDefaultModelSettings, bandwidthRule: "constant" as const };
const url = "https://example.test/tpe-playground/";
const read2D = (params: URLSearchParams | null) =>
  readPlay2DSharedSearch(params, { seed: 42, preset: "multimodal", settings: settings2D }, objectivePresets, trialLimit, 10);
const read3D = (params: URLSearchParams | null) =>
  readPlay3DSharedSearch(params, { seed: 42, preset: "multimodal", settings: settings3D }, twoParamObjectivePresets, twoParamSettings.count, 10);

// The suite runs in Node. Use React's server renderer for hook execution and
// retain the component's state slots between renders to exercise its handlers.
function renderStatefully(render: () => React.ReactElement) {
  const state: unknown[] = [];
  const refs: React.RefObject<unknown>[] = [];
  return () => {
    let tree: React.ReactElement | undefined;
    function ReadTree() {
      let stateIndex = 0;
      let refIndex = 0;
      vi.mocked(React.useState).mockImplementation((initial?: unknown): [unknown, React.Dispatch<unknown>] => {
        const index = stateIndex++;
        if (index === state.length) state.push(typeof initial === "function" ? initial() : initial);
        return [state[index], (next) => {
          state[index] = typeof next === "function" ? next(state[index]) : next;
        }];
      });
      vi.mocked(React.useRef).mockImplementation((initial) => {
        const index = refIndex++;
        return refs[index] ?? (refs[index] = { current: initial });
      });
      try {
        tree = render();
        return null;
      } finally {
        vi.mocked(React.useState).mockReset();
        vi.mocked(React.useRef).mockReset();
      }
    }
    renderToStaticMarkup(<ReadTree />);
    return tree!;
  };
}

type ElementProps = { children?: React.ReactNode; className?: string; onClick?: () => void; onChange?: () => void };

function findElements(node: React.ReactNode, matches: (element: React.ReactElement<ElementProps>) => boolean): React.ReactElement<ElementProps>[] {
  return React.Children.toArray(node).flatMap((child) => {
    if (!React.isValidElement<ElementProps>(child)) return [];
    return [...(matches(child) ? [child] : []), ...findElements(child.props.children, matches)];
  });
}

function propsOf<Props>(node: React.ReactNode, component: React.ComponentType<Props>): Props {
  const [element] = findElements(node, ({ type }) => type === component);
  if (!element) throw new Error(`Could not find ${component.displayName ?? component.name}`);
  return element.props as Props;
}

function clickButton(node: React.ReactNode, label: string) {
  const [button] = findElements(node, ({ type, props }) => type === "button" && props.children === label);
  if (!button?.props.onClick) throw new Error(`Could not find button ${label}`);
  button.props.onClick();
}

describe("Compare picker", () => {
  it("shows a count only when there are selected samplers", () => {
    const render = (selected: ("gp" | "random")[]) =>
      renderToStaticMarkup(<ComparePicker page="play-2d" focus="tpe" selected={selected} onChange={() => {}} />);
    expect(render([])).toContain('aria-expanded="false" aria-haspopup="true">+ Compare');
    expect(render(["gp", "random"])).toContain(">Compare (2)</button>");
  });

  it("renders checked choices, dashed Random and disabled constraint-incompatible choices", () => {
    const open = vi.spyOn(React, "useState").mockReturnValueOnce([true, vi.fn()]);
    try {
      const html = renderToStaticMarkup(<ComparePicker page="play-3d" focus="tpe" constrained selected={["random"]} onChange={() => {}} />);
      expect(html).toContain('aria-expanded="true"');
      expect(html.match(/type="checkbox" disabled=""/g)).toHaveLength(2);
      expect(html.match(/No constraints/g)).toHaveLength(2);
      expect(html).toContain('type="checkbox" checked=""');
      expect(html).toContain("compare-swatch is-dashed");
      expect(html).toContain(">Clear</button>");
    } finally {
      open.mockRestore();
    }
  });

  it("toggles a sampler, clears the selection, and dismisses on Escape", () => {
    const onChange = vi.fn();
    const render = renderStatefully(() => ComparePicker({ page: "play-2d", focus: "tpe", selected: ["random"], onChange }));
    clickButton(render(), "Compare (1)");
    const [gp, random] = findElements(render(), ({ type }) => type === "input");
    gp.props.onChange?.();
    random.props.onChange?.();
    clickButton(render(), "Clear");
    expect(onChange.mock.calls).toEqual([[["random", "gp"]], [[]], [[]]]);

    let subscribe: React.EffectCallback | undefined;
    vi.mocked(React.useEffect).mockImplementationOnce((effect) => { subscribe = effect; });
    render();
    const events = new EventTarget();
    vi.stubGlobal("document", {
      querySelector: () => null,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    });
    try {
      const unsubscribe = subscribe?.();
      const escape = Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" });
      events.dispatchEvent(escape);
      expect(escape.defaultPrevented).toBe(true);
      expect(findElements(render(), ({ type }) => type === "input")).toHaveLength(0);
      unsubscribe?.();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("lists page-supported samplers other than the focus", () => {
    expect(compareOptionsForPage("play-2d", "gp").map(({ id }) => id)).toEqual(["tpe", "random"]);
    expect(compareOptionsForPage("play-3d", "cmaes").map(({ id }) => id)).toEqual(["tpe", "gp", "random"]);
    expect(getCompareSampler("random")).toMatchObject({ id: "random", colorName: "gray", dashed: true, supportsConstraints: true });
  });
});

describe("Compare performance curves", () => {
  it("draws colored series and endpoints and describes every line style", () => {
    const html = renderToStaticMarkup(<ProgressPlot title="Best so far" definition="Gap to the optimum."
      tpe={[4, 2, 1]} random={[4, 3, 2]} currentLabel="TPE" extraSeries={[
        { id: "cmaes", label: "CMA-ES", values: [6, 1, 1], colorToken: "--sampler-cmaes", colorName: "green" },
        { id: "gp", label: "GP", values: [7, 3], colorToken: "--sampler-gp", colorName: "purple", dashed: true },
      ]} />);
    expect(html).toContain("Best so far: TPE, CMA-ES, GP, Random search");
    expect(html).toContain("TPE is solid blue. CMA-ES is solid green. GP is dashed purple. Random search is dashed gray.");
    expect(html.match(/class="extra-progress-line"/g)).toHaveLength(2);
    expect(html.match(/class="extra-progress-point"/g)).toHaveLength(2);
    expect(html.match(/class="random-progress-line"/g)).toHaveLength(1);
    expect(html).toContain("--series-color:var(--sampler-gp);--series-dash:7 5");
    expect(html).toContain("--series-color:var(--sampler-cmaes);--series-dash:none");
  });

  it("builds compared-sampler curves from their trial histories", () => {
    const trials = [{ id: 1, x: 0, y: 4 }, { id: 2, x: 1, y: 3 }];
    const html = renderToStaticMarkup(<ComparisonPanel trials={trials} currentLabel="TPE" randomTrials={trials} minimum={1}
      comparedTrials={[{ id: "gp", trials: [{ id: 1, x: -1, y: 2 }, { id: 2, x: 0, y: 1 }] }]} />);
    expect(html).toContain("GP is solid purple");
    expect(html.match(/class="extra-progress-line"/g)).toHaveLength(1);
    expect(html.match(/class="random-progress-line"/g)).toHaveLength(1);
  });
});

describe("Compare share links", () => {
  it.each([
    { experiment: { page: "play-2d", preset: "multimodal", settings: settings2D, compare: ["gp", "random"] }, read: read2D },
    { experiment: { page: "play-3d", preset: "multimodal", sampler: "gp", gpSettings: gpDefaults, constraint: "none", compare: ["tpe", "random"] }, read: read3D },
    { experiment: { page: "play-3d", preset: "multimodal", sampler: "cmaes", constraint: "none", compare: ["gp", "random"] }, read: read3D },
  ] satisfies { experiment: ShareExperiment; read: typeof read2D | typeof read3D }[])("round-trips comparison selections with $experiment.sampler focus", ({ experiment, read }) => {
    const params = readRoute(new URL(createShareUrl(url, experiment, 42)).hash).share;
    expect(params?.get("compare")).toBe(experiment.compare?.join(","));
    expect(read(params).compare).toEqual(experiment.compare);
    const legacyParams = readRoute(new URL(createShareUrl(url, { ...experiment, compare: [] }, 42)).hash).share;
    expect(legacyParams?.has("compare")).toBe(false);
    expect(read(legacyParams).compare).toEqual([]);
  });

  it("drops duplicate, invalid, focus, wrong-page and incompatible IDs while preserving the order", () => {
    expect(read2D(new URLSearchParams("compare=random,gp,random,tpe,cmaes,invalid")).compare).toEqual(["random", "gp"]);
    expect(read3D(new URLSearchParams("constraint=disk&compare=cmaes,random,tpe,gp")).compare).toEqual(["random"]);
    expect(read3D(new URLSearchParams("sampler=gp&constraint=disk&compare=tpe,cmaes,random")).compare).toEqual(["tpe", "random"]);
  });
});

describe("Compare in Play", () => {
  it("catches up new 2D comparisons, swaps focus, and steps and rewinds in lockstep", async () => {
    const render = renderStatefully(() => Play2D({ active: true, hidden: false, sharedSettings: null, visit: 0, navigation: 0 }));
    propsOf(render(), PlaybackControls).onMove(3);
    propsOf(render(), ComparePicker).onChange(["gp", "random"]);
    await vi.waitFor(() => expect(propsOf(render(), ComparePicker).selected).toEqual(["gp", "random"]));

    const counts = () => findElements(render(), ({ props }) => props.className === "compare-observations")
      .map((group) => findElements(group, ({ props }) => props.className === "compare-point").length);
    expect(counts()).toEqual([3, 3]);
    clickButton(render(), "GP");
    expect(propsOf(render(), ComparePicker)).toMatchObject({ focus: "gp", selected: ["tpe", "random"] });
    expect(propsOf(render(), PlaybackControls).step).toBe(3);
    propsOf(render(), PlaybackControls).onMove(4);
    expect(counts()).toEqual([4, 4]);
    propsOf(render(), PlaybackControls).onMove(1);
    expect(counts()).toEqual([1, 1]);
  });

  it("seeks all 3D runs together, preserves them on focus swap, and removes incompatible comparisons", async () => {
    const render = renderStatefully(() => Play3D({ initialViewMode: "top" }));
    propsOf(render(), PlaybackControls).onMove(2);
    await vi.waitFor(() => expect(propsOf(render(), PlaybackControls).step).toBe(2));
    propsOf(render(), ComparePicker).onChange(["cmaes", "gp", "random"]);
    await vi.waitFor(() => expect(propsOf(render(), ComparePicker).selected).toEqual(["cmaes", "gp", "random"]));
    const counts = () => {
      const points = propsOf(render(), Play3DCanvas).items.filter((item) => item.kind === "compare-point");
      return Object.fromEntries(["tpe", "cmaes", "gp", "random"].map((id) => [id, points.filter(({ sampler }) => id === sampler).length]));
    };
    expect(counts()).toEqual({ tpe: 0, cmaes: 2, gp: 2, random: 2 });
    propsOf(render(), PlaybackControls).onMove(15);
    expect(propsOf(render(), PlaybackControls)).toMatchObject({ step: 2, targetStep: 15 });
    propsOf(render(), PlaybackControls).onMove(5);
    await vi.waitFor(() => expect(propsOf(render(), PlaybackControls).step).toBe(5));
    expect(counts()).toEqual({ tpe: 0, cmaes: 5, gp: 5, random: 5 });
    const segments = propsOf(render(), Play3DCanvas).items.filter((item) => item.kind === "compare-segment");
    expect(segments.map(({ sampler, dashed, points }) => [sampler, dashed ?? false, points.length]))
      .toEqual([["cmaes", false, 10], ["gp", false, 10], ["random", true, 10]]);

    clickButton(render(), "CMA-ES");
    expect(propsOf(render(), ComparePicker)).toMatchObject({ focus: "cmaes", selected: ["tpe", "gp", "random"] });
    propsOf(render(), PlaybackControls).onMove(6);
    expect(counts()).toEqual({ tpe: 6, cmaes: 0, gp: 6, random: 6 });
    clickButton(render(), "TPE");
    propsOf(render(), Play3DConstraintSettings).onPresetChange("disk");
    expect(propsOf(render(), ComparePicker)).toMatchObject({ focus: "tpe", selected: ["random"], constrained: true });
    expect(propsOf(render(), PlaybackControls).step).toBe(0);
  });

  it("restores 2D overlays and distinct performance curves from a shared search", () => {
    const html = renderToStaticMarkup(<Play2D active hidden={false} sharedSettings={new URLSearchParams("compare=gp,random")} visit={0} navigation={0} />);
    expect(html).toContain('class="visual-workspace play-2d is-comparing"');
    expect(html).toContain(">Compare (2)</button>");
    expect(html).toContain("Performance · vs 2");
    expect(html).toContain('class="compare-observations" data-sampler="gp"');
    expect(html).toContain('class="compare-observations" data-sampler="random"');
    expect(html).toContain("Best so far: TPE, GP, Random search");
  });

  it("restores only constraint-compatible 3D overlays in both views", () => {
    for (const initialViewMode of ["3d", "top"] as const) {
      const html = renderToStaticMarkup(<Play3D initialViewMode={initialViewMode} sharedSettings={new URLSearchParams("constraint=disk&compare=cmaes,gp,random")} />);
      expect(html).toContain(">Compare (1)</button>");
      expect(html).toContain("Performance · vs 1");
      expect(html).toMatch(/class="compare-legend"[^>]*>.*aria-label="TPE".*aria-label="Random"/);
      expect(html).not.toContain("<span aria-label=\"CMA-ES\">");
      expect(html).not.toContain("<span aria-label=\"GP\">");
    }
  });
});
