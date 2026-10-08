# Changelog

## Unreleased

- **New `--changed-since <ref>`** on `scan` and `check` reports what one change does
  to the flag inventory: flags added and removed, references gained or lost,
  findings introduced and resolved, and new computed keys. It compares the working
  tree with the merge base of `<ref>` and `HEAD`. `check --changed-since` fails
  only on policy violations the change introduces, with no baseline needed. JSON
  reports carry the comparison in a new optional `changes` field.

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
