# Reporting, SARIF and trend (2026-09-10)

Milestone 8. Trend verified end to end against a real git repository with three dated baseline commits, reporting `down 4 since the first recorded baseline`. Probes: 0-based SARIF positions fail 1 test, reading trend history newest-first fails 4, reusing an instance title as a rule descriptor fails 2.

- **Trend needs no database, and never will.** The committed baseline's own `git log` is the record; `readTrend` is `git log` plus `git show`.
- **SARIF positions are converted at the frontend edge** (SARIF is 1-based, the contract 0-based); getting it wrong puts every annotation on the wrong line.
- **The catalog gained a placeholder-free `rule` summary.** Reusing the instance title shipped a literal `{count}` into a code-scanning UI; a contract test forbids placeholders in `rule` text.
- **Markdown folds its detail** behind `<details>`: a comment that dumps two hundred rows gets the bot muted.
- **Markdown and SARIF from `check` carry only the introduced violations.**
- The GitHub Action built here was removed on 2026-09-22 ([tiers and licensing](2026-09-10-tiers-and-licensing.md)); CI support returned as recipes on 2026-10-07 ([CI support](2026-10-07-ci-support.md)).
