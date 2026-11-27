import { expect, it } from "vitest";
import { dataKey, freezeData, historyKeyFor } from "./provenance";
import type { Observation, Problem } from "./types";

it("freezes nested objects and arrays in place", () => {
  const value = { trials: [{ params: { x: 1 } }] };
  expect(freezeData(value)).toBe(value);
  for (const entry of [value, value.trials, value.trials[0], value.trials[0].params]) {
    expect(Object.isFrozen(entry)).toBe(true);
  }
  expect(() => { value.trials[0].params.x = 2; }).toThrow(TypeError);
  expect(freezeData(42)).toBe(42);
});

it("produces the same key for the same serialized data", () => {
  const value = ["model", { seed: 42 }, [1, 2]];
  expect(dataKey(value)).toBe(dataKey(structuredClone(value)));
  expect(dataKey(value)).not.toBe(dataKey(["model", { seed: 43 }, [1, 2]]));
});

it("keys history by observation values in parameter declaration order", () => {
  const problem: Problem = {
    id: "box",
    parameters: [{ id: "x", low: -5, high: 5 }, { id: "y", low: -5, high: 5 }],
    directions: ["minimize"],
    constraintCount: 1,
  };
  const observation: Observation = { id: 1, params: { y: 2, x: 1 }, objectives: [3], constraints: [4] };
  const key = historyKeyFor(problem, [observation]);
  expect(key).toBe(dataKey([[1, [1, 2], [3], [4]]]));
  expect(historyKeyFor(problem, [{ ...observation, params: { x: 1, y: 2 } }])).toBe(key);
  for (const changed of [
    { ...observation, id: 2 },
    { ...observation, params: { x: -1, y: 2 } },
    { ...observation, objectives: [2] },
    { ...observation, constraints: [0] },
  ]) {
    expect(historyKeyFor(problem, [changed])).not.toBe(key);
  }
  expect(historyKeyFor({ ...problem, parameters: [...problem.parameters].reverse() }, [observation])).not.toBe(key);
});
