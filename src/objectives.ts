export type ObjectivePreset = "multimodal" | "quadratic" | "narrow" | "boundary";

interface ObjectiveDefinition {
  label: string;
  description: string;
  formula: string;
  evaluate: (x: number) => number;
}

function rawObjective(x: number): number {
  return 0.18 * (x - 0.6) ** 2 + Math.sin(1.8 * x) + 0.35 * Math.cos(3 * x) + 1.5;
}

// All presets share [-5, 5] and fit the fixed [0, 8] objective axis.
const rawPresets: Record<ObjectivePreset, ObjectiveDefinition> = {
  multimodal: {
    label: "Multimodal",
    description: "Several local minima compete with the global minimum. The original playground function.",
    formula: "f(x) = 0.18(x − 0.6)² + sin(1.8x) + 0.35cos(3x) + 1.5",
    evaluate: rawObjective,
  },
  quadratic: {
    label: "Single minimum",
    description: "A smooth bowl with a single minimum at x = 1.5. A simple baseline for comparing settings.",
    formula: "f(x) = 0.12(x − 1.5)²",
    evaluate: (x) => 0.12 * (x - 1.5) ** 2,
  },
  narrow: {
    label: "Narrow global minimum",
    description: "A narrow, deeper valley near x = 2 competes with a broad, shallower valley near x = −2.",
    formula: "f(x) = 3 − 2.5 exp(−((x − 2)/0.25)²) − 1.5 exp(−((x + 2)/1.2)²)",
    evaluate: (x) => 3 - 2.5 * Math.exp(-(((x - 2) / 0.25) ** 2)) - 1.5 * Math.exp(-(((x + 2) / 1.2) ** 2)),
  },
  boundary: {
    label: "Boundary minimum",
    description: "The minimum lies at the left boundary, x = −5. Observe how sampling behaves near the search limit.",
    formula: "f(x) = 0.06(x + 5)²",
    evaluate: (x) => 0.06 * (x + 5) ** 2,
  },
};

// Bracket local minima on a fine grid, refine each, and include boundaries.
function findMinimum(evaluate: (x: number) => number): { x: number; y: number } {
  const spacing = 0.005;
  const values = Array.from({ length: 2001 }, (_, i) => evaluate(-5 + i * spacing));
  let best = values[0] <= values[2000] ? { x: -5, y: values[0] } : { x: 5, y: values[2000] };
  for (let i = 1; i < 2000; i++) {
    if (values[i] > values[i - 1] || values[i] > values[i + 1]) continue;
    let left = -5 + (i - 1) * spacing;
    let right = left + 2 * spacing;
    const ratio = (Math.sqrt(5) - 1) / 2;
    for (let iteration = 0; iteration < 80; iteration++) {
      const a = right - ratio * (right - left);
      const b = left + ratio * (right - left);
      if (evaluate(a) <= evaluate(b)) right = b;
      else left = a;
    }
    const x = (left + right) / 2;
    const y = evaluate(x);
    if (y < best.y) best = { x, y };
  }
  return best;
}


const rawMinima = Object.fromEntries((Object.keys(rawPresets) as ObjectivePreset[]).map((preset) => [
  preset, preset === "quadratic" ? { x: 1.5, y: 0 } : findMinimum(rawPresets[preset].evaluate),
])) as Record<ObjectivePreset, { x: number; y: number }>;

// Add a constant only: preserve each landscape and its objective ranking.
function objective(x: number): number {
  return rawObjective(x) - rawMinima.multimodal.y + 1;
}

export const objectivePresets = Object.fromEntries((Object.keys(rawPresets) as ObjectivePreset[]).map((preset) => {
  const raw = rawPresets[preset];
  return [preset, {
    ...raw,
    evaluate: preset === "multimodal" ? objective : (x: number) => raw.evaluate(x) - rawMinima[preset].y + 1,
  }];
})) as Record<ObjectivePreset, ObjectiveDefinition>;

export function getObjective(preset: ObjectivePreset = "multimodal"): ObjectiveDefinition {
  if (!Object.prototype.hasOwnProperty.call(objectivePresets, preset)) throw new Error("Unknown objective preset.");
  return objectivePresets[preset];
}

// The optimizer only sees evaluations, never these chart references.
export function findObjectiveMinimum(preset: ObjectivePreset): { x: number; y: number } {
  getObjective(preset);
  return { x: rawMinima[preset].x, y: 1 };
}
