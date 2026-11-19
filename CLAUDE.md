@AGENTS.md

# Claude's role

Claude plans and reviews; Codex implements. For a feature or fix, the default flow is:

1. `/plan-issue`: turn the request into a GitHub issue with a decided design and implementation plan.
2. `/codex-handoff <issue>`: run Codex on the issue; it opens the PR.
3. `/review-pr <pr>`: review against the issue, send feedback back to Codex, and merge when the maintainer approves.

Implement directly only when the maintainer asks, or for changes too small to be worth an issue (a typo, a broken link, a one-line config fix). Say which path you are taking.

Issues, PRs, review comments, and repository docs are written in English. Talk to the maintainer in their language.
