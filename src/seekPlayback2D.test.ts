import { expect, it } from "vitest";
import { seekPlayback2D } from "./seekPlayback2D";
import { emptyPlayback2D, movePlayback2D } from "./tpe2d";

it("chunked seeks preserve every observation and proposal, including backwards movement", async () => {
  for (const mode of ["multivariate", "univariate"] as const) {
    const state = movePlayback2D(emptyPlayback2D(), 12, 42, mode);
    const snapshot = structuredClone(state);
    for (const target of [0, 8, 12, 50, 200]) {
      let yields = 0;
      const actual = await seekPlayback2D(state, target, 42, mode, { priorWeight: 0.5, bandwidthRule: "scott" }, new AbortController().signal, async () => { yields++; });
      expect(actual).toEqual(movePlayback2D(state, target, 42, mode, { priorWeight: 0.5, bandwidthRule: "scott" }));
      expect(state).toEqual(snapshot);
      if (target > 20) expect(yields).toBeGreaterThan(1);
    }
  }
});

it("abandons cancelled work before starting and at the next task boundary", async () => {
  for (const cancelAt of [1, 2, 4]) {
    const controller = new AbortController();
    const state = emptyPlayback2D();
    let yields = 0;
    const result = await seekPlayback2D(state, 200, 42, "multivariate", {}, controller.signal, async () => {
      if (++yields === cancelAt) controller.abort();
    });
    expect(result).toBeNull();
    expect(yields).toBe(cancelAt);
    expect(state).toEqual(emptyPlayback2D());
  }
});

it("yields when the time budget is reached, even before eight trials", async () => {
  let time = 0, yields = 0;
  await seekPlayback2D(emptyPlayback2D(), 5, 42, "multivariate", {}, new AbortController().signal,
    async () => { yields++; }, () => time += 9);
  expect(yields).toBe(5);
});
