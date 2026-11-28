export type SamplerId = "tpe" | "cmaes" | "gp";
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

export const samplers = {
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
  gp: {
    id: "gp",
    label: "GP",
    shortLabel: "GP",
    pages: ["play-2d", "play-3d"],
    supportsConstraints: false,
    colorToken: "--sampler-gp",
    colorName: "purple",
  },
} as const satisfies Readonly<Record<SamplerId, SamplerDefinition>>;

type SamplerOnPage<Page extends SamplerPage> = {
  [Id in SamplerId]: Page extends typeof samplers[Id]["pages"][number] ? typeof samplers[Id] : never;
}[SamplerId];

export const samplerList: readonly SamplerDefinition[] = Object.values(samplers);

export function getSampler(id: SamplerId): SamplerDefinition {
  return samplers[id];
}

export function samplersForPage<Page extends SamplerPage>(page: Page): readonly SamplerOnPage<Page>[];
export function samplersForPage(page: SamplerPage): readonly SamplerDefinition[] {
  return samplerList.filter((sampler) => sampler.pages.includes(page));
}

export function supportsConstraints(id: SamplerId): boolean {
  return getSampler(id).supportsConstraints;
}

export type CompareSamplerId = SamplerId | "random";
type CompareSamplerDefinition = Omit<SamplerDefinition, "id" | "colorToken"> & {
  readonly id: CompareSamplerId;
  readonly colorToken: `--sampler-${CompareSamplerId}`;
  readonly dashed?: boolean;
};

const randomSampler = {
  id: "random",
  label: "Random",
  shortLabel: "Rand",
  pages: ["play-2d", "play-3d"],
  supportsConstraints: true,
  colorToken: "--sampler-random",
  colorName: "gray",
  dashed: true,
} as const satisfies CompareSamplerDefinition;

export function getCompareSampler(id: CompareSamplerId): CompareSamplerDefinition {
  return id === "random" ? randomSampler : getSampler(id);
}

export function compareOptionsForPage(page: SamplerPage, focus: SamplerId): readonly CompareSamplerDefinition[] {
  return [...samplersForPage(page).filter(({ id }) => id !== focus), randomSampler];
}
