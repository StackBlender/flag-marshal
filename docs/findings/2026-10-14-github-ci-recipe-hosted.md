# The GitHub recipe on hosted runners (2026-10-14)

The [docs/ci.md](../ci.md) GitHub recipe ran on hosted runners in the public scratch repository `StackBlender/flag-marshal-ci-check` with the published `@stackblender/flag-marshal@0.2`: clean PR exit 0; violating PR exit 2 with an annotation on `src/app.ts` line 14; resolved PR exit 0; base `origin/main` from `GITHUB_BASE_REF`.

The job-summary step was skipped when `check` failed; it now has `if: ${{ !cancelled() }}`. The recipe uploads no artifacts and posts no PR comment. The recipes must run from the repository root, because `.flagmarshal.yml` is read from the working directory; `test/docs/ci-recipes.test.ts` runs the recipe commands in a local clone of a local origin. Not run on hosted runners: GitLab CI and the SARIF upload.

Evidence, with run links and logs: [docs/evidence/ci-github-2026-10-14/](../evidence/ci-github-2026-10-14/README.md).
