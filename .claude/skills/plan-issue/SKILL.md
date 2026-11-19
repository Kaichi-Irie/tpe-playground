---
name: plan-issue
description: Turn a feature request or bug into a GitHub issue with a decided design and an implementation plan that Codex can execute. Use when the maintainer asks for a new feature, fix, or change in this repository, or says "make an issue" or "plan this".
argument-hint: "[request or existing issue number]"
---

# Plan an issue for Codex

The issue is the whole contract for Codex: it starts in a fresh worktree with only the issue and AGENTS.md. Anything not written in the issue will be guessed.

## Steps

1. **Understand the request.** If an issue number is given, read it with `gh issue view <N> --comments` and refine it instead of creating a new one. Search for duplicates with `gh issue list --search "<keywords>" --state all`.
2. **Investigate the code.** Read the files involved, the relevant docs (`docs/tpe-model.md` for model changes), and existing tests. Reproduce bugs where practical. Find the exact functions, components, and test files to change.
3. **Decide the design.** Choose one approach and give the reason in a sentence. Do not hand Codex a list of options. When the choice is genuinely the maintainer's (user-visible behavior, scope, trade-offs with no clear default), ask them before writing the issue.
4. **Draft the issue** in the format below. Keep it specific: file paths, function names, data shapes, edge cases, and test names. Leave out implementation details Codex can derive from the code itself.
5. **Show the draft** to the maintainer (title and body) and create it on their approval:
   `gh issue create --title "<imperative title>" --body-file <scratch file>`. For an existing issue, use `gh issue edit <N> --body-file <file>`.
6. **Offer the handoff:** ask whether to run `/codex-handoff <N>` now.

Size an issue so a single PR closes it. Split larger work into several issues and say in which order they go.

## Issue format

```markdown
## Problem

What is wrong or missing, from the visitor's or maintainer's point of view. Include reproduction steps for bugs.

## Decision

The chosen behavior and design, as bullet points with a short reason each.

## Implementation plan

1. `src/path/file.ts`: what changes, by function or component.
2. ...

## Acceptance criteria

- [ ] Observable behavior that must hold.
- [ ] Tests: which test file, and what each new test checks.
- [ ] `npm run check` passes.

## Out of scope

- Related changes that must not be made in this PR.

## Notes

Optional: pitfalls, related issues or PRs, manual verification steps (viewport sizes, light/dark theme, sound).
```

The title is imperative and describes the outcome, for example "Scope Lab hint 'seen' state to the tab and reset it on Start over".
