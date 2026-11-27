export type SamplerId = "tpe" | "cmaes";
export type SamplerPage = "play-2d" | "play-3d";

export interface SamplerDefinition {
  readonly id: SamplerId;
  readonly label: string;
  readonly shortLabel: string;
  readonly pages: readonly SamplerPage[];
  readonly supportsConstraints: boolean;
  readonly colorToken: `--sampler-${SamplerId}`;
  readonly colorName: string;
}

export const samplers: Readonly<Record<SamplerId, SamplerDefinition>> = {
  tpe: {
    id: "tpe",
    label: "TPE",
    shortLabel: "TPE",
    pages: ["play-2d", "play-3d"],
    supportsConstraints: true,
    colorToken: "--sampler-tpe",
    colorName: "blue",
  },
  cmaes: {
    id: "cmaes",
    label: "CMA-ES",
    shortLabel: "CMA",
    pages: ["play-3d"],
    supportsConstraints: false,
    colorToken: "--sampler-cmaes",
    colorName: "green",
  },
};

export const samplerList: readonly SamplerDefinition[] = Object.values(samplers);

export function getSampler(id: SamplerId): SamplerDefinition {
  return samplers[id];
}

export function samplersForPage(page: SamplerPage): readonly SamplerDefinition[] {
  return samplerList.filter((sampler) => sampler.pages.includes(page));
}

export function supportsConstraints(id: SamplerId): boolean {
  return getSampler(id).supportsConstraints;
}
