import { createServer } from "vite";
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const { runSearch, defaults, prior, trialLimit } = await server.ssrLoadModule("/src/tpe.ts");
const { objectivePresets, findObjectiveMinimum } = await server.ssrLoadModule("/src/objectives.ts");
for (const objectivePreset of Object.keys(objectivePresets)) {
  const minimum = findObjectiveMinimum(objectivePreset).y;
  const results = [];
  for (let seed = 0; seed < 64; seed++) {
    const config = { ...defaults, objectivePreset };
    const tpe = runSearch(seed, trialLimit, prior.weight, config).trials;
    const random = runSearch(seed, trialLimit, 0, { ...config, startupTrials: trialLimit }).trials;
    const tpeGap = Math.max(1e-12, Math.min(...tpe.map(t => t.y)) - minimum);
    const randomGap = Math.max(1e-12, Math.min(...random.map(t => t.y)) - minimum);
    results.push({ seed, tpeGap, randomGap, score: Math.abs(Math.log10(randomGap / tpeGap)) });
  }
  results.sort((a,b) => b.score - a.score || a.seed - b.seed);
  console.log(JSON.stringify({ objectivePreset, examples: results.slice(0,10) }));
}
await server.close();
