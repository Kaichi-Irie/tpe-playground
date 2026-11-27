import type { TwoParamObjectivePreset } from "./twoParamProblem";

type Coordinate = readonly [x1: number, x2: number];
type Constraint = (x1: number, x2: number) => number;
interface ConstraintDefinition {
  label: string;
  description: string;
  /** KaTeX source of the feasible region. */
  formula: string;
  feasibleShare: string;
  constraints: readonly Constraint[];
  boundaries: readonly (readonly Coordinate[])[];
}

const diagonal = (sum: number) => Array.from({ length: 97 }, (_, i): Coordinate => {
  const x1 = sum - 5 + (10 - sum) * i / 96;
  return [x1, sum - x1];
});
const diskBoundary = Array.from({ length: 97 }, (_, i): Coordinate => {
  const angle = 2 * Math.PI * (i % 96) / 96;
  return [3 + 0.7 * Math.cos(angle), 3 + 0.7 * Math.sin(angle)];
});

export const twoParamConstraintPresets = {
  none: { label: "None", description: "The whole search domain is feasible.", formula: "", feasibleShare: "100%", constraints: [], boundaries: [] },
  disk: {
    label: "Small disk", description: "A disk of radius 0.7 centered at (3, 3).",
    formula: String.raw`\sqrt{(x_1-3)^2+(x_2-3)^2}\le 0.7`, feasibleShare: "1.5%",
    constraints: [(x1, x2) => Math.hypot(x1 - 3, x2 - 3) - 0.7], boundaries: [diskBoundary],
  },
  band: {
    label: "Thin band", description: "The space between two parallel lines.",
    formula: String.raw`2.8\le x_1+x_2\le 3.2`, feasibleShare: "2.8%",
    constraints: [(x1, x2) => (x1 + x2 - 3.2) / Math.SQRT2, (x1, x2) => (2.8 - x1 - x2) / Math.SQRT2],
    boundaries: [diagonal(2.8), diagonal(3.2)],
  },
  halfplane: {
    label: "Half-plane", description: "One side of a diagonal line.",
    formula: String.raw`x_1+x_2\ge 3`, feasibleShare: "25%",
    constraints: [(x1, x2) => (3 - x1 - x2) / Math.SQRT2], boundaries: [diagonal(3)],
  },
} satisfies Record<string, ConstraintDefinition>;

export type TwoParamConstraintPreset = keyof typeof twoParamConstraintPresets;

export function getTwoParamConstraint(preset: TwoParamConstraintPreset = "none"): ConstraintDefinition {
  if (!Object.prototype.hasOwnProperty.call(twoParamConstraintPresets, preset)) throw new Error("Unknown two-parameter constraint preset.");
  return twoParamConstraintPresets[preset];
}

export function violation(x1: number, x2: number, preset: TwoParamConstraintPreset): number {
  return getTwoParamConstraint(preset).constraints.reduce((sum, constraint) => sum + Math.max(0, constraint(x1, x2)), 0);
}

// Constrained references from issue #47. Disk coordinates are refined onto the
// feasible side of the boundary to preserve the precision of the objective values.
export const twoParamConstrainedOptima = {
  disk: {
    multimodal: { x1: 2.425204327816748, x2: 2.600487878482530, value: 3.52863724504 },
    quadratic: { x1: 2.820727560240071, x2: 2.323345440906138, value: 2.19735104013 },
    rosenbrock: { x1: 2.315728490720231, x2: 3.147555079844691, value: 0.492372851409 },
  },
  band: {
    multimodal: { x1: 3.06489403, x2: -0.12322861, value: 0.99258810262 },
    quadratic: { x1: 2.88, x2: -0.08, value: 0.38088 },
    rosenbrock: { x1: 1.24622306, x2: 1.55377694, value: 6.06755012619e-5 },
  },
  halfplane: {
    multimodal: { x1: 3.08953093, x2: -0.08953093, value: 0.993969214296 },
    quadratic: { x1: 3, x2: 0, value: 0.45 },
    rosenbrock: { x1: 1.30254287, x2: 1.69745713, value: 9.1602614156e-5 },
  },
} satisfies Record<Exclude<TwoParamConstraintPreset, "none">, Record<TwoParamObjectivePreset, { x1: number; x2: number; value: number }>>;
