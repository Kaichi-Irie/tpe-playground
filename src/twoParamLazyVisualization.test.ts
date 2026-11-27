import { expect, it, vi } from "vitest";
import * as fields from "./model/tpe/visualization";
import { buildTwoParamView, emptyTwoParamPlayback, moveTwoParamPlayback } from "./twoParamTpe";

it("fits and proposes without a display grid, then builds it once when needed", () => {
  const spy = vi.spyOn(fields, "evaluateFieldGrid2D");
  try {
    const model = buildTwoParamView(moveTwoParamPlayback(emptyTwoParamPlayback(), 20).trials);
    expect(model.hasDensities).toBe(true);
    model.fitted!.propose(42);
    model.evaluate(0, 0);
    expect(spy).not.toHaveBeenCalled();
    const grid = model.grid;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(model.grid).toBe(grid);
    void model.scales;
    expect(spy).toHaveBeenCalledTimes(1);
  } finally { spy.mockRestore(); }
});
