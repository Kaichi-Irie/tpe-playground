import { defineConfig } from "vite";

// Separate local benchmark artifact; the deployed application's build is unchanged.
export default defineConfig({
  base: "/tpe-playground/",
  build: {
    outDir: "node_modules/.cache/tpe-browser-benchmark",
    rollupOptions: { input: "benchmarks/runner.html" },
  },
});
