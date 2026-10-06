# Fixture: mixed-polyglot

One flag key evaluated from two languages in two modules.

| Flag | References |
| --- | --- |
| `unified-billing` | `web/src/banner.ts` (TypeScript), `service/.../BillingService.java` (Java) |

This is the fixture that proves the index is keyed by flag, not by file or
language: a single `FlagRecord` must carry both references. It is also the case
that makes `module-spread` evidence meaningful in Milestone 5.
