import { expect, it } from "vitest";
import { labLayout } from "./labLayout";

it.each([[1939, 300], [1440, 420], [900, 440], [390, 320], [844, 180]])(
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
