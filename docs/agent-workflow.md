# Agent workflow

Changes are planned by Claude, implemented by Codex, and reviewed and merged by
Claude with the maintainer's approval. The GitHub issue is the hand-off point
between them, and the PR is the hand-back.

```
maintainer request
  → Claude /plan-issue      issue: problem, decision, implementation plan, acceptance criteria
  → Claude /codex-handoff   scripts/codex-handoff.sh <issue> → Codex implements, opens PR
  → Claude /review-pr       review against the issue, CI, manual checks
      ├─ changes needed → review comment → scripts/codex-handoff.sh --pr <pr> → review again
      └─ ready → maintainer approves → squash merge, worktree cleanup
```

## Files

| File | Read by | Purpose |
| --- | --- | --- |
| [AGENTS.md](../AGENTS.md) | Codex, Claude | Repository conventions and Codex's implementation and feedback procedures |
| [CLAUDE.md](../CLAUDE.md) | Claude | Imports AGENTS.md and defines Claude's planner/reviewer role |
| [.claude/skills/](../.claude/skills/) | Claude | `/plan-issue`, `/codex-handoff`, `/review-pr` |
| [scripts/codex-handoff.sh](../scripts/codex-handoff.sh) | Claude, maintainer | Creates the worktree and runs `codex exec` |
| [.github/pull_request_template.md](../.github/pull_request_template.md) | Codex | PR body format |

## Running the handoff by hand

The script works without Claude:

```sh
scripts/codex-handoff.sh 7         # implement issue #7 and open a PR
scripts/codex-handoff.sh --pr 8    # address review feedback on PR #8
```

Requirements: `gh` signed in with `repo` scope, and the Codex CLI signed in.
Worktrees are created at `<main checkout>/.worktrees/codex-<issue>` from
`origin/main` (not the possibly stale local `main`) on the branch
`codex/issue-<issue>-<slug>`. Codex's final message is saved under
`.worktrees/logs/`. Both are git-ignored.

Codex uses `gpt-6.2-sol` by default. Set `CODEX_MODEL` to use another model for
one run, for example `CODEX_MODEL=gpt-6.1-sol scripts/codex-handoff.sh 7`.

## Codex sandbox

Codex runs with `codex exec --approve-for-me` in the `workspace-write` sandbox,
with network access enabled for `npm ci`, `git push`, and `gh`. The sandbox keeps
`.git` read-only, so `git commit` needs an escalation; `--approve-for-me` routes
escalations to Codex's automatic reviewer instead of a person. The worktree is the
only writable directory. Codex never merges: AGENTS.md forbids pushing to `main`
and merging, and main branch protection enforces the PR and **TPE checks**
requirements ([CI and Pages protection](ci-security.md)).

## Cleaning up

`/review-pr` removes the worktree after merging. For an abandoned attempt:

```sh
git worktree remove .worktrees/codex-<issue>
git branch -D codex/issue-<issue>-<slug>
```
