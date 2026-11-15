import type { DensitySnapshot, Kernel, Parameter, Point, RandomSource } from "./types";

export function createDensity(parameters: readonly Parameter[], samples: readonly { id: number; params: Point }[], bandwidth: number, weights: readonly number[], priorWeight = 0): DensitySnapshot {
  const total = weights.reduce((sum, weight) => sum + weight, priorWeight);
  if (!parameters.length || !Number.isFinite(bandwidth) || bandwidth <= 0 || !Number.isFinite(priorWeight) || priorWeight < 0 || weights.length !== samples.length || weights.some((w) => !Number.isFinite(w) || w < 0) || !Number.isFinite(total) || total <= 0 || samples.some((s) => parameters.some((p) => !Number.isFinite(s.params[p.id])))) throw new Error("Invalid density inputs.");
  const kernels: Kernel[] = samples.map((sample, i) => ({
    source: { kind: "observation", trialId: sample.id },
    center: Object.fromEntries(parameters.map((p) => [p.id, sample.params[p.id]])),
    bandwidths: Object.fromEntries(parameters.map((p) => [p.id, bandwidth])),
    observationWeight: weights[i], mixtureWeight: weights[i] / total,
  }));
  if (priorWeight > 0) kernels.push({
    source: { kind: "prior" },
    center: Object.fromEntries(parameters.map((p) => [p.id, (p.low + p.high) / 2])),
    bandwidths: Object.fromEntries(parameters.map((p) => [p.id, p.high - p.low])),
    observationWeight: priorWeight, mixtureWeight: priorWeight / total,
  });
  return { parameters: parameters.map((p) => ({ ...p })), kernels, normalization: "full-space", sampling: "condition-mixture-on-domain" };
}

// Cache only immutable model snapshots; editable caller-owned densities are never cached.
const evaluators = new WeakMap<DensitySnapshot, Map<string, (point: Point) => number>>();

export function createLogDensity(model: DensitySnapshot, axes: readonly string[] = model.parameters.map((p) => p.id)): (point: Point) => number {
  if (new Set(axes).size !== axes.length || axes.some((id) => !model.parameters.some((p) => p.id === id))) throw new Error("Invalid density axes.");
  const terms = model.kernels.filter((k) => k.mixtureWeight > 0).map((kernel) => ({
    base: Math.log(kernel.mixtureWeight) - axes.reduce((sum, id) => sum + Math.log(kernel.bandwidths[id]) + 0.5 * Math.log(2 * Math.PI), 0),
    centers: axes.map((id) => kernel.center[id]),
    widths: axes.map((id) => kernel.bandwidths[id]),
  }));
  return (point) => {
    if (axes.some((id) => !Number.isFinite(point[id]))) throw new Error("Invalid evaluation point.");
    let max = -Infinity;
    const values = new Array<number>(terms.length);
    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      let value = term.base;
      for (let j = 0; j < axes.length; j++) value -= 0.5 * ((point[axes[j]] - term.centers[j]) / term.widths[j]) ** 2;
      values[i] = value;
      if (value > max) max = value;
    }
    if (max === -Infinity) return max;
    let sum = 0;
    for (const value of values) sum += Math.exp(value - max);
    return max + Math.log(sum);
  };
}

// A Cartesian grid repeats each coordinate many times. Precompute the Gaussian
// penalties per axis, retaining the same subtraction order and log-sum-exp as
// point evaluation. This is display-only; proposal scoring is unchanged.
export function logDensityGrid2D(model: DensitySnapshot, xId: string, xs: readonly number[], yId: string, ys: readonly number[]): number[][] {
  if (xId === yId || model.parameters.length !== 2 || [xId, yId].some((id) => !model.parameters.some((p) => p.id === id)) || [...xs, ...ys].some((v) => !Number.isFinite(v))) throw new Error("Invalid density grid.");
  const axes = model.parameters.map((p) => p.id);
  const terms = model.kernels.filter((k) => k.mixtureWeight > 0).map((kernel) => ({
    base: Math.log(kernel.mixtureWeight) - axes.reduce((sum, id) => sum + Math.log(kernel.bandwidths[id]) + 0.5 * Math.log(2 * Math.PI), 0),
    x: xs.map((x) => 0.5 * ((x - kernel.center[xId]) / kernel.bandwidths[xId]) ** 2),
    y: ys.map((y) => 0.5 * ((y - kernel.center[yId]) / kernel.bandwidths[yId]) ** 2),
  }));
  const values = new Float64Array(terms.length);
  return xs.map((_, i) => ys.map((_, j) => {
    let max = -Infinity;
    for (let k = 0; k < terms.length; k++) {
      const term = terms[k];
      const value = axes[0] === xId ? term.base - term.x[i] - term.y[j] : term.base - term.y[j] - term.x[i];
      values[k] = value;
      if (value > max) max = value;
    }
    if (max === -Infinity) return max;
    let sum = 0;
    for (const value of values) sum += Math.exp(value - max);
    return max + Math.log(sum);
  }));
}

// Omitted axes are integrated out analytically, not fixed at zero.
export function logDensity(model: DensitySnapshot, point: Point, axes: readonly string[] = model.parameters.map((p) => p.id)): number {
  if (!Object.isFrozen(model)) return createLogDensity(model, axes)(point);
  let cache = evaluators.get(model);
  if (!cache) { cache = new Map(); evaluators.set(model, cache); }
  const key = JSON.stringify(axes);
  let evaluate = cache.get(key);
  if (!evaluate) { evaluate = createLogDensity(model, axes); cache.set(key, evaluate); }
  return evaluate(point);
}

export function sampleDensity(model: DensitySnapshot, random: RandomSource): Point {
  // Reject the entire mixture draw, not only a coordinate or a fixed component.
  // A bound prevents pathological bandwidths from locking the browser forever.
  for (let attempt = 0; attempt < 100000; attempt++) {
    const total = model.kernels.reduce((sum, k) => sum + k.observationWeight, 0);
    const choice = random() * total;
    let cumulative = 0;
    const kernel = model.kernels.find((k) => (cumulative += k.observationWeight) > choice)!;
    const params: Record<string, number> = {};
    for (let i = 0; i < model.parameters.length; i += 2) {
      const radius = Math.sqrt(-2 * Math.log(random()));
      const angle = 2 * Math.PI * random();
      const a = model.parameters[i].id;
      params[a] = kernel.center[a] + kernel.bandwidths[a] * radius * Math.cos(angle);
      if (i + 1 < model.parameters.length) {
        const b = model.parameters[i + 1].id;
        params[b] = kernel.center[b] + kernel.bandwidths[b] * radius * Math.sin(angle);
      }
    }
    if (model.parameters.every((p) => params[p.id] >= p.low && params[p.id] <= p.high)) return params;
  }
  throw new Error("Could not sample within the domain; reduce bandwidth or prior weight.");
}
