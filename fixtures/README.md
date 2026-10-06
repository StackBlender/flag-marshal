# Fixture corpus

Small, deterministic repositories the analyzer runs against. Each one exists to
pin a specific behavior, and each is documented by its own `README.md`.

These directories are **sample code for the analyzer to read**, not part of this
project's compilation. They are excluded from `tsconfig`, ESLint, and Prettier on
purpose — a fixture must be free to contain code this project would never accept,
including imports of SDKs that are not installed here.

| Fixture | Pins |
| --- | --- |
| [`ts-launchdarkly`](ts-launchdarkly/) | TypeScript + LaunchDarkly; one key referenced from two files merges into one record |
| [`java-spring-conditional`](java-spring-conditional/) | Java + `@ConditionalOnProperty` + properties; a configured-but-unreferenced flag |
| [`kotlin-unleash`](kotlin-unleash/) | Kotlin + Unleash; a second provider needs no change to index, evidence, or scoring |
| [`mixed-polyglot`](mixed-polyglot/) | One key evaluated from two languages in two modules |
| [`no-flags`](no-flags/) | **The tool stays quiet.** Zero flags, zero findings |
| [`computed-keys`](computed-keys/) | **The tool never guesses.** Computed keys report as unresolved |

`no-flags` and `computed-keys` are the two that matter most. False positives and
confident nonsense are what get static-analysis tools uninstalled, and these are
the fixtures that fail when either creeps in.

## Goldens

Every fixture ships an `expected.json`: the `ScanReport` the analyzer must produce
for it. Goldens are the **cross-frontend conformance suite** — the CLI, VS Code,
and IntelliJ all assert against the same files, which is the only cheap mechanism
that catches three UIs drifting apart.

Goldens are built by `npm run build:goldens`, which computes exact line and column
positions from the fixture sources. The expectations themselves are hand-declared
in `scripts/build-goldens.mjs`: they are the specification, written before the
analyzer exists.

Conventions:

- A reference range covers the flag-key string literal **including its quotes**.
  For an unresolved reference the range covers the expression that could not be
  resolved.
- `root` is the fixture name, never an absolute path, so goldens are identical on
  every machine and CI runner.
- `findings` is empty at Milestone 1. Rule output is added by the milestone that
  implements each rule — M2 for `flag.unresolved-key`, M4 for the configuration
  rules, M5 for `flag.stale`. The inventory in `flags` is the Milestone 1 contract.

After changing a fixture source, run `npm run build:goldens`. A committed golden
that no longer matches its source fails `test/contract/generated.test.ts`.
