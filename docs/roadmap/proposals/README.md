# Flag Marshal proposals

Ideas written up for the owner's decision, newest first. State: open, accepted (moved into a plan) or rejected (with the reason).

- 2026-09-22 [Single-pass git evidence](2026-09-22-single-pass-git-evidence.md): open. One streamed `git log -p` pass with pickaxe semantics for every key, if a repository shows the per-key cost.
- 2026-09-22 Provider state export files: accepted for Unleash (owner-approved merge, 2026-10-14). A local export read as provider state; LaunchDarkly exports remain an idea.
- 2026-09-22 Free `check` as a report-only preview: rejected (2026-09-22). Moot: `check` is free for everyone.
- 2026-09-11 Licensing paths (demo from a local build, an evaluation mode, real signed keys): rejected (owner, 2026-09-22). There are no tiers.
- 2026-09-11 Marketplace listing of the VS Code extension (M12) and an IntelliJ plugin (M13): rejected (owner, 2026-10-07). No editor frontends.
- 2026-09-10 [Standalone per-platform binary](2026-09-10-standalone-binary.md): open. Waits for a CI image without Node to matter.
- 2026-09-10 Gate detection by flag provider: rejected (2026-09-10). It shows a team zero flags for its own platform; see [the finding](../../findings/2026-09-10-tiers-and-licensing.md).
