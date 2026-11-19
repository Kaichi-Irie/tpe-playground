---
name: codex-handoff
description: Hand a planned GitHub issue to Codex to implement and open a PR, or send PR review feedback back to Codex. Use after /plan-issue, when the maintainer says "hand this to Codex" or "let Codex implement #N", or from /review-pr when changes are requested.
argument-hint: "<issue-number> | --pr <pr-number>"
---

# Hand off to Codex

`scripts/codex-handoff.sh` does the setup and runs `codex exec` non-interactively:

- `scripts/codex-handoff.sh <issue>` creates the worktree `<main checkout>/.worktrees/codex-<issue>` on a new branch `codex/issue-<issue>-<slug>` from `origin/main`. Codex implements the issue and opens the PR.
- `scripts/codex-handoff.sh --pr <pr>` reuses (or recreates) the PR's worktree. Codex addresses the review feedback and pushes to the same branch.

Codex follows the procedures in AGENTS.md and uses `gpt-6.2-sol` (the script's default; set `CODEX_MODEL` only when the maintainer asks for another model). It runs in the `workspace-write` sandbox with network access, and Codex's automatic reviewer approves escalations such as `git commit` (`--approve-for-me`).

## Steps

1. **Check that the issue is ready.** It must have **Decision**, **Implementation plan**, and **Acceptance criteria** sections. If it does not, run `/plan-issue <N>` first. For `--pr`, the review feedback must already be posted on the PR, since Codex reads it from GitHub.
2. **Run the script in the background** (`run_in_background: true`). Implementation takes several minutes to tens of minutes. Do not poll; you are notified when it exits. Tell the maintainer it started and where the worktree is.
3. **When it exits**, read the final-message file path printed by the script, and the PR line at the end of the output.
   - PR opened or updated: summarize Codex's report (PR link, check result, deviations) and continue with `/review-pr <pr>`, unless the maintainer said to stop here.
   - No PR and Codex commented on the issue with a question: relay the question. Answer it by updating the issue (`/plan-issue <N>`), then run the handoff again; the worktree is reused.
   - Non-zero exit or no final message: show the tail of the output and ask the maintainer how to proceed. Do not finish the implementation yourself unless they ask.
