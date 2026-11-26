import { expect, it } from "vitest";
import { nextPlaybackSpeed, type PlaybackSpeed } from "./playbackSpeed";

it.each<[PlaybackSpeed, PlaybackSpeed, PlaybackSpeed]>([
  [0.5, 1, 10],
  [1, 4, 0.5],
  [4, 10, 1],
  [10, 0.5, 4],
])("cycles from %sx to %sx forward and %sx backward", (speed, faster, slower) => {
  expect(nextPlaybackSpeed(speed, 1)).toBe(faster);
  expect(nextPlaybackSpeed(speed, -1)).toBe(slower);
});
