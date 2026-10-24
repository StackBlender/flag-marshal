# CI formats, CI-aware defaults and recipes (2026-10-07)

- **`--format=github`** prints Actions workflow commands, so findings annotate a pull request with no code-scanning setup (SARIF upload needs GitHub Advanced Security on private repositories). **`--format=codequality`** writes GitLab Code Quality JSON whose fingerprints leave out the line, matching the baseline's identity.
- **A shallow clone now counts as no history.** Its pickaxe stops at the clone boundary, so ages were confidently wrong rather than missing. `scan`, `check` and `trend` warn on stderr with the fix. This changes behaviour for anyone scanning a default CI checkout.
- **`--changed-since=auto`** reads GitLab's merge base SHA, then `GITHUB_BASE_REF`, `CI_MERGE_REQUEST_TARGET_BRANCH_NAME`, `BITBUCKET_PR_DESTINATION_BRANCH`, `SYSTEM_PULLREQUEST_TARGETBRANCH`, names its choice on stderr, and is a usage error outside a pull request.
- **Recipes** in [docs/ci.md](../ci.md), checked by `test/docs/ci-recipes.test.ts`, which parses every YAML block and runs every command through the CLI. The recipes pin `@0.2`. Hosted runs: [GitHub, 2026-10-14](2026-10-14-github-ci-recipe-hosted.md).
