# Open-sourcing as a fresh repository (2026-09-22)

An audit before publishing the source found blockers: the customer pseudonyms "AcmeNav"/"AcmeCo" in 14 files (fixtures, tests, comments, docs), a flag key from a customer repository in `fixtures/real-world-shapes`, and the name in history. A rewrite of the old repository was not attempted: the owner created a new public repository, `StackBlender/flag-marshal`, from one copied tree, and retired the private repository and the public `flag-marshal-support` repository (created 2026-09-11 because the package's links pointed at a private 404).

- Folded in from the support repository, updated rather than copied: issue forms, a PR template, `SECURITY.md`, `SUPPORT.md`, a new `CONTRIBUTING.md` accepting code under MIT, `docs/cli.md`, `docs/privacy.md`, and `CHANGELOG.md`. Its claims about Team capabilities, proprietary source and the Action were dropped.
- Both link guards (`test/package/npm-artifact.test.ts`, `scripts/test-npm-package.mjs`) require the new repository and reject the retired one.
- Before the first commit one test fails by design: "collects real git evidence for its own repository" needs the fixtures in history.
