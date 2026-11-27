# Repository Guidelines

## Architecture & Invariants

- Browser-only React/TypeScript app built with Vite (`src/main.tsx`, `src/App.tsx`). Keep numerical logic in `src/model/` independent of React, DOM, cameras, and objective evaluators; follow [docs/tpe-model.md](docs/tpe-model.md) for model contracts.
- Preserve Vite's `/tpe-playground/` base path. Do not add runtime dependencies, external services, runtime network calls, or secrets (`VITE_*` variables are public).

## Checks & Conventions

- Node.js 22.12+ and npm (`npm ci` with locked `package-lock.json`).
- Run `npm run check` (`typecheck`, Vitest, and production `build` — matches CI **TPE checks**) before opening or merging a PR. Target a single test file with `npm test -- src/oneParamTpe.test.ts`.
- Colocate Vitest tests as `*.test.ts(x)` with fixed seeds for reproducibility. Manually verify browser interactions and visuals when changing UI or audio.
- Style: 2-space indent, double quotes, semicolons, PascalCase components, camelCase modules, `use*` hooks, explicit model-boundary types, type-only imports.
- Language: write issues, PRs, review comments, and repository docs in English; talk to the maintainer in their language.

## Git, PRs & Boundaries

- Follow the global `dev-harness` for delegation (`codex-task`, `codex-research`, `codex-consult`). Repo-specific skills live in `.agents/skills/` (symlinked from `.claude/skills/`): `/plan-issue` (for non-trivial work with design decisions or model-contract changes; small fixes can skip an issue) and `/review-pr`.
- Keep PRs focused (1 PR = 1 purpose) with concise, imperative commit and PR titles (no Conventional Commits prefixes); PRs are squash-merged so the PR title becomes the `main` commit subject.
- Follow [the PR template](.github/pull_request_template.md) (`Summary`, `Validation`, and optional `Notes` with `Closes #N` when linked to an issue; no unfilled placeholders). Attach screenshots via `gh pr create/edit/comment --attach` from outside the repo (e.g. `/tmp`); never commit screenshot files.
- **Never push directly to `main`** or change repository settings; all changes land through PRs with passing **TPE checks**.
- **Autonomous Lead merges:** once review passes, **TPE checks** are green, and the branch is up to date with `main`, the Lead may squash-merge directly (`gh pr merge <N> --squash --delete-branch`) without extra confirmation — unless the PR touches trust-boundary files or the maintainer asked to hold.
- **Trust boundaries:** do not modify `.github/`, `package.json` dependencies, or `package-lock.json` unless explicitly requested; review any changes carefully before merging ([docs/ci-security.md](docs/ci-security.md)).
