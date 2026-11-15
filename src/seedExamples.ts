import type { ObjectivePreset } from "./objectives";

// Top ten absolute log10 gap ratios at evaluation 200, from seeds 0–63.
// Selection uses default model settings, prior weight 1, and a 1e-12 gap floor.
// Reproduce with: node scripts/select-example-seeds.mjs
export const seedExamples: Record<ObjectivePreset, readonly number[]> = {
  multimodal: [50, 56, 6, 35, 60, 57, 23, 49, 14, 3],
  quadratic: [44, 45, 6, 43, 7, 52, 41, 4, 24, 55],
  narrow: [9, 59, 47, 56, 41, 26, 44, 38, 53, 21],
  boundary: [41, 30, 11, 29, 52, 63, 46, 7, 37, 62],
};

export function nextExampleIndex(preset: ObjectivePreset, current: number): number {
  return (current + 1) % seedExamples[preset].length;
}
