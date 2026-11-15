import { fitTpe } from "../src/model/engine";
import { createFieldEvaluator, evaluateFieldGrid2D } from "../src/model/visualization";
import { config2D, generateTrials2D, observations2D, problem2D } from "../src/tpe2d";

// This Node-only entry needs just runtime metadata, not the full Node API types.
declare const process: { version: string; platform: string; arch: string };

const axis = Array.from({ length: 31 }, (_, i) => -5 + i / 3);
const trials = generateTrials2D(42, 200);
console.log({ node: process.version, platform: process.platform, arch: process.arch, seed: 42, observations: 200, bandwidth: 0.65, grid: "31×31" });
for (const mode of ["multivariate", "univariate"] as const) {
  const model = fitTpe(problem2D, observations2D(trials), config2D(mode));
  const evaluate = createFieldEvaluator(model, { axes: ["x1", "x2"], projection: { kind: "full" } });
  const operations = [
    () => axis.map((x1) => axis.map((x2) => evaluate({ x1, x2 }))),
    () => evaluateFieldGrid2D(model, "x1", axis, "x2", axis),
  ];
  const times: number[][] = [[], []];
  for (let i = 0; i < 40; i++) for (const index of i % 2 ? [1, 0] : [0, 1]) {
    const start = performance.now();
    operations[index]();
    if (i >= 10) times[index].push(performance.now() - start);
  }
  const medians = times.map((values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]);
  console.log({ mode, pointEvaluationMs: medians[0], sharedGridMs: medians[1], speedup: medians[0] / medians[1] });
}
