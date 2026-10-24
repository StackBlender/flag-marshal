# Scan summary, debt ranking and helper coverage (2026-09-22)

Requested by the owner after the package passed a few hundred downloads: "add whatever you think is highest value".

- **`debtScore` was calculated and never shown.** Human and Markdown reports now open with a headline (older than a year, never read by code, read only by tests, unresolved keys) and the top flags by score with the evidence behind each rank (`src/present/summary.ts`). A flag whose only contribution is module spread is not ranked, and the ranking shows reasons, not flag-level confidence, which read as a contradiction beside a finding's own (`low` in the ranking, `medium` on the finding, same flag).
- **Declared helpers as plain functions.** The commonest TypeScript helper, an imported `isOn('checkout-v2')`, was never read. Declared names now match bare calls in all three languages; built-in SDK methods still need a receiver.
- **Helper pass-through.** Almost every wrapped codebase has one unresolved key inside its own helper, and one unresolved key caps every flag's confidence. A call whose key is a bare, never-assigned parameter of a declared helper is a pass-through; `'team-' + key` stays unresolved.
- **Attribution to the wrapped SDK.** Callers of a helper wrapping LaunchDarkly were labelled `custom`, which counts as locally configured, so "absent from configuration" fired on every flag. When every declared helper forwards to one SDK, its callers become that SDK's references.
