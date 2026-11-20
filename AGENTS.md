# Repository Guidelines

## Project Structure & Module Organization

TPE Playground is a browser-only React/TypeScript app built with Vite. `src/main.tsx` mounts the UI; `src/App.tsx` and neighboring components implement the explorers and Lab. Keep numerical logic in `src/model/`, independent of React, DOM, cameras, and objective evaluators. `src/tpe.ts` and `src/twoParamTpe.ts` adapt the shared engine for the UI; follow `docs/tpe-model.md` when changing model contracts.

Tests live beside source files, with regression fixtures in `src/model/fixtures/`. Bundled images and audio live in `src/assets/`; static files live in `public/`. Use `docs/` for technical notes, `design/` for design references, `scripts/` for utilities, and `benchmarks/` for performance tooling.

## Build, Test, and Development Commands

Use Node.js 22.12+ and npm with the committed `package-lock.json`.

- `npm ci`: install locked dependencies.
- `npm run dev`: start development at `http://127.0.0.1:5173/tpe-playground/`.
- `npm test`: run Vitest once; target a file with `npm test -- src/tpe.test.ts`.
- `npm run typecheck`: check strict TypeScript types.
- `npm run build`: type-check and create the production `dist/` output.
- `npm run preview`: serve the production build locally.
- `npm run check`: run type checking, tests, and build, matching CI.
- `npm run bench:model` / `npm run bench:browser`: run numerical benchmarks or serve the browser benchmark harness; follow `benchmarks/README.md`.

## Coding Style & Naming Conventions

Match existing two-space indentation, double-quoted strings, and semicolons. Use PascalCase component filenames, camelCase utility modules and functions, and `use` prefixes for hooks. Prefer explicit TypeScript types at model boundaries and type-only imports. No dedicated formatter or linter is configured; preserve surrounding style.

## Testing Guidelines

Name colocated Vitest tests `*.test.ts` or `*.test.tsx`. Cover numerical edge cases and reproducibility with fixed seeds. Component tests include server-rendered markup checks; manually verify browser interactions and visual changes. No coverage percentage is configured. Run `npm run check` before submitting.

## Commit & Pull Request Guidelines

Write concise, imperative commit subjects (for example "Add coach hints to TPE Lab controls"); do not use Conventional Commits prefixes. PRs are squash-merged, so the PR title becomes the commit subject on `main`. Fill in [the PR template](.github/pull_request_template.md): summary, deviations from the issue, validation, and `Closes #N`. Include screenshots for visual changes and benchmark evidence for performance claims. Attach screenshots to the PR with `gh pr create --attach`, `gh pr edit --attach`, or `gh pr comment --attach`. Keep the image files outside the repository (for example under `/tmp`); never commit them. CI runs **TPE checks** on PRs; pushes to `main` deploy to GitHub Pages.

## Security & Configuration

Preserve Vite’s `/tpe-playground/` base path. No backend credentials are needed; never put secrets in frontend code or `VITE_*` variables.

## Agent Workflow

Work flows issue → implementation → review ([details](docs/agent-workflow.md)):

1. **Claude plans.** It writes a GitHub issue with the problem, the decided design, an implementation plan, and acceptance criteria.
2. **Codex implements.** `scripts/codex-handoff.sh <issue>` starts Codex in its own worktree on `codex/issue-<N>-<slug>`, branched from `origin/main`. Codex implements the issue and opens the PR.
3. **Claude reviews and merges.** Review feedback goes back to Codex with `scripts/codex-handoff.sh --pr <N>`.

If you are Codex, the two sections below are your procedure.

### Implementing an issue

1. Read the issue with `gh issue view <N> --comments`. Its **Decision**, **Implementation plan**, and **Acceptance criteria** are the contract; later comments by the maintainer override the body.
2. Run `npm ci` if `node_modules/` is missing.
3. Implement the plan. Keep the change to the issue's scope: no unrelated refactors, renames, or formatting churn. Add or update the tests the issue asks for, plus tests for any behavior you change.
4. Run `npm run check`. Do not open a PR while it fails. Fix the cause; never skip or weaken tests to get a pass.
5. Commit with an imperative subject. Several commits are fine; they are squashed on merge.
6. Push with `git push -u origin HEAD` and open a ready-for-review PR with `gh pr create --base main`, using the PR template. The title is an imperative sentence (it becomes the squash commit subject). The body ends with `Closes #<N>`.
7. Finish with a short final message: the PR URL, the `npm run check` result, deviations from the plan, and anything left for manual verification.

When the plan turns out to be wrong or ambiguous, make the smallest choice consistent with the issue's **Decision** and record it under **Deviations** in the PR. When no reasonable choice exists (the plan conflicts with the code, or a decision changes user-visible behavior beyond the issue), do not guess: comment on the issue with the question and what you found, open no PR, and say so in your final message.

### Addressing review feedback

1. Read the feedback: `gh pr view <N> --comments` and `gh api repos/{owner}/{repo}/pulls/<N>/comments`. Address the latest review first.
2. Make the requested changes on the existing branch, run `npm run check`, commit, and push. Do not force-push or open a new PR.
3. Reply on the PR with one comment that lists what changed per point, and explain any point you did not change and why.
4. Finish with a short final message: what changed and the `npm run check` result.

### Boundaries for agents

- Never push to `main`, merge PRs, close issues, or change repository settings. Merging is the maintainer's decision, made in review.
- Do not change `.github/`, `package.json` dependencies, or `package-lock.json` unless the issue explicitly asks for it. See [CI and Pages protection](docs/ci-security.md) for why these are trust boundaries.
- Do not add new dependencies, external services, or network calls at runtime; the app runs entirely in the browser.
