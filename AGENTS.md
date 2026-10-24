# Flag Marshal Agent Guide

Flag Marshal is a local-first feature-flag technical-debt analyzer. It finds stale,
dead, duplicated, and undocumented feature flags, reports the evidence behind each
finding, and enforces flag policy in CI.

This repository owns its build, tests, versioning, release, and roadmap.

## Before making changes

1. Read this file completely.
2. Read [`ROADMAP.md`](ROADMAP.md): the next slices, the decisions already made,
   and the known debt. It is a plan, not a status board; work state lives in Odin
   and git.
3. Read [`docs/design.md`](docs/design.md) — the case, architecture, evidence
   and confidence rules, governance, and privacy.
4. Read [`docs/testing.md`](docs/testing.md) before changing tests or tooling.
5. Run `git status` and **preserve working-tree changes that are not yours**.
6. Run `npm run check` to establish a green baseline *before* editing.

Take the first item in the roadmap's **Next** unless the owner says otherwise. One
slice at a time; do not batch slices.

If the user's instruction conflicts with the roadmap, follow the user and record the
new direction in the roadmap before finishing.

## Portfolio boundary

Flag Marshal is **stream C** of several concurrent, repository-scoped streams. The
private `stackblender-operations` repository owns portfolio priority, cross-product
decisions, and the concurrent-stream rules. Do not edit other repositories from here.
Do not duplicate portfolio-level documents into this repository.

Coordinate through Odin: when blocked on the owner, raise `status_blocker` with the
question (never a push notification); message another agent with `msg_send`; send a
request to another repository's owner with `directory_find`, then `queue_submit`.

## Git ownership

These rules follow "Git ownership" in `stackblender-operations/AGENTS.md`.
Read-only Git commands are allowed for inspection at any time: `git status`,
`git diff`, `git log`, `git show`.

Agents commit and push their own slices without asking (owner, 2026-10-24):
- Commit as the repo-local identity `StackBlender <noreply@stackblender.invalid>`; no `Co-Authored-By` trailers or other AI attribution.
- Stage explicit paths only: never `git add -A`, `git add .` or `git commit -a`. Never stage, revert or commit changes that are not yours.
- Never rewrite published history (no force-push, no rebasing pushed commits) and never delete branches or tags without the owner.

Use one concise Conventional Commit message per slice, and push it: a slice is not finished until it is on the remote. Releases, publishing (npm, marketplaces) and production deployments stay with the owner.

**Author identity:** this repository commits as `StackBlender
<noreply@stackblender.invalid>`, matching the other StackBlender repositories. It is
already configured here. Set it *before* a repository's first commit — GitHub rejects
pushes that would publish a private email address (`GH007`), and fixing it afterward
requires rewriting the commit.

## Architecture boundaries

Flag Marshal is a command-line and CI tool. These rules keep the analysis testable
and its JSON output a stable contract other tools can build on. Both directions are
enforced by ESLint *and* by `test/architecture/boundaries.test.ts`, which is
authoritative because lint can be silenced with an inline disable comment.

- **`src/core/` is platform-free.** It must not import any frontend, editor API, or
  network module. It performs analysis and emits structured data.
- **`src/core/api/` is the only public surface.** Frontends import `core/api` and
  nothing deeper. Reaching into `core/detect`, `core/score`, or any other internal
  module is what makes frontends drift apart.
- **The core emits structured issues, never human-facing strings.** Wording comes
  from the message catalog so every frontend renders identical text.
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
  installation. Do not introduce a gate, a
  licence check, an activation flow, a payment processor, or billing
  configuration without an explicit user decision.
- **No editor frontends.** Decided by the user on 2026-10-07: no VS Code
  extension, editor server, or IntelliJ plugin. Do not add an editor integration, language server, or
  editor API import without an explicit user decision.
- **CLI and CI are the focus** (user, 2026-10-07). Making `flag-marshal` work well
  in pipelines (output files, CI annotations, CI-aware defaults, documented
  recipes for CI systems) is authorized. Publishing anything to a marketplace,
  creating accounts, or any hosted check stays the user's.
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
3. Run the checks above.
4. Update the roadmap: remove the landed slice from Next, record decisions, known
   debt and findings.
5. Give concise manual verification steps and expected results.
6. Commit the slice with one Conventional Commit message, and push.

If a slice is abandoned mid-way, leave it in **Next** and record what the next agent
needs to know as known debt or a finding, not as a status note.
