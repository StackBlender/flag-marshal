# Changelog

## 0.2.0 — 2026-10-07

- **New CI formats:** `--format=github` prints GitHub Actions annotations, and
  `--format=codequality` writes GitLab's Code Quality report. Both work with
  `scan` and `check`, and with `--changed-since` carry only what the change
  introduced.
- **CI recipes** in `docs/ci.md`: GitHub Actions annotations, a job summary and
  SARIF upload; GitLab's Code Quality widget; and plain commands for anything
  else.
- **CI-aware defaults:** `--changed-since=auto` finds the pull request's base on
  GitHub, GitLab, Bitbucket and Azure Pipelines. A shallow clone, the default
  checkout in most CI, is now treated as having no history instead of reporting
  every flag as new, with a warning saying how to fetch it.
- Evidence now reads "no owner is declared" rather than `declared-owner: false`,
  and an expired flag says how far past its expiry it is rather than calling that
  its age.
- **Removed: the VS Code extension and `serve --stdio`.** Flag Marshal is now a
  command-line and CI tool only. `flag-marshal serve` is an unknown command and
  exits 1.
- **New `--changed-since <ref>`** on `scan` and `check` reports what one change does
  to the flag inventory: flags added and removed, references gained or lost,
  findings introduced and resolved, and new computed keys. It compares the working
  tree with the merge base of `<ref>` and `HEAD`. `check --changed-since` fails
  only on policy violations the change introduces, with no baseline needed. JSON
  reports carry the comparison in a new optional `changes` field.
- **New `preview <key> --on|--off`** shows the diff that resolves one flag to a
  fixed value, and writes nothing; `--format=diff` pipes into `git apply`. It
  covers TypeScript and JavaScript reads that are the whole condition of an `if`
  or a `?:`, directly or through a `const` used only that way, and refuses
  anything it cannot rewrite exactly, naming each place.
  A refusal exits 3.

## 0.1.3 — 2026-09-22

Flag Marshal is now free and open source under the MIT License. Every capability
runs on every installation; there are no tiers or licence keys.

- **Now free:** `check` with the baseline ratchet, `trend`, and SARIF output, which
  previously required a paid tier. The GitHub Action was removed; `check` exits 2 on
  a new violation, so it runs in any pipeline or hook.
- **New `init` command** writes a starter `.flagmarshal.yml`, declaring any helper it
  finds, with the policy options commented out. It never overwrites.
- **Reports lead with the debt.** The terminal and Markdown reports open with a
  summary and the flags most worth reviewing, each with the evidence behind its rank.
- **Custom helpers:** a declared name now matches plain calls (`isOn("k")`) as well
  as member calls. The SDK call inside a declared helper is no longer reported as
  unresolved, and helpers that forward to one SDK are attributed to it.
- **Helper suggestions:** an unresolved key passed straight through a function names
  that function, with the configuration to paste.
- **Spring:** `@ConditionalOnProperty(prefix = ..., name = ...)` is read as
  `prefix.name`, as Spring does.
- **VS Code:** flags are listed by debt, with the reasons on hover and a toggle for
  name order.
- Markdown no longer reports "No feature flags found" for a repository whose only
  flag call is unresolved.
- The source, documentation, and issue tracker moved to one public repository.

## 0.1.2 — 2026-09-11

- Package links point to a public support repository.

## 0.1.1 — 2026-09-10

- Customer-facing package contents and listing.

## 0.1.0 — 2026-09-10

- First release. Superseded by 0.1.1 the same day.
