# Testing Flag Marshal

## The one command

```sh
npm run check
```

Runs format check, lint, typecheck, and the test suite in that order — the same
sequence CI runs. Run it before editing to establish a baseline, and again before
reporting a slice complete.

```sh
npm run build     # also required before reporting a slice complete
```

## Layers

| Layer | Command | What it protects |
| --- | --- | --- |
| Format | `npm run format:check` | Consistent style. `npm run format` fixes. Markdown is excluded — docs are hand-wrapped prose. |
| Lint | `npm run lint` | Correctness rules plus fast feedback on architecture boundaries. |
| Types | `npm run typecheck` | Strict TypeScript across `src/`, `test/`, and config files. |
| Tests | `npm test` | Behavior, architecture boundaries, the local-only guarantee, and the wire contract. |
| Build | `npm run build` | Cleans and emits `dist/` from `src/`, then strips comments and minifies per file. `build:fast` skips minification. |
| Generate | `npm run generate` | Regenerates committed types and goldens. Not part of `check` — the tests verify the committed output instead. |
| Package | `npm run package:npm` | Runs the full check, installs and executes the assembled package, then writes the publishable tarball under `artifacts/npm/`. |

`npm run test:watch` for iterating.

## Architecture tests

Two suites under `test/architecture/` enforce the design rather than any single
feature. They scan source text, so they cannot be silenced by an inline lint disable.

**`boundaries.test.ts`**

- `src/core/` never imports a frontend.
- `src/core/` never imports an editor or platform API.
- Frontends import `core/api` only, never core internals.

**`network-guard.test.ts`**

- `src/core/` imports no network module (`node:https`, `undici`, `axios`, …).
- `src/core/` calls no global network API (`fetch`, `WebSocket`, …).

ESLint enforces the same boundaries for fast feedback. The tests are
authoritative; if the two ever disagree, fix the lint config to match the tests.

### Verifying the guards still bite

A guard test that cannot fail is worthless. To confirm, temporarily add a violating
file and check that the expected test fails:

```sh
mkdir -p src/core/detect
printf "import { request } from 'node:https';\nexport const p = request;\n" > src/core/detect/_probe.ts
npx vitest run test/architecture      # expect: 'core imports no network module' fails
rm -rf src/core/detect
```

All four guards were verified failing on real violations at Milestone 0.

## Contract tests

`schema/v1/scan-report.schema.json` is the source of truth for the wire contract.
Three committed artifacts derive from it, and each has a test that fails when it
drifts:

| Artifact | Built by | Guarded by |
| --- | --- | --- |
| `src/core/api/generated/scan-report.ts` | `npm run generate:types` | `test/contract/generated.test.ts` |
| `fixtures/*/expected.json` | `npm run build:goldens` | `test/contract/generated.test.ts` |
| `catalog/messages.json` | hand-written | `test/contract/schema.test.ts` |

`test/contract/schema.test.ts` also checks that the schema compiles under ajv in
strict mode, that every `$ref` resolves, that no `$def` is unreachable, that the
catalog and the `FindingId` enum agree **in both directions**, that every
placeholder a title uses is declared, and that no canned message ever promises a
flag is safe to delete.

`test/contract/goldens.test.ts` validates every golden against the schema and
asserts the guarantees each fixture exists to pin — `no-flags` reports nothing,
`computed-keys` resolves only its one literal, `mixed-polyglot` merges one key
across two languages.

### Verifying the drift guards still bite

```sh
# 1. Types go stale when the schema changes
#    -> 'committed TypeScript models match the schema' fails
# 2. Goldens go stale when a fixture source shifts
#    -> 'committed goldens match the fixture sources' fails
# 3. Catalog loses an entry the schema declares
#    -> 'has an entry for every finding id in the schema' fails
```

All three were verified failing on real drift at Milestone 1, alongside the four
boundary guards from Milestone 0. If you change any of these mechanisms, re-run
the probes rather than trusting that they still work.

## Detection tests

`test/core/` covers the analysis engine.

| Suite | Pins |
| --- | --- |
| `scan-source.test.ts` | Call-site detection, the typed `*Variation` helpers, test-file classification, deterministic ordering, and the never-guess rule |
| `positions.test.ts` | Ranges are UTF-16 code units, verified against multi-byte and surrogate-pair input |
| `golden-conformance.test.ts` | The engine reproduces the committed goldens exactly |
| `walk.test.ts` | Directory walking, skip lists, `.gitignore` scoping, symlink refusal, unreadable paths |
| `config.test.ts` | Properties, YAML, and `.env` parsing, and the two-signal flag heuristic |
| `rules.test.ts` | The five rules, provider traits, and every confidence-capping path |
| `evidence-score.test.ts` | Evidence collection against a fake git history, the debt score, and every confidence tier |
| `languages.test.ts` | Java, Kotlin, OpenFeature, Spring annotations, and cross-language merging |
| `queries.test.ts` | Every adapter query compiles against every grammar |
| `settings.test.ts` | `.flagmarshal.yml` parsing, including malformed input |
| `detector-credibility.test.ts` | The defects real repositories exposed: annotation arrays, provider identity, constants, Togglz discovery |
| `policy.test.ts` | Policy evaluation, the allowlist, violation identity, the ratchet, inline directives |
| `trend.test.ts` | Debt history reconstructed from baseline revisions, including malformed points |
| `compare.test.ts` | `--changed-since` identities: flags by key, findings by rule and flag, unresolved references by file, provider and expression, all counted as multisets |

`golden-conformance.test.ts` is the important one: it is where the goldens stop
being a specification and become a regression test. It covers only the TypeScript
fixtures, because Java, Kotlin, and configuration sources are not wired until
Milestones 4 and 6. `mixed-polyglot` asserts the gap explicitly — the golden
carries two languages, detection currently supplies one — rather than weakening
the golden to match today's code.

### Verifying the never-guess guard still bites

The product's credibility rests on computed keys being reported, not inferred.
Two probes confirm the tests enforce it:

```sh
# A. Make extractKey return node.text as the key instead of null
#    -> 5 tests fail, including golden conformance
# B. Make a template literal with ${interpolation} resolve as a literal
#    -> 'refuses to resolve a template literal with interpolation' fails
```

Both were verified at Milestone 2. A probe that changes nothing proves nothing —
the first attempt at probe A guessed from a quoted substring, which the fixtures
do not contain, so it passed and had to be rewritten.

### Verifying the rule guards still bite

```sh
# C. Remove 'launchdarkly' from REMOTELY_SERVED in provider-traits.ts
#    -> 2 tests fail; every remote flag would be reported as unconfigured
# D. Make isFlagNamespace accept any namespace
#    -> 2 tests fail; ordinary boolean settings become feature flags
# E. Make isFlagEnvName accept any variable name
#    -> 1 test fails; DEBUG and CI become feature flags
```

### Parse, do not match

Three separate features shipped with regular expressions where they needed a
parser — provider identity, Togglz discovery, and constant resolution — and each
produced a High-severity defect found only by running against real code. If the
question is *what does this code declare*, use a tree-sitter query. Source text
cannot tell a declaration from a comment, a string, or a reassignment.

### Verifying the credibility guards still bite

These cover the defects found by running against real Spring repositories rather
than fixtures. They matter more than the rest, because they are the only ones a
user would notice on first run.

```sh
# V. Remove the provider-identity gate in scanWith
#    -> 4 tests fail; Lombok setters and app helpers become feature flags again
# W. Make expandKeyNodes return the node unchanged
#    -> 4 tests fail; @ConditionalOnProperty(name = ["k"]) becomes a computed key
```

Config promotion is pinned by process tests rather than a probe: scanning
`fixtures/real-world-shapes` must inventory `acmeco.allow-override-user-expiration`
as configured while never admitting `spring.jpa.show-sql`.

**Inline test snippets need a realistic SDK import *and* a bound client.** A bare
`client.variation(...)` is correctly detected as nothing, and so is a call whose
receiver the file never binds to the SDK. A snippet missing either silently asserts
nothing at all — several tests in this repository did exactly that until the
receiver rule landed and exposed them.

### Verifying the language guards still bite

```sh
# I. Drop the Kotlin $-template check in extract-key.ts
#    -> 2 tests fail; "prefix-$name" would be reported as a literal flag key
# J. Put '.java' back in UNPARSED_EXTENSIONS
#    -> 1 test fails; a parsed language would cap confidence for no reason
# K. Change a node name in the Java query to something nonexistent
#    -> 4 tests fail, one per provider that targets Java
```

Probe K is the reason `queries.test.ts` exists at all. `scanWith` deliberately
**skips** an adapter whose query fails to compile, so a bug here costs a user
nothing at scan time — but that safety net would also hide the bug forever. The
suite compiles every query against every grammar so breakage fails CI instead.

### Verifying the scoring guards still bite

```sh
# F. Count age and dormancy as two separate signals in countSignals
#    -> 3 tests fail; single-signal flags would be promoted to medium
# G. Remove the partial-coverage cap in confidenceFor
#    -> 2 tests fail; a half-read repository could produce high confidence
# H. Record absent-from-configuration for remote providers too
#    -> 1 test fails; every LaunchDarkly flag gains a phantom staleness signal
```

Probe Y also originally **passed**, because a second guard rejected the input
before the rule under test ran — the test was protected by defence in depth rather
than by the thing it claimed to check. Rewritten to isolate the rule, it fails
correctly.

Probe F also originally **no-opped**: Prettier had reformatted the block, so the
replacement string never matched and the suite passed for the wrong reason. Probes
now assert that they applied before drawing any conclusion. Two probes in this
project have now failed to prove anything on the first attempt — assume a passing
probe is broken until you have seen it fail.

Probe D originally **passed**, which exposed a gap in the tests rather than
safety in the code: every non-flag property in the fixtures happened to have a
non-boolean value, so the boolean check alone was carrying them. Cases using real
boolean Spring settings (`spring.jpa.show-sql=true`) were added, and the probe
then failed as it should.

## Frontend tests

`test/frontends/` covers the CLI and its rendering.

`formats.test.ts` covers SARIF and Markdown, including the 1-based position
conversion SARIF requires and pipe escaping in Markdown tables.

`render.test.ts` asserts that **no catalog placeholder ever reaches a user
unsubstituted** — a literal `{count}` on screen is the visible symptom of a
message and its evidence drifting apart. It also fails when a new finding id is
added to the catalog without a rendering case, so the gap cannot ship quietly.

### Changes since a ref

`changed-since.test.ts` drives `scan` and `check` with `--changed-since` against an
in-memory snapshot: every output format, the schema validity of `changes`, exit 2
only for a violation the change introduced, and the usage errors.
`node-git-snapshot.test.ts` builds real temporary repositories to check the git
side: the merge base rather than the ref's tip, a subdirectory root, symbolic
links, 50 concurrent reads including a large multi-byte file through one
`git cat-file --batch`, refused refs, and uncommitted edits counting as the change.

The cheapest end-to-end check is comparing a repository with itself: `scan
--changed-since HEAD` on a clean checkout must report no changes. On 2026-10-07
togglz, unleash and spring-boot from the corpus all did, and the comparison cost
about one extra scan (togglz 2.6s -> 4.9s, unleash 5.5s -> 10.0s) with no rise in
peak memory.

```sh
# S. Compare against the ref's tip instead of the merge base in node-git-snapshot.ts
#    -> 1 test fails; a branch would be credited with removing main's new flags
# T. Compare findings as a set rather than a multiset in compare.ts
#    -> 1 test fails; a second computed key in a file would not be reported
```

### Refactor preview

`test/core/refactor-preview.test.ts` pins the rewrite: unwrapping and
reindenting a kept block, removal with no branch to keep, `await`/`!`/parentheses,
braces kept around block-scoped declarations, multi-line template literals left
byte for byte, nested reads, `else if` chains, parenthesization of a kept `?:`
branch, and every refusal. `test/frontends/preview.test.ts` covers the command,
its exit codes, that an unknown key is never echoed, and pipes the patch through
a real `git apply` to check the result equals the previewed files.

```sh
# U1. Drop the negation flip in locateSite          -> 2 tests fail
# U2. Disable joinsPreviousLine                     -> 1 test fails
# U3. Unwrap blocks that declare const/let          -> 1 test fails
# U4. Reindent inside template literals              -> 1 test fails
# U5. Let && conditions through                      -> 1 test fails
# U6. Accept let as well as const bindings          -> 1 test fails
# U7. Ignore shorthand { on } uses of a binding     -> 1 test fails
# U8. Drop the guard on deleting a binding          -> 1 test fails
```

The final "result must parse cleanly" check in `rewriteFile` is a backstop no
known input reaches, so no test fails when it is removed. Keep it.

On 2026-10-07 every flag in js-sdk-contrib, node-server-sdk and unleash-node-sdk
was previewed both ways with the coverage refusal switched off: 122 previews in
5 s, all refused as `unsupported-shape`. These are SDKs and their tests, not
applications, so they show robustness, not that the shape is common.

### CI formats

`test/frontends/render-ci.test.ts` covers `--format=github` and
`--format=codequality`: 1-based positions under the checkout prefix, the
severity mapping, workflow-command escaping (a `%`, newline, `:` or `,` in a key
or path cannot end or split the command), a Code Quality fingerprint that survives
code moving but separates alike findings, and that `check` and `--changed-since`
narrow them to what would fail. `test/present/evidence.test.ts` pins the evidence
wording those annotations carry.

`test/frontends/ci-defaults.test.ts` covers `--changed-since=auto` for each CI
system's variable, and that a push build (GitHub sets `GITHUB_BASE_REF` empty) is a
usage error rather than a guess. It makes a real `--depth 1` clone to check that a
shallow clone reports no history, explains a failed comparison, and warns.

`test/docs/ci-recipes.test.ts` keeps `docs/ci.md` copyable: every YAML block must
parse and every `flag-marshal` command in it must be accepted by the CLI as it is
now. Probed 2026-10-07: an unknown format in a recipe, and a mis-indented YAML key,
each fail it.

### Every capability, no configuration

There are no tiers. `test/frontends/cli.test.ts` ("one free tool") runs `scan` in
every format and `check` with no licence, key, or configuration, and asserts that
no output mentions a tier. A reintroduced gate fails it.

### Verifying the reporting guards still bite

```sh
# P. Emit 0-based startLine in render-sarif.ts
#    -> 1 test fails; every code-scanning annotation lands on the wrong line
# Q. Drop the .reverse() in readTrend
#    -> 4 tests fail; falling debt would be reported as rising
# R. Set a catalog `rule` to its `title`
#    -> 2 tests fail; a literal {count} would ship into a code-scanning UI
```

### Verifying the policy guards still bite

```sh
# L. Make applyRatchet ignore the baseline
#    -> 4 tests fail; every team would be greeted by a wall of failures on day one
# M. Remove the allowlist filter in evaluatePolicy
#    -> 2 tests fail; kill switches would be permanently in violation
# N. Put the file path into violationKey
#    -> 2 tests fail; a refactor would look like new debt
# O. Add a drift finding id to POLICY_FINDING_IDS
#    -> 1 test fails; CI would fail on an inference
```

Probe O originally **passed**, for the third time in this project exposing a weak
test rather than safe code: the fixture referenced its flag from a production file
*and* a test file, so `flag.test-only` never fired at all. The fixture now
references it only from a test and asserts the drift finding is genuinely raised
before asserting that `check` ignores it.

### The prefilter is a silent failure mode

`mightContainFlags` decides which files are parsed at all. A marker missing from
it does not fail anything: the scan succeeds and reports fewer flags, and no other
test in this suite notices. `test/core/prefilter.test.ts` is therefore exhaustive
rather than illustrative — it asserts every entry of every marker table reaches
the prefilter, in both directions.

**Adding a provider, an unsupported platform, or an ungated query means adding its
trigger there.** Triggers that are not statically known — custom method names,
discovered Togglz enum names — have to be passed in by the caller; that was missed
in the first draft and would have disabled every user-configured pattern.

## Corpus regression tests

Fixtures are written by whoever wrote the detector, so they cannot catch the
defects that matter. Every significant credibility bug in this project came from
running against code nobody here wrote.

`~/flag-marshal-corpus` holds twelve public repositories — **two per supported
provider**, plus two that must find nothing — and
`scripts/scan-corpus.mjs` locks in what they currently produce.

```sh
npm run corpus          # report counts
npm run corpus:check    # fail if detections were lost
npm run corpus:update   # accept new counts
```

The check fails when flag counts fall, a provider stops being detected, or
unresolved references rise. Rising detections are fine.

The corpus is **not checked in**; only `corpus-baseline.json` is. `npm test` runs
the check when the corpus is present and skips it otherwise, so CI never depends
on cloning 200MB of other people's repositories. Two baseline assertions run
regardless, because they are claims about coverage rather than about disk:

- every supported provider is covered by at least two repositories
- at least one repository is expected to stay silent

See the corpus README for setup and refresh commands.

### Verifying the harness still bites

```sh
# Break a provider's import markers in provider-identity.ts
npm run build && npm run corpus:check
#  -> "flags fell 20 -> 0", "providers no longer detected: unleash"
```

Verified: removing Unleash's markers fails the check across all three Unleash
repositories.

## The published build differs from the source

`npm run build` cleans and emits `dist/`, strips comments, then minifies each
JavaScript file in place. Declarations and source maps are not emitted. Two
consequences worth knowing before debugging:

- **Unit tests run against `src`, so they cannot catch a packaging break.** The
  runtime resolves `catalog/messages.json` and the tree-sitter `.wasm` grammars
  through relative paths and `createRequire`; only the process tests, which invoke
  the built CLI, exercise those. Run `npm run check` — which builds — rather than
  `vitest` alone before trusting a change to the build.
- **Minification is per file, never a bundle.** Bundling would collapse the module
  graph and break both of those paths. If you reach for a bundler, that is the
  reason not to.

Use `npm run build:fast` for a readable `dist` while debugging.

The repository root is deliberately not publishable. `npm run assemble:npm`
creates `artifacts/npm/package` from an allowlist: runtime JavaScript, catalog,
schema, public README, license, third-party notices, and a generated manifest with
runtime dependencies only. `test/package/npm-artifact.test.ts` rejects declaration
files, source maps, development metadata, private-document links, and unshipped
product claims. `npm run test:npm-package` packs that directory, installs the
tarball in a temporary project, then verifies the installed CLI version and a real
fixture scan.

## Process tests

`test/process/` invokes the **real built CLI** as a subprocess. Unit tests exercise
the engine; only these prove the artifact a user actually runs behaves the same,
including grammar loading from `dist/`, where module resolution differs from
source.

They require `dist/`, so `npm run check` builds before testing. Running
`npx vitest run test/process` alone needs a prior `npm run build`.

These also scan Flag Marshal's own repository, which exercises the walker against
a real tree with `.gitignore`, `node_modules`, `dist`, and the fixture corpus.

## Conventions

- Tests live in `test/`, mirroring `src/`. Files end in `.test.ts`.
- Shared test helpers do not end in `.test.ts` (see `test/architecture/source-scan.ts`).
- Tests import from `src/` by relative path. The boundary rules do not apply to test
  files, which legitimately inspect internals.
- Prefer deterministic fixtures over mocks. See [`fixtures/README.md`](../fixtures/README.md).
- Fixture directories are excluded from `tsconfig`, ESLint, and Prettier. They are
  sample code for the analyzer to read, and must be free to contain code this
  project would never accept.

## What is not tested yet

Detection covers TypeScript, JavaScript, Java and Kotlin;
LaunchDarkly, OpenFeature, Unleash and Spring `@ConditionalOnProperty`; plus
user-defined helpers via `.flagmarshal.yml`. Python, Go, C#, Ruby and other
languages remain unread and correctly cap confidence.

`check` enforces policy — owners, expiry dates, and the flag budget — with the
baseline ratchet. It deliberately does **not** enforce drift findings; failing a
build on an inference is how a tool loses a team's trust.

Git evidence costs one `git log -S` per flag and does not scale to deep histories;
see the performance budget in `ROADMAP.md` under Milestone 5. `--no-git` skips it
and makes output fully deterministic, which is what goldens and CI diffing rely
on.

`check` still reports itself as unimplemented and exits non-zero.

The goldens for `java-spring-conditional`, `kotlin-unleash`, and the configuration
half of `mixed-polyglot` still describe output nothing produces. They remain the
acceptance specification for Milestones 4 and 6.

No third-party repository containing real LaunchDarkly usage has been scanned. The
inventory is proven against fixtures and against repositories that contain no flags
at all. Collecting that evidence is part of the section 8 validation gate.

## CI

`.github/workflows/ci.yml` runs `npm ci`, `npm run check`, `npm run build`, the
installed-tarball smoke test, and a production dependency audit on every push and
pull request.

CI checks out with `fetch-depth: 0`. Git history is analysis input — flag age and
last-touched dates come from `git log` — so a shallow clone would silently weaken
that evidence once Milestone 5 lands.
