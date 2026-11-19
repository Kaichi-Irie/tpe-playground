---
name: review-pr
description: Review a Codex-authored PR against its GitHub issue, send feedback back to Codex, and squash-merge it once the maintainer approves. Use after /codex-handoff, or when the maintainer asks to review or merge a PR in this repository.
argument-hint: "<pr-number>"
---

# Review and merge a PR

## Steps

1. **Gather context.**
   - `gh pr view <N> --json title,body,headRefName,baseRefName,mergeable,mergeStateStatus,statusCheckRollup,closingIssuesReferences`
   - The linked issue (`Closes #M`): `gh issue view <M> --comments`.
   - The diff: `gh pr diff <N>`.
   - Prior review rounds: `gh pr view <N> --comments`.
2. **Check against the issue.** Go through every acceptance criterion and mark it met, unmet, or unverifiable. Check that the change stays within the issue's scope and **Out of scope** list, and that each item under **Deviations** in the PR is justified.
3. **Review the code.** Invoke the `code-review` skill on the PR at `high` effort. Add your own review of what that pass does not cover: fit with existing architecture (`docs/tpe-model.md`), test quality (do the tests fail without the change?), and the trust-boundary files from `docs/ci-security.md` (`.github/`, `package.json`, `package-lock.json`).
4. **Verify behavior.**
   - CI: **TPE checks** must pass. If it is still running, wait for it; do not merge on a pending check.
   - For UI, visual, or sound changes, run the app from the PR worktree (`<main checkout>/.worktrees/codex-<issue>`, after `npm ci` if needed) with the `run` skill or the browser pane. Check the viewports and themes named in the issue.
5. **Decide.**
   - **Changes needed:** post one review comment with numbered, actionable points (file, line, what to change, why): `gh pr review <N> --comment --body-file <file>`. Then run `/codex-handoff --pr <N>`, and review again from step 1 when it finishes. Fix trivial points (a typo, a comment) yourself only if the maintainer prefers; say so in the comment.
   - **Ready:** report to the maintainer: the acceptance criteria results, what you verified and how, and anything that is unverified. Ask for the go-ahead to merge. Do not merge without an explicit yes in this conversation.
6. **Merge** on approval:
   - If the branch is behind `main` (the branch protection requires it to be up to date), run `gh pr update-branch <N>` and wait for CI again.
   - `gh pr merge <N> --squash --delete-branch`. The PR title becomes the commit subject; fix the title first with `gh pr edit` if it is not a good imperative subject.
   - Clean up: `git worktree remove <main checkout>/.worktrees/codex-<issue>` and `git -C <main checkout> branch -D <branch>` if still present.
   - Confirm the issue was closed by the merge (`gh issue view <M> --json state`).

After three review rounds without convergence, stop and ask the maintainer whether to rescope the issue, take over the implementation, or close the PR.
