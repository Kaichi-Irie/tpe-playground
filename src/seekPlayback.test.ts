import { expect, it } from "vitest";
import { seekPlayback } from "./seekPlayback";

type History = readonly number[];

const getStep = (state: History) => state.length;
const moveTo = (state: History, step: number): History => {
  const kept = state.slice(0, step);
  while (kept.length < step) kept.push(kept.length + 1);
  return kept;
};

it("yields before starting and after every eight forward steps", async () => {
  const events: (number | string)[] = [];
  const result = await seekPlayback<History>([], getStep, 18, 20, (state, step) => {
    events.push(step);
    return moveTo(state, step);
  }, new AbortController().signal, async () => { events.push("yield"); }, () => 0);
  expect(events).toEqual(["yield", 1, 2, 3, 4, 5, 6, 7, 8, "yield", 9, 10, 11, 12, 13, 14, 15, 16, "yield", 17, 18]);
  expect(result).toEqual(moveTo([], 18));
});

it("yields when a chunk reaches eight milliseconds", async () => {
  let time = 0;
  let step = 0;
  const yieldSteps: number[] = [];
  await seekPlayback<History>([], getStep, 5, 20, (state, target) => {
    time += 4;
    step = target;
    return moveTo(state, target);
  }, new AbortController().signal, async () => { yieldSteps.push(step); }, () => time);
  expect(yieldSteps).toEqual([0, 2, 4]);
});

it.each([[-3, 0], [1, 1], [3, 3]])("moves from step three to %i after one yield", async (next, expected) => {
  const state = [1, 2, 3];
  const events: (number | string)[] = [];
  const result = await seekPlayback<History>(state, getStep, next, 5, (history, step) => {
    events.push(step);
    return moveTo(history, step);
  }, new AbortController().signal, async () => { events.push("yield"); });
  expect(events).toEqual(["yield", expected]);
  expect(result).toEqual(state.slice(0, expected));
  expect(state).toEqual([1, 2, 3]);
});

it("clamps forward movement to the limit", async () => {
  const result = await seekPlayback<History>([], getStep, 10, 3, moveTo, new AbortController().signal, async () => {});
  expect(result).toEqual([1, 2, 3]);
});

it("rejects non-integer steps before yielding", async () => {
  let yields = 0;
  const seek = seekPlayback<History>([], getStep, 1.5, 5, moveTo, new AbortController().signal, async () => { yields++; });
  await expect(seek).rejects.toThrow("Trial step must be an integer.");
  expect(yields).toBe(0);
});

it.each([[1, 0], [2, 8]])("abandons a seek cancelled at yield %i", async (cancelAt, expectedMoves) => {
  const controller = new AbortController();
  const state: History = [];
  let yields = 0;
  let moves = 0;
  const result = await seekPlayback<History>(state, getStep, 20, 20, (history, step) => {
    moves++;
    return moveTo(history, step);
  }, controller.signal, async () => {
    if (++yields === cancelAt) controller.abort();
  }, () => 0);
  expect(result).toBeNull();
  expect(moves).toBe(expectedMoves);
  expect(state).toEqual([]);
});
