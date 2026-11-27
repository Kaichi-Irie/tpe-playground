---
name: review-pr
description: Review a PR against its scope or GitHub issue, verify TPE checks and behavior, fix or request changes, and autonomously squash-merge once ready. Use after opening a PR or when asked to review or merge a PR in this repository.
argument-hint: "<pr-number>"
---

# Review and merge a PR

## Steps

1. **Gather context:** inspect PR metadata (`gh pr view <N> --json title,body,headRefName,baseRefName,mergeable,mergeStateStatus,statusCheckRollup,closingIssuesReferences`), diff (`gh pr diff <N>`), comments, and any linked issue (`gh issue view <M> --comments`).
2. **Review:**
   - Check every acceptance criterion, scope / **Out of scope** boundaries, and any noted deviations.
   - Check PR metadata: imperative title (no Conventional Commits prefix), `Summary` and `Validation` filled in, and no leftover template placeholders (e.g. bare `Closes #`).
   - Check fit with `docs/tpe-model.md`, test quality (tests fail without the fix), and trust-boundary files from `docs/ci-security.md` (`.github/`, `package.json`, `package-lock.json`).
   - For non-trivial or subtle diffs, run an independent review via `codex-consult`.
3. **Verify:**
   - Wait for **TPE checks** to pass (never merge on pending or failing checks).
   - For UI, visual, or sound changes, run `npm run dev` and verify in the browser across relevant viewports and light/dark themes.
4. **Fix if needed:** apply fixes on the PR branch (via `codex-task` or directly for trivial edits), run `npm run check`, commit, and push; for external PRs, post actionable numbered feedback with `gh pr review <N> --comment`. Stop and ask the maintainer after three rounds without convergence.
5. **Merge autonomously when ready:**
   - Unless the PR touches unapproved trust-boundary files or the maintainer asked to hold:
     - If behind `main`, run `gh pr update-branch <N>` and wait for **TPE checks** again.
     - Ensure the PR title is a clean imperative subject (`gh pr edit <N> --title "..."` if needed).
     - Run `gh pr merge <N> --squash --delete-branch`, clean up any local worktree/branch, and confirm any linked issue closed.
   - Report the merged PR URL, checks verified, and any caveats concisely.
