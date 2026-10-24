# Policy engine, baseline and ratchet (2026-09-10)

Milestone 7. Verified end to end against a real git repository: the first run reports existing debt and exits 2; `--update-baseline` accepts it; the next run exits 0; adding one unowned flag exits 2 naming only that flag; declaring its owner and expiry exits 0; paying down older debt is reported as such. Probes: ignoring the baseline fails 4 tests, ignoring the allowlist fails 2, putting file position into the violation identity fails 2, enforcing a drift finding fails 1.

- **`check` enforces policy findings only.** Missing owners, expiries and the budget are facts; `flag.stale` and `flag.absent-from-code` are inferences, and failing a build on an inference loses a team's trust in one afternoon.
- **Policy findings are always `high` confidence.**
- **Violation identity excludes file position**, so a refactor does not churn the baseline.
- **Inline directives name their flag explicitly** (`// flag-marshal: checkout-v2 owner=team-x expiry=2026-12-01`) rather than binding by proximity; only the text after `flag-marshal:` is read, so any comment syntax works. **The manifest wins** on conflict.
- **The allowlist is load-bearing**: kill switches and licensing gates live forever, and allowlisted flags are excluded from the budget.
- **Baselines are read and written by the frontend**, never the core. A malformed baseline is treated as absent.
- **The first run has no baseline and says so**, pointing at `--update-baseline`.
- A rendering bug: `renderScan` returned "No feature flags found." whenever there were no flags, swallowing findings with no flag key, such as a budget breach. A report with findings now always renders them.
