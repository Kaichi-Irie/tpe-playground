import { expect, it } from "vitest";
import { labLayout } from "./labLayout";

const phonePlotFloor = labLayout(375, 0).minimumPlotHeight;

it("keeps the minimum plot height at 260 px on a small phone", () => {
  expect(labLayout(375, 550).minimumPlotHeight).toBe(260);
});

it.each([[1939, 300], [1440, 420], [900, 440], [390, 320], [844, 180], [375, phonePlotFloor]])(
  "reserves room for all three scoring lanes at %i × %i",
  (width, height) => {
    const layout = labLayout(width, height);
    expect(layout.height).toBeGreaterThanOrEqual(440);
    expect((layout.height - layout.bottom) * width / layout.width).toBeCloseTo(70, 10);
    for (let row = 0; row < 3; row++) {
      const title = row * layout.lane + 50;
      const baseline = (row + 1) * layout.lane;
      const peak = baseline - layout.curveHeight;
      expect(title - 26).toBeGreaterThanOrEqual(row * layout.lane + 23);
      expect(peak - title).toBeCloseTo(14, 10);
      expect(baseline + 49).toBeLessThan(layout.height);
    }
  },
);
