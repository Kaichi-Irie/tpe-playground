import { seekPlayback } from "./seekPlayback";
import { moveTwoParamPlayback, twoParamSettings, type DensityMode, type TwoParamPlayback, type TwoParamSearchSettings } from "./twoParamTpe";

export function seekTwoParamPlayback(
  state: TwoParamPlayback,
  next: number,
  seed: number,
  mode: DensityMode,
  settings: TwoParamSearchSettings,
  signal: AbortSignal,
  yieldTask?: () => Promise<void>,
  now?: () => number,
): Promise<TwoParamPlayback | null> {
  return seekPlayback(state, (playback) => playback.trials.length, next, twoParamSettings.count,
    (playback, step) => moveTwoParamPlayback(playback, step, seed, mode, settings),
    signal, yieldTask, now);
}
