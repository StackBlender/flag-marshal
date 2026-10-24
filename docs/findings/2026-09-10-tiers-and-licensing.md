# Tiers, the entitlement seam and licensing (2026-09-10)

Superseded on 2026-09-22 by the owner: one free tool, no tiers, no licensing; the seam, every gate and the GitHub Action were removed. Kept as the record of the reasoning.

- **Entitlement seam (milestone 9).** `FREE`/`TEAM`/`UNKNOWN` with a pluggable provider; only `FreeEntitlementProvider` shipped, so **a shipped build could not run `check`, `trend`, SARIF or Markdown at all**, and the paid tier could not be demonstrated to anyone. There was deliberately no flag or environment variable to unlock it. `unknown` granted the Free set, never Team and never nothing; a provider that threw counted as `unknown`.
- **Three tiers.** Free: `scan`, all providers, JSON, Markdown, custom patterns. Team: `check`, baseline ratchet, `trend`, SARIF, the Action. Pro: provider API integrations, multi-repo rollup, migration tooling. Markdown and custom patterns moved into Free because they are how a developer forwards the number and how a homegrown-helper shop sees anything at all.
- **Never gate by provider.** Gating detection by flag platform was rejected: a team that cannot scan its own platform sees zero flags and uninstalls, nobody can use the extra providers since a team runs one, and provider support is a fixed cost, not variable value. The principle stands if gating ever returns.
- **Licensing, designed and never built:** Ed25519 offline signed keys verified with `node:crypto`, no server or telemetry; not copy protection; annual expiry because offline revocation is impossible.
- **The funnel did not exist.** The extension never mentioned `check`, the ratchet, trend or SARIF, so a developer saw "17 flags and 3 findings" and closed it.
