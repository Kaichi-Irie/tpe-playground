import type { Observation, Problem } from "./model/types";
import { getTwoParamConstraint, twoParamConstrainedOptima, type TwoParamConstraintPreset } from "./twoParamConstraints";

export interface TwoParamTrial { id: number; x1: number; x2: number; value: number; constraints: number[]; violation: number }
export const twoParamTrialLimit = 200;
export const twoParamDefaultSeed = 42;

function twoParamObjective(x1: number, x2: number): number {
  return 0.12 * (x1 - 0.7) ** 2 + 0.18 * (x2 + 0.5) ** 2 + Math.sin(1.4 * x1) * Math.cos(1.1 * x2) + 1.2;
}

export const twoParamObjectivePresets = {
  multimodal: { label: "Multimodal", description: "Multiple local minima with interacting coordinates.", formula: String.raw`\begin{aligned}f(x_1,x_2)={}&0.12(x_1-0.7)^2+0.18(x_2+0.5)^2\\&+\sin(1.4x_1)\cos(1.1x_2)+1.2\end{aligned}`, evaluate: twoParamObjective },
  quadratic: { label: "Quadratic", description: "An axis-aligned bowl with one minimum at (1.5, −1).", formula: String.raw`f(x_1,x_2)=0.12(x_1-1.5)^2+0.18(x_2+1)^2`, evaluate: (x1: number, x2: number) => 0.12 * (x1 - 1.5) ** 2 + 0.18 * (x2 + 1) ** 2 },
  rosenbrock: { label: "Rosenbrock", description: "A curved valley coupling both coordinates, with a minimum at (1, 1).", formula: String.raw`f(x_1,x_2)=\frac{(1-x_1)^2+100(x_2-x_1^2)^2}{1000}`, evaluate: (x1: number, x2: number) => ((1 - x1) ** 2 + 100 * (x2 - x1 ** 2) ** 2) / 1000 },
} as const;
export type TwoParamObjectivePreset = keyof typeof twoParamObjectivePresets;
export function getTwoParamObjective(preset: TwoParamObjectivePreset = "multimodal") {
  if (!Object.prototype.hasOwnProperty.call(twoParamObjectivePresets, preset)) throw new Error("Unknown two-parameter objective preset.");
  return twoParamObjectivePresets[preset];
}

// Deterministic global grid followed by local refinement for the multimodal reference.
export function findTwoParamObjectiveOptimum(preset: TwoParamObjectivePreset, constraintPreset: TwoParamConstraintPreset = "none"): { x1: number; x2: number; value: number } {
  getTwoParamObjective(preset);
  if (constraintPreset !== "none") return { ...twoParamConstrainedOptima[constraintPreset][preset] };
  if (preset === "quadratic") return { x1: 1.5, x2: -1, value: 0 };
  if (preset === "rosenbrock") return { x1: 1, x2: 1, value: 0 };
  const evaluate = getTwoParamObjective(preset).evaluate;
  let best = { x: 0, y: 0, value: Infinity };
  for (let i = 0; i <= 100; i++) for (let j = 0; j <= 100; j++) {
    const x = -5 + i / 10, y = -5 + j / 10;
    const value = evaluate(x, y);
    if (value < best.value) best = { x, y, value };
  }
  for (let step = 0.1; step > 1e-10; step /= 2) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const x = Math.max(-5, Math.min(5, best.x + dx * step));
        const y = Math.max(-5, Math.min(5, best.y + dy * step));
        const value = evaluate(x, y);
        if (value < best.value) { best = { x, y, value }; improved = true; }
      }
    }
  }
  return { x1: best.x, x2: best.y, value: best.value };
}

export function findTwoParamObjectiveMinimum(preset: TwoParamObjectivePreset, constraintPreset?: TwoParamConstraintPreset): number {
  return findTwoParamObjectiveOptimum(preset, constraintPreset).value;
}

export const twoParamProblem: Problem = { id: "two-param", parameters: [{ id: "x1", low: -5, high: 5 }, { id: "x2", low: -5, high: 5 }], directions: ["minimize"], constraintCount: 0 };
export function twoParamProblemForConstraint(preset: TwoParamConstraintPreset = "none"): Problem {
  return preset === "none" ? twoParamProblem : { ...twoParamProblem, id: `two-param-${preset}`, constraintCount: getTwoParamConstraint(preset).constraints.length };
}
export const twoParamObservations = (trials: readonly TwoParamTrial[]): Observation[] => trials.map((t) => ({ id: t.id, params: { x1: t.x1, x2: t.x2 }, objectives: [t.value], constraints: t.constraints }));
