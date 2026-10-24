# Boundary guards, the contract and the fixtures (2026-09-10)

Milestones 0 and 1. All four boundary guards were verified to *fail* on deliberately introduced violations before being accepted: core importing a frontend, core importing `node:https`, core calling `fetch`, and a frontend importing `core/detect`. ESLint independently flagged the frontend violation. Three drift guards were verified the same way: a schema change with stale committed types, a fixture source edit with stale goldens, and a catalog entry removed for an id the schema still declares. The procedures are in [docs/testing.md](../testing.md).

- The contract is **one file** (`schema/v1/scan-report.schema.json`) using `$defs`, not several cross-referencing files. Cross-file `$ref` resolution would have to work identically in the TypeScript generator and the Kotlin generator; one file removes that risk.
- `ScanReport.unresolvedReferences` was added. Unresolved references belong to no `FlagRecord`, so without it the product's central credibility guarantee would be invisible in the payload rather than asserted.
- Goldens carry `root` as the fixture name rather than an absolute path, so they are byte-identical on every machine and CI runner.
- ajv runs with `allowUnionTypes` because `Evidence.detail` is deliberately a union of primitives.
- The goldens were written by hand before any engine existed, as the acceptance specification for milestones 2 to 6. Milestone 6 made the engine reproduce every one.
