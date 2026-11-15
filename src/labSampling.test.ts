import { expect, it } from "vitest";
import { buildExplanation, explanationDefaults, fixedExample } from "./explanation";
import { samplingReducer } from "./labSampling";

it("restores five rolls and their values after reducing M and returning", () => {
  let revealed = 0;
  for (let i = 0; i < 5; i++) revealed = samplingReducer(revealed, { type: "roll", limit: 8 });
  const before = buildExplanation(fixedExample, explanationDefaults).candidates.slice(0, revealed);
  for (const limit of [2, 1, 4, 8]) {
    revealed = samplingReducer(revealed, { type: "resize", limit, reveal: false });
    const visible = buildExplanation(fixedExample, { ...explanationDefaults, candidates: limit }).candidates.slice(0, revealed);
    expect(visible).toEqual(before.slice(0, limit));
    expect(revealed).toBe(5);
  }
  expect(samplingReducer(revealed, { type: "roll", limit: 8 })).toBe(6);
  expect(samplingReducer(revealed, { type: "rollRest", limit: 8 })).toBe(8);
});

it("keeps completed rolls through M changes, caps rolls, and clears them on resampling", () => {
  let revealed = samplingReducer(5, { type: "rollRest", limit: 12 });
  expect(revealed).toBe(12);
  revealed = samplingReducer(revealed, { type: "resize", limit: 3, reveal: false });
  expect(samplingReducer(revealed, { type: "roll", limit: 3 })).toBe(12);
  revealed = samplingReducer(revealed, { type: "resize", limit: 12, reveal: false });
  expect(revealed).toBe(12);
  revealed = samplingReducer(revealed, { type: "reset" });
  expect(revealed).toBe(0);
  expect(samplingReducer(revealed, { type: "roll", limit: 1 })).toBe(1);
});

it("reveals new candidates while choosing without forgetting a larger previous M", () => {
  let revealed = samplingReducer(8, { type: "resize", limit: 20, reveal: true });
  expect(revealed).toBe(20);
  revealed = samplingReducer(revealed, { type: "resize", limit: 2, reveal: true });
  expect(revealed).toBe(20);
  expect(samplingReducer(revealed, { type: "reset", revealed: 2 })).toBe(2);
});
