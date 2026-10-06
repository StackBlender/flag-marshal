# Flag Marshal Agent Guide

Flag Marshal is a local-first feature-flag technical-debt analyzer. It finds stale,
dead, duplicated, and undocumented feature flags, reports the evidence behind each
finding, and enforces flag policy in CI.

This repository owns its build, tests, versioning, release, and roadmap.

## Before making changes

1. Read this file completely.
2. Read [`ROADMAP.md`](ROADMAP.md) — current state, the next slice, and the
   decisions already made. Its **Current state** table is the handoff.
3. Read [`docs/design.md`](docs/design.md) — product decision, architecture,
   monetization, and the validation gate.
4. Read [`docs/testing.md`](docs/testing.md) before changing tests or tooling.
5. Run `git status` and **preserve working-tree changes that are not yours**.
6. Run `npm run check` to establish a green baseline *before* editing.

Take the first unchecked milestone in `ROADMAP.md`. One slice at a time. Do not
batch milestones and do not skip ahead.

If the user's instruction conflicts with the roadmap, follow the user and record the
new direction in the roadmap before finishing.

## Portfolio boundary

Flag Marshal is **stream C** of several concurrent, repository-scoped streams. The
private `stackblender-operations` repository owns portfolio priority, cross-product
decisions, and the concurrent-stream rules. Do not edit other repositories from here.
Do not duplicate portfolio-level documents into this repository.

## Git ownership

Read-only Git commands are allowed for inspection at any time: `git status`,
`git diff`, `git log`, `git show`.

Never run a Git command that changes repository or working-tree state. The user
exclusively owns staging, commits, pushes, pulls, merges, rebases, branch and tag
changes, resets, checkouts, restores, cleaning, stashing, and publishing. Never run
`git add -A`, `git add .`, or `git commit -a`.

At the end of a slice, suggest one concise Conventional Commit message. Do not
create the commit.

**Author identity:** this repository commits as `StackBlender
<noreply@stackblender.invalid>`, matching the other StackBlender repositories. It is
already configured here. Set it *before* a repository's first commit — GitHub rejects
pushes that would publish a private email address (`GH007`), and fixing it afterward
requires rewriting the commit.

## Architecture boundaries

These are the rules that keep four frontends affordable. Both directions are
enforced by ESLint *and* by `test/architecture/boundaries.test.ts`, which is
authoritative because lint can be silenced with an inline disable comment.

- **`src/core/` is platform-free.** It must not import any frontend, editor API, or
  network module. It performs analysis and emits structured data.
- **`src/core/api/` is the only public surface.** Frontends import `core/api` and
  nothing deeper. Reaching into `core/detect`, `core/score`, or any other internal
  module is what makes frontends drift apart.
- **The core emits structured issues, never human-facing strings.** Wording comes
  from the message catalog so every frontend renders identical text. (Catalog lands
  in Milestone 1.)
- **Zero network calls in the core.** Analysis is entirely local: no
  source, flag keys, configuration, findings, or repository metadata leave the
  machine. `test/architecture/network-guard.test.ts` fails the build if a network
  client or global network API appears in `src/core/`.
- **Flag keys are confidential.** They leak unreleased product names. Never write
  them to logs, error messages, or telemetry of any kind.

## Analysis rules

- **Never guess.** Computed or non-literal flag keys are reported as unresolved, not
  resolved speculatively. False positives are what get static-analysis tools
  uninstalled.
- **Confidence is explicit.** Every finding carries `HIGH`, `MEDIUM`, `LOW`, or
  `UNKNOWN` and the evidence list that produced it.
- **Never claim a flag is safe to delete** below `HIGH` confidence, and never without
  showing the supporting evidence.

## What is not authorized

- **No tiers, licensing, or paid features.** Decided by the user on 2026-09-22:
  Flag Marshal is one free, standalone tool, and every capability runs on every
  installation. The entitlement seam was removed. Do not reintroduce a gate, a
  licence check, an activation flow, a payment processor, or billing
  configuration without an explicit user decision.
- **No dedicated CI product.** The GitHub Action was removed on 2026-09-22. `check`
  keeps its exit codes, so anyone can run it in their own pipeline, but building a
  CI integration, action, or hosted check requires an explicit user decision.
- **No hosted backend**, database, or background cloud processing.
- **No publishing.** Do not publish to npm, create releases, or create external
  accounts. The repository-root `package.json` stays `"private": true`; only the
  generated directory under `artifacts/npm/package` is publishable, and publishing
  it belongs to the user.
- **No provider API integrations** (LaunchDarkly, Unleash, and similar) without an
  explicit user decision. They are the only future network surface and are opt-in.

## Required validation

Run before reporting any slice complete:

```sh
npm run check     # format, lint, typecheck, tests
npm run build
```

See [`docs/testing.md`](docs/testing.md) for the layers and how to debug them.

## Definition of done (every slice)

1. Implement the smallest coherent outcome. One slice, not two.
2. Add or update proportionate automated tests.
3. Run the checks above and record the resulting counts.
4. Update the roadmap's **Current state** table, plus **Decisions already made** if
   you settled an architectural question.
5. Give concise manual verification steps and expected results.
6. Suggest one Conventional Commit message. Do not create the commit.

Do not mark planned, partially implemented, or unverified work complete. If a slice
is abandoned mid-way, record what exists, what does not, and what the next agent
needs to know.
