import { expect, it } from "vitest";
import { seekTwoParamPlayback } from "./seekTwoParamPlayback";
import { emptyTwoParamPlayback, moveTwoParamPlayback } from "./twoParamTpe";

it("chunked seeks preserve every observation and proposal, including backwards movement", async () => {
  for (const mode of ["multivariate", "univariate"] as const) {
    const state = moveTwoParamPlayback(emptyTwoParamPlayback(), 12, 42, mode);
    const snapshot = structuredClone(state);
    for (const target of [0, 8, 12, 50, 200]) {
      let yields = 0;
      const actual = await seekTwoParamPlayback(state, target, 42, mode, { priorWeight: 0.5, bandwidthRule: "scott" }, new AbortController().signal, async () => { yields++; });
      expect(actual).toEqual(moveTwoParamPlayback(state, target, 42, mode, { priorWeight: 0.5, bandwidthRule: "scott" }));
      expect(state).toEqual(snapshot);
      if (target > 20) expect(yields).toBeGreaterThan(1);
    }
  }
});

it("abandons cancelled work before starting and at the next task boundary", async () => {
  for (const cancelAt of [1, 2, 4]) {
    const controller = new AbortController();
    const state = emptyTwoParamPlayback();
    let yields = 0;
    const result = await seekTwoParamPlayback(state, 200, 42, "multivariate", {}, controller.signal, async () => {
      if (++yields === cancelAt) controller.abort();
    });
    expect(result).toBeNull();
    expect(yields).toBe(cancelAt);
    expect(state).toEqual(emptyTwoParamPlayback());
  }
});

it("yields when the time budget is reached, even before eight trials", async () => {
  let time = 0, yields = 0;
  await seekTwoParamPlayback(emptyTwoParamPlayback(), 5, 42, "multivariate", {}, new AbortController().signal,
    async () => { yields++; }, () => time += 9);
  expect(yields).toBe(5);
});
