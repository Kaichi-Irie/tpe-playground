import { createLogDensity, logDensityGrid2D } from "./density";
import type { FittedTpeModel } from "./engine";
import type { Point } from "./types";

export type FieldId = "good-density" | "bad-density" | "log-ratio";
export type Projection = { readonly kind: "full" } | { readonly kind: "slice"; readonly fixed: Point } | { readonly kind: "marginal" };
export interface FieldRequest {
  readonly field: FieldId;
  readonly axes: readonly string[];
  readonly points: readonly Point[];
  readonly projection: Projection;
}

// Pure adapter: no objective evaluator, camera, color, resolution or sampler state.
export function createFieldEvaluator(model: FittedTpeModel, request: Omit<FieldRequest, "field" | "points">) {
  const ids = model.snapshot.problem.parameters.map((p) => p.id);
  if (!request.axes.length || new Set(request.axes).size !== request.axes.length || request.axes.some((id) => !ids.includes(id))) throw new Error("Invalid visualization axes.");
  if (request.projection.kind === "full" && request.axes.length !== ids.length) throw new Error("Full evaluation needs every axis.");
  if (request.projection.kind === "slice") {
    const fixed = request.projection.fixed;
    if (Object.keys(fixed).some((id) => !ids.includes(id) || request.axes.includes(id)) || ids.some((id) => !request.axes.includes(id) && !Number.isFinite(fixed[id]))) throw new Error("A slice must fix exactly the omitted axes.");
  }
  const groups = model.snapshot.groups.map((group) => {
    const axes = request.projection.kind === "marginal" ? group.parameterIds.filter((id) => request.axes.includes(id)) : group.parameterIds;
    return { good: createLogDensity(group.good, axes), bad: createLogDensity(group.bad, axes) };
  });
  return (point: Point) => {
    if (request.axes.some((id) => !Number.isFinite(point[id]))) throw new Error("Missing visualization coordinate.");
    const coordinates = request.projection.kind === "slice" ? { ...point, ...request.projection.fixed } : point;
    let logL = 0, logG = 0;
    for (const group of groups) {
      logL += group.good(coordinates);
      logG += group.bad(coordinates);
    }
    // For marginals, this is the ratio of marginal densities, not an integral of acquisition.
    return { "good-density": Math.exp(logL), "bad-density": Math.exp(logG), "log-ratio": logL - logG };
  };
}

export function evaluateField(model: FittedTpeModel, request: FieldRequest) {
  const evaluate = createFieldEvaluator(model, request);
  const values = request.points.map((point) => evaluate(point)[request.field]);
  return { modelId: model.snapshot.id, ...request, values };
}

export function evaluateFieldGrid2D(model: FittedTpeModel, xId: string, xs: readonly number[], yId: string, ys: readonly number[]) {
  const ids = model.snapshot.problem.parameters.map((p) => p.id);
  if (ids.length !== 2 || xId === yId || !ids.includes(xId) || !ids.includes(yId) || [...xs, ...ys].some((v) => !Number.isFinite(v))) throw new Error("Invalid visualization grid.");
  const groups = model.snapshot.groups.map((group) => {
    if (group.parameterIds.length === 2) return {
      good: logDensityGrid2D(group.good, xId, xs, yId, ys),
      bad: logDensityGrid2D(group.bad, xId, xs, yId, ys),
    };
    const id = group.parameterIds[0];
    const coordinates = id === xId ? xs : ys;
    const good = createLogDensity(group.good), bad = createLogDensity(group.bad);
    const logL = coordinates.map((value) => good({ [id]: value }));
    const logG = coordinates.map((value) => bad({ [id]: value }));
    return {
      good: xs.map((_, i) => ys.map((_, j) => logL[id === xId ? i : j])),
      bad: xs.map((_, i) => ys.map((_, j) => logG[id === xId ? i : j])),
    };
  });
  return xs.map((_, i) => ys.map((_, j) => {
    let logL = 0, logG = 0;
    for (const group of groups) { logL += group.good[i][j]; logG += group.bad[i][j]; }
    return { "good-density": Math.exp(logL), "bad-density": Math.exp(logG), "log-ratio": logL - logG };
  }));
}
