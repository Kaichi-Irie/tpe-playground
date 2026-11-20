import { moveTwoParamPlayback, twoParamSettings, type DensityMode, type TwoParamPlayback, type TwoParamSearchSettings } from "./twoParamTpe";

// Publish only the complete result. The caller owns cancellation and can discard
// a superseded seek without changing observations, proposals or the seed stream.
export async function seekTwoParamPlayback(state: TwoParamPlayback, next: number, seed: number, mode: DensityMode, settings: TwoParamSearchSettings, signal: AbortSignal,
  yieldTask: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
  now: () => number = () => performance.now()): Promise<TwoParamPlayback | null> {
  if (!Number.isInteger(next)) throw new Error("Trial step must be an integer.");
  const target = Math.max(0, Math.min(twoParamSettings.count, next));
  // Yield before starting so the slider and cancellation controls can update.
  await yieldTask();
  if (signal.aborted) return null;
  if (target <= state.trials.length) return moveTwoParamPlayback(state, target, seed, mode, settings);
  let result = state;
  while (result.trials.length < target) {
    const start = now();
    let steps = 0;
    do {
      if (signal.aborted) return null;
      result = moveTwoParamPlayback(result, result.trials.length + 1, seed, mode, settings);
      steps++;
    } while (result.trials.length < target && steps < 8 && now() - start < 8);
    if (result.trials.length < target) await yieldTask();
  }
  return signal.aborted ? null : result;
}
