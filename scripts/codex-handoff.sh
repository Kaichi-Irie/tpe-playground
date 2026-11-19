#!/usr/bin/env bash
# Hand an issue (or review feedback on a PR) to Codex in its own worktree.
#
#   scripts/codex-handoff.sh <issue-number>          implement the issue and open a PR
#   scripts/codex-handoff.sh --pr <pr-number>        address review feedback on a PR
#
# Worktrees live in <main checkout>/.worktrees/codex-<issue>; Codex's final
# message is written to .worktrees/logs/. Codex uses gpt-6.2-sol unless
# CODEX_MODEL is set. See docs/agent-workflow.md.
set -euo pipefail

model="${CODEX_MODEL:-gpt-6.2-sol}"

usage() { sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

mode=implement
case "${1:-}" in
  --pr) mode=fix; number="${2:-}" ;;
  -h|--help|"") usage ;;
  *) number="$1" ;;
esac
[[ "$number" =~ ^[0-9]+$ ]] || usage

for cmd in git gh codex; do
  command -v "$cmd" >/dev/null || { echo "error: $cmd not found" >&2; exit 1; }
done

common_dir=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
root=$(dirname "$common_dir")
mkdir -p "$root/.worktrees/logs"
git -C "$root" fetch --quiet origin

if [[ $mode == implement ]]; then
  issue=$number
  title=$(gh issue view "$issue" --json title,state --jq 'select(.state=="OPEN") | .title')
  [[ -n "$title" ]] || { echo "error: issue #$issue is not open" >&2; exit 1; }
  slug=$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//' | cut -c1-40 | sed 's/-*$//')
  branch="codex/issue-$issue-$slug"
else
  pr=$number
  branch=$(gh pr view "$pr" --json headRefName,state --jq 'select(.state=="OPEN") | .headRefName')
  [[ -n "$branch" ]] || { echo "error: PR #$pr is not open" >&2; exit 1; }
  issue=$(printf '%s' "$branch" | sed -n 's|^codex/issue-\([0-9]*\)-.*|\1|p')
  [[ -n "$issue" ]] || issue="pr-$pr"
fi

wt="$root/.worktrees/codex-$issue"
if [[ -d "$wt" ]]; then
  echo "Reusing worktree $wt"
  if [[ $mode == fix ]]; then
    git -C "$wt" switch --quiet "$branch"
    git -C "$wt" pull --quiet --ff-only origin "$branch"
  fi
elif [[ $mode == implement ]]; then
  git -C "$root" worktree add --quiet -b "$branch" "$wt" origin/main
else
  git -C "$root" worktree add --quiet -B "$branch" "$wt" "origin/$branch"
  git -C "$wt" branch --quiet --set-upstream-to "origin/$branch"
fi

if [[ $mode == implement ]]; then
  prompt="Implement GitHub issue #$issue on branch $branch, following \"Implementing an issue\" in AGENTS.md. Open the pull request when npm run check passes."
else
  prompt="Address the review feedback on pull request #$pr (branch $branch), following \"Addressing review feedback\" in AGENTS.md."
fi

log="$root/.worktrees/logs/codex-$issue-$mode-$(date +%Y%m%d-%H%M%S).md"
echo "Codex ($model): $prompt"
echo "Worktree: $wt"
echo "Final message: $log"

# workspace-write keeps .git read-only; --approve-for-me lets Codex's automatic
# reviewer approve escalations such as git commit. Network is needed for
# npm ci, git push and gh.
codex exec \
  -C "$wt" \
  -m "$model" \
  --approve-for-me \
  -c sandbox_workspace_write.network_access=true \
  -o "$log" \
  "$prompt"

echo
echo "Codex finished. Final message: $log"
gh pr list --head "$branch" --state all --json number,url,state --jq '.[] | "PR #\(.number) \(.state) \(.url)"'
