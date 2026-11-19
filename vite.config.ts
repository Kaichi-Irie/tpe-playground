import { configDefaults, defineConfig } from "vitest/config";
export default defineConfig({
  base: "/tpe-playground/",
  // Agent worktrees are nested inside the main checkout; keep their tests out.
  test: { exclude: [...configDefaults.exclude, ".claude/worktrees/**", ".worktrees/**"] },
});
