// Publish only the complete result. The caller owns cancellation and can discard
// a superseded seek without changing observations, proposals or the seed stream.
export async function seekPlayback<State>(
  state: State,
  getStep: (state: State) => number,
  next: number,
  limit: number,
  moveTo: (state: State, step: number) => State,
  signal: AbortSignal,
  yieldTask: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
  now: () => number = () => performance.now(),
): Promise<State | null> {
  if (!Number.isInteger(next)) throw new Error("Trial step must be an integer.");
  const target = Math.max(0, Math.min(limit, next));
  // Yield before starting so the slider and cancellation controls can update.
  await yieldTask();
  if (signal.aborted) return null;
  if (target <= getStep(state)) return moveTo(state, target);
  let result = state;
  while (getStep(result) < target) {
    const start = now();
    let steps = 0;
    do {
      if (signal.aborted) return null;
      result = moveTo(result, getStep(result) + 1);
      steps++;
    } while (getStep(result) < target && steps < 8 && now() - start < 8);
    if (getStep(result) < target) await yieldTask();
  }
  return signal.aborted ? null : result;
}
