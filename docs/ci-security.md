# CI and GitHub Pages protection

[The workflow](../.github/workflows/deploy.yml) validates ordinary `pull_request`
events on GitHub-hosted runners with `npm ci` and `npm run check`. Its required
check name is **TPE checks**. When changing a required check name, merge a
workflow that emits the new name first, then change branch protection, and only
then remove the old check. This avoids blocking unrelated PRs during rollout.
There are no path filters, so every PR receives this check.

The default `GITHUB_TOKEN` has only `contents: read`. Checkout does not persist
credentials. With this workflow unchanged, PRs neither upload a Pages artifact
nor run the deploy job. Only a
successful build from `push` or `workflow_dispatch` on `refs/heads/main` in
`Kaichi-Irie/tpe-playground` can upload the artifact and deploy. The deploy job
alone receives `pages: write` and `id-token: write`; it does not check out or run
application code. Vite already provides the `/tpe-playground/` base, so no
`configure-pages` step is needed. Pages must already use the GitHub Actions source.

New PR runs cancel superseded PR validation. Main runs finish their production
deployment even when another push arrives; newer runs wait rather than cancelling
an active deployment. Repository-name guards intentionally prevent deployment
from a copied repository until its publication configuration is reviewed.

## Trust boundaries and review

Required checks prevent accidental merges with failing or missing validation;
they do not prove that a contribution is safe. A PR can change the workflow,
check name, npm scripts, dependencies, or generated site and still report a
successful check from GitHub Actions. Review changes to `.github/`,
`package.json`, and `package-lock.json`, including install scripts and pinned
action code, before approving execution or merging. Review application changes
too: after merge they become trusted main code and public site content.

Workflow `if` guards are editable by a PR. The independent repository controls
are the fork token/secrets restrictions, main branch protection, and the Pages
environment's allowed branch policy. Fork restrictions do not apply to a
collaborator's same-repository branch; repository write access is a trusted role.
Do not add sensitive repository secrets for this browser-only app. A dependency
install can execute code in the build job, which is why deployment credentials
belong only to a separate job that never runs application code.

Direct actions are pinned to full commit SHAs with release comments. The Pages
upload action also pins its nested upload action. Verify release tags and nested
action references when updating pins. JavaScript actions use the Node 24 runtime;
the application still builds on Node.js 22. Pages artifact packaging excludes
dotfiles; check that assumption if the site starts requiring them.
[Dependabot](../.github/dependabot.yml)
checks Actions and npm dependencies weekly and groups related updates.

## Repository settings

These settings live in GitHub, outside the workflow. Apply them to a new public
repository as well; copying this source does not copy repository settings.

1. **Settings → Branches → main protection**: require a pull request, require
   **TPE checks** from GitHub Actions (app ID `15368`), require the branch to be
   up to date, and require conversation resolution. Set required approving reviews
   to **0** for solo maintenance. Disable force pushes and branch deletion.
   Enable **Do not allow bypassing the above settings** to enforce this for
   administrators too. Do not configure routine bypass actors. Reconsider one
   required approval when another maintainer joins.
   Strict up-to-date checks, conversation resolution, and administrator
   enforcement are deliberate choices here, not prerequisites for isolating PR
   permissions. Strict checks validate integration with the latest main but
   require updating other open PRs after each merge. Revisit this tradeoff if
   update churn becomes significant.
2. **Settings → Environments → github-pages**: choose selected deployment
   branches/tags, allow only the branch **main**, and allow no tags. Do not
   substitute “protected branches”, which could later include other branches.
3. **Settings → Pages**: set the source to **GitHub Actions**.
4. **Settings → Actions → General**: retain read-only default workflow token
   permissions and disable Actions approving PRs. Keep sending write tokens and
   secrets to fork PRs disabled. For public fork contributions, require approval
   for all external contributors (`all_external_contributors`) before their
   workflows run. Review code and
   workflow changes before approving execution. Use ordinary `pull_request`;
   do not run PR code through `pull_request_target`, privileged `workflow_run`,
   or self-hosted runners.

For emergency recovery, a repository administrator can temporarily edit the
specific main protection requirement in Settings → Branches (for example, fix a
mistyped check name). Record the reason in the incident/issue, restore the
requirement immediately after recovery, and verify it through the API. Normal
changes, including administrator changes, go through PRs and CI. There is no
permanent administrator bypass.

## Publication-specific settings

Keep fork workflows disabled during the private period. The public contributor
approval API is unavailable for private repositories. Immediately after
publication, set and read back `approval_policy: all_external_contributors` via
`repos/OWNER/REPO/actions/permissions/fork-pr-contributor-approval`, or use the
Actions settings above. Use the repository settings and [Actions history](https://github.com/Kaichi-Irie/tpe-playground/actions)
for current configuration and hosted run evidence; this operational guide alone
is not proof of the repository's current state.

## Verification and publication checklist

- Run `npm ci`, `npm run check`, and `actionlint` on the workflow.
- On a normal PR, verify **TPE checks** runs; inspect the job's token permissions
  and confirm artifact upload and deployment are skipped. Confirm a failing or
  missing required check blocks merging (including for administrators).
- On a non-main manual run, verify validation runs but artifact upload and deploy
  are skipped. On main, verify successful validation permits Pages deployment.
  Do not deploy an unmerged branch just to test this.
- For external fork PRs after publication, verify approval is required and no
  write token or repository secrets are supplied.
- If creating a new public repository, reapply every setting above, update both
  workflow repository guards to its exact owner/name, and coordinate the Vite base
  and URL with the publication plan. Keep `/tpe-playground/` for the current repo.
- Verify actual hosted run results in the [Actions history](https://github.com/Kaichi-Irie/tpe-playground/actions)
  and record remaining publication checks in a new public issue if needed.
  Local/static checks do not establish successful deployment or public fork behavior.
