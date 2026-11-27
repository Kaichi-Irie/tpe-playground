---
name: plan-issue
description: Turn a feature request or bug into a GitHub issue with a decided design, implementation plan, and acceptance criteria. Use when the maintainer asks for a non-trivial feature, fix, or change in this repository, or says "make an issue" or "plan this".
argument-hint: "[request or existing issue number]"
---

# Plan a GitHub issue

Use for non-trivial changes that benefit from a tracked contract before implementation. Size an issue so a single PR closes it.

## Steps

1. **Check context:** if an issue number is given, read `gh issue view <N> --comments` and refine it; otherwise check duplicates via `gh issue list --search "<keywords>" --state all`.
2. **Investigate:** read primary files, `docs/tpe-model.md` (for model changes), and existing tests; reproduce bugs where practical.
3. **Decide:** pick one design with a one-sentence rationale (ask the maintainer only for genuine product/scope trade-offs).
4. **Draft and confirm:** show the title (imperative) and body using the template below, then create (`gh issue create --title "..." --body-file <file>`) or update (`gh issue edit <N> --body-file <file>`) on approval.
5. **Next step:** offer to start implementation on a new branch.

## Issue format

```markdown
## Problem
What is wrong or missing, with reproduction steps for bugs.

## Decision
Chosen behavior and design (bullets, short rationale each).

## Implementation plan
1. `src/path/file.ts`: changes by function or component.

## Acceptance criteria
- [ ] Observable behavior that must hold.
- [ ] Tests: file and what each new test checks.
- [ ] `npm run check` passes.

## Out of scope
- Related changes not included in this PR.

## Notes
Optional: pitfalls, related issues/PRs, manual checks (viewports, light/dark theme, sound).
```
