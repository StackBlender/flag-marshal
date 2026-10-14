# GitHub Actions recipe, run on hosted runners (2026-10-14)

Scratch repository: <https://github.com/StackBlender/flag-marshal-ci-check> (public,
every commit authored and committed as `StackBlender <noreply@stackblender.invalid>`).
Workflow: `.github/workflows/flag-marshal.yml`, the GitHub recipe from `docs/ci.md`
(checkout `fetch-depth: 0`, Node 22, `npx --yes @stackblender/flag-marshal@0.2 ...`,
resolving to the published 0.2.0). Policy on `main`: `requireOwner: true`; two flags
(`checkout-v2`, `dark-mode`) with owners. Cost: none (public repository).

| PR | Branch | Change vs `main` | Run | Result |
| --- | --- | --- | --- | --- |
| [#1](https://github.com/StackBlender/flag-marshal-ci-check/pull/1) | `clean` | README only | [38540812328](https://github.com/StackBlender/flag-marshal-ci-check/actions/runs/38540812328) | success, exit 0 |
| [#2](https://github.com/StackBlender/flag-marshal-ci-check/pull/2) | `violating` | adds `beta-banner`, no owner | [38540813752](https://github.com/StackBlender/flag-marshal-ci-check/actions/runs/38540813752) | failure, `check` exit code 2 |
| [#3](https://github.com/StackBlender/flag-marshal-ci-check/pull/3) | `resolved` | same flag, owner declared in `.flagmarshal.yml` | [38540814960](https://github.com/StackBlender/flag-marshal-ci-check/actions/runs/38540814960) | success, exit 0 |
| #2 again | `violating` | after the workflow fix below | [38541021883](https://github.com/StackBlender/flag-marshal-ci-check/actions/runs/38541021883) | failure, exit 2; summary step ran |

## Comparison base

All runs log `flag-marshal: comparing with origin/main (from GITHUB_BASE_REF)`; the
full-history checkout had the base, so no shallow-clone warning appeared.

## How the report renders

- **Annotations** (`--format=github`). Violating run: the check-run annotation API
  returns `failure  src/app.ts  line 14  "Flag beta-banner has no owner (confidence: high). Why: no owner is declared"`,
  14 being the line of the new `client.variation('beta-banner', ...)` call
  ([`violating.annotations.json`](violating.annotations.json)). The job log shows
  only the message, not the file and line:
  ```
  flag-marshal: comparing with origin/main (from GITHUB_BASE_REF)
  ##[error]Flag beta-banner has no owner (confidence: high). Why: no owner is declared
  ##[error]Process completed with exit code 2.
  ```
  Clean and resolved runs have no Flag Marshal annotation (only GitHub's own Node 20
  deprecation notices). Logs: [`clean.log`](clean.log), [`violating.log`](violating.log),
  [`resolved.log`](resolved.log), [`violating-rerun.log`](violating-rerun.log).
- **Job summary** (`scan --format=markdown >> $GITHUB_STEP_SUMMARY`). On the first
  violating run this step was **skipped**, because a failed step skips the following
  ones. Found and fixed: the recipe now has `if: ${{ !cancelled() }}`; in the rerun
  ([`violating-rerun.steps.txt`](violating-rerun.steps.txt)) the step succeeded.
  The summary's rendered page is not readable through the API, so its contents were
  not seen on GitHub; the local test covers the Markdown output.
- **PR comment**: none; the recipe does not post one (0 comments on PR #2).
- **Artifacts**: none; the recipe uploads none (`actions/runs/<id>/artifacts` returns
  0 for each run). There is nothing to download or parse. The SARIF upload variant
  was not run.

## Not covered

SARIF/code scanning upload; GitLab CI (out of scope for this task).
The `*.jobs.json` files are raw job metadata from `gh run view --json jobs`.
