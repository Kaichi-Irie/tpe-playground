export const playbackSpeeds = [0.5, 1, 4, 10] as const;
export type PlaybackSpeed = (typeof playbackSpeeds)[number];

export const defaultPlaybackSpeed: PlaybackSpeed = 1;
