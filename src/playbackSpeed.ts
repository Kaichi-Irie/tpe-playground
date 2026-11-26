export const playbackSpeeds = [0.5, 1, 4, 10] as const;
export type PlaybackSpeed = (typeof playbackSpeeds)[number];

export const defaultPlaybackSpeed: PlaybackSpeed = 1;

export function nextPlaybackSpeed(speed: PlaybackSpeed, direction: 1 | -1): PlaybackSpeed {
  const index = playbackSpeeds.indexOf(speed);
  return playbackSpeeds[(index + direction + playbackSpeeds.length) % playbackSpeeds.length];
}
