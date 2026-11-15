import { describe, expect, it } from "vitest";
import { placeSvgNodes2D, planSvgReuse2D } from "./svgReuse2D";

// Minimal DOM semantics: insertBefore moves existing nodes; sibling order is
// derived from the container, not copied from the renderer's slot array.
class TestNode {
  parentNode: TestContainer | null = null;
  constructor(readonly id: string) {}
  get nextSibling(): TestNode | null {
    return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] ?? null;
  }
}
class TestContainer {
  children: TestNode[] = [];
  insertBefore(node: TestNode, before: TestNode | null) {
    if (node === before) return;
    if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1);
    const index = before === null ? this.children.length : this.children.indexOf(before);
    if (index < 0) throw new Error("Reference node is not a child");
    this.children.splice(index, 0, node);
    node.parentNode = this;
  }
}

describe("SVG geometry reuse", () => {
  const a = { id: "a" }, b = { id: "b" }, c = { id: "c" };
  it("anchors unchanged geometry when density crosses it", () => {
    const plan = planSvgReuse2D([a, b, c], [{ id: "c" }, a, b]);
    expect(plan.sources).toEqual([2, 0, 1]);
    expect([...plan.anchors]).toEqual([1, 2]);
  });
  it("keeps paint-order slots for camera changes", () => {
    expect(planSvgReuse2D([a, b], [{ id: "b" }, { id: "a" }]).sources).toEqual([0, 1]);
    expect(planSvgReuse2D([a, b], [b, a]).anchors.size).toBe(0);
  });
  it("recycles removed geometry without stealing retained paths", () => {
    expect(planSvgReuse2D([a, b, c], [c, { id: "d" }, { id: "e" }, { id: "f" }]).sources).toEqual([2, 0, 1, -1]);
    expect(planSvgReuse2D([a], []).sources).toEqual([]);
    expect(planSvgReuse2D([], [a]).sources).toEqual([-1]);
  });
  it("preserves painter order through anchored updates, camera slots and marker insertion", () => {
    const container = new TestContainer();
    const paths = [new TestNode("a"), new TestNode("b"), new TestNode("c")];
    paths.forEach((node) => container.insertBefore(node, null));
    const marker = new TestNode("marker");
    const hosts = new Map([["marker", marker]]);
    container.insertBefore(marker, paths[1]);
    const previous = [a, b, c];
    const geometry = [{ id: "c" }, a, b];
    const plan = planSvgReuse2D(previous, geometry);
    const reordered = plan.sources.map((index) => paths[index]);
    placeSvgNodes2D(container, [{ id: "c", path: "" }, { id: "a", path: "" }, { id: "marker" }, { id: "b", path: "" }], reordered, hosts, plan.anchors);
    expect(container.children).toEqual([paths[2], paths[0], marker, paths[1]]);

    // A camera change reuses the same physical path slots with new coordinates.
    placeSvgNodes2D(container, [{ id: "b", path: "" }, { id: "marker" }, { id: "c", path: "" }, { id: "a", path: "" }], reordered, hosts, new Set());
    expect(container.children).toEqual([paths[2], marker, paths[0], paths[1]]);

    const added = new TestNode("added");
    hosts.set("added", added);
    placeSvgNodes2D(container, [{ id: "added" }, { id: "b", path: "" }, { id: "c", path: "" }, { id: "a", path: "" }, { id: "marker" }], reordered, hosts, new Set());
    expect(container.children).toEqual([added, ...reordered, marker]);
  });
});
