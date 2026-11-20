import { getTwoParamConstraint, violation, type TwoParamConstraintPreset } from "./twoParamConstraints";
import { objectiveContours, type ContourPoint, type ContourSegment } from "./contours";
import { findTwoParamObjectiveOptimum, getTwoParamObjective, type TwoParamObjectivePreset } from "./twoParamTpe";

export type ObjectiveHeightScale = "linear" | "log";

// Preserve the domain-wide samples and resolve the minimum locally. Merely
// interpolating the old mesh cannot recover the bottom of a log-scaled bowl.
function refineAxis(axis: number[], optimum: number): number[] {
  const offsets = [0, 0.0125, 0.025, 0.0375, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.6, 0.8];
  return [...new Set([...axis, ...offsets.flatMap((offset) => [optimum - offset, optimum + offset])])]
    .filter((value) => value >= -5 && value <= 5).sort((a, b) => a - b);
}

export function createTwoParamObjectiveView(preset: TwoParamObjectivePreset, constraintPreset: TwoParamConstraintPreset = "none") {
  const objective = getTwoParamObjective(preset);
  const optimum = findTwoParamObjectiveOptimum(preset);
  // For Rosenbrock, follow the valley rather than interpolating straight across
  // its narrow bottom. Both scales reuse the same original function samples.
  const x1Axis = Array.from({ length: 81 }, (_, i) => -5 + i / 8);
  const x2Axis = Array.from({ length: 33 }, (_, j) => -5 + j * 10 / 32);
  const refinedX2 = preset === "rosenbrock" ? x2Axis : refineAxis(x2Axis, optimum.x2);
  const grid = (preset === "rosenbrock" ? x1Axis : refineAxis(x1Axis, optimum.x1)).map((x1) => {
    const valley = Math.min(5, x1 ** 2);
    return refinedX2.map((sample, j) => {
      const t = (j - 16) / 16;
      const x2 = preset === "rosenbrock"
        ? valley + (t < 0 ? -5 - valley : 5 - valley) * t ** 2
        : sample;
      return { x1, x2, objective: objective.evaluate(x1, x2) };
    });
  });
  const low = optimum.value;
  const high = Math.max(...grid.flat().map((point) => point.objective));
  const range = high - low;
  const softening = preset === "rosenbrock" ? 0.001 : range / 1000;
  const normalize = (value: number, scale: ObjectiveHeightScale) => {
    const gap = Math.max(0, value - low);
    return scale === "linear" ? gap / range : Math.log1p(gap / softening) / Math.log1p(range / softening);
  };
  // Geometric levels reveal the bottom without changing the function or its height.
  const levels = preset === "rosenbrock"
    ? [0.0001, 0.0003, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 60]
    : [...[0.0001, 0.0003, 0.001].map((fraction) => low + fraction * range),
      ...Array.from({ length: 16 }, (_, i) => low + ((i + 1) / 17) ** 2 * range)];
  const rawContours = preset === "rosenbrock" ? rosenbrockContours(levels) : objectiveContours(grid, levels);
  const feasible = constraintPreset === "none" ? undefined : (x1: number, x2: number) => violation(x1, x2, constraintPreset) === 0;
  const contours = rawContours.map((segment) => ({
    ...segment, muted: feasible && !feasible((segment.a.x1 + segment.b.x1) / 2, (segment.a.x2 + segment.b.x2) / 2),
  }));
  const boundaries = getTwoParamConstraint(constraintPreset).boundaries.map((line) => line.map(([x1, x2]) => ({
    x1, x2, objective: objective.evaluate(x1, x2),
  })));
  return { grid, optimum: constraintPreset === "none" ? optimum : findTwoParamObjectiveOptimum(preset, constraintPreset), low, high, softening, levels, contours, boundaries, feasible, normalize };
}

// Exact level curves: x₂ = x₁² ± sqrt((1000 f − (1 − x₁)²) / 100).
// Sampling these branches avoids losing tiny closed contours to a coarse grid.
function rosenbrockContours(levels: readonly number[]): ContourSegment[] {
  const segments: ContourSegment[] = [];
  for (const level of levels) {
    if (!Number.isFinite(level) || level <= 0) continue;
    const radius = Math.sqrt(1000 * level);
    const low = Math.max(-5, 1 - radius), high = Math.min(5, 1 + radius);
    for (const sign of [-1, 1]) {
      let previous: ContourPoint | null = null;
      for (let i = 0; i <= 160; i++) {
        // Cosine spacing also resolves the ends where the two branches meet.
        const x1 = low + (high - low) * (1 - Math.cos(Math.PI * i / 160)) / 2;
        const x2 = x1 ** 2 + sign * Math.sqrt(Math.max(0, (1000 * level - (1 - x1) ** 2) / 100));
        const point = { x1, x2, objective: level };
        if (x2 >= -5 && x2 <= 5) {
          if (previous) segments.push({ level, a: previous, b: point });
          previous = point;
        } else previous = null;
      }
    }
  }
  return segments;
}
