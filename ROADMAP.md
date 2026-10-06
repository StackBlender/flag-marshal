# Flag Marshal — implementation roadmap

Last updated: 2026-09-22

This is the incremental build plan and cross-session handoff record for Flag Marshal.
It is written so that an agent with **no chat history** can open it, determine the
exact next action, complete one slice, and leave the project ready for the next
agent.

Companion document: [docs/design.md](docs/design.md) — product decision,
architecture, monetization, and validation gate. Read it before implementing
anything.

> **Portfolio boundary.** This repository owns its own build, tests, versioning,
> release, and roadmap. Portfolio-level priority, cross-product decisions, and the
> concurrent-stream rules live in the private `stackblender-operations` repository,
> not here. Flag Marshal is stream C.

---

## Start here (fresh-agent protocol)

Perform these steps in order before writing any code:

1. Read this section, then **Current state**, then **Decisions already made**.
2. Read [docs/design.md](docs/design.md) completely.
3. Read the repository-local `AGENTS.md` and testing guide once Milestone 0 exists.
4. Run `git status` in the repository. **Preserve any working-tree changes that are
   not yours** and report them rather than reverting, stashing, or committing them.
5. Run the fast test suite to establish a green baseline *before* editing.
6. Find the first milestone below whose checkbox is unchecked. That is your slice.
   Do not skip ahead, do not batch milestones, do not start a second slice.
7. Complete it per **Definition of done**, then update **Current state** and check
   the box.

If the user's instruction conflicts with this roadmap, follow the user and record
the new direction here before finishing.

### Git ownership

Read-only Git commands are allowed for inspection at any time. Do not stage, commit,
push, pull, merge, rebase, branch, tag, reset, restore, clean, or stash unless the
user explicitly authorizes that specific operation. At the end of a slice, suggest
one Conventional Commit message; do not create the commit.

---

## Current state

**This table is the handoff. Update it at the end of every slice.**

| Field | Value |
| --- | --- |
| Repository | **Public** `StackBlender/flag-marshal`, a new repository created 2026-09-22. The previous private repository was retired; its scrubbed history is not carried over |
| Current phase | **One free standalone tool, decided by the user 2026-09-22.** No paid tier, no licensing, no CI product; the entitlement seam and the GitHub Action are removed and every capability runs everywhere. Open-sourcing is under consideration, not decided |
| Last completed slice | **Open-source 0.1.3 prepared** (2026-09-22) — moved into the new public repository, support repository folded in, package links repointed, version bumped |
| **Next slice** | The user commits and pushes the new repository, then publishes 0.1.3 (see "Open-source 0.1.3"). After that, "Next candidates — recorded 2026-09-22": the PR-scoped scan is buildable; the rest needs a decision. Then M11, M12, M13 |
| Tests | 616 across 36 files in `npm run check` (entitlement and Action tests removed 2026-09-22), plus 8 integration tests in a real VS Code (passing 2026-09-22), a corpus check when the corpus is present (baseline updated 2026-09-22), and an installed-tarball smoke test |
| Fixture corpus | 8 fixtures with committed goldens, all reproduced by the engine |
| Capabilities | All free: scan, every provider, custom helpers, `check` + baseline ratchet, `trend`, JSON/Markdown/SARIF, VS Code, `serve --stdio`, `init` |
| Paid tier | **None.** Dropped 2026-09-22 |
| Entitlement seam | **Removed** 2026-09-22 (`src/core/entitlement/`, every gate, and their tests) |
| Published anywhere | `@stackblender/flag-marshal` 0.1.0-0.1.2 on npm under the old proprietary terms. **0.1.3 is prepared, not published:** first MIT release, every capability free, links to the new public repository |
| Support | Issue forms, SECURITY, SUPPORT, CONTRIBUTING, CLI reference and privacy page now live in this repository. `StackBlender/flag-marshal-support` is being retired by the user |
| Known blockers | None |

Do not mark planned, partial, or unverified work complete.

---

## Decisions already made

Recorded so a fresh agent inherits boundaries instead of re-deriving or
re-litigating them. Change these only on explicit user instruction, and record the
change here.

| Decision | Value |
| --- | --- |
| Implementation language | TypeScript on Node |
| Product name | **Flag Marshal**; slug and npm package `flag-marshal`; CLI `flag-marshal`, short bin alias `marshal` |
| Distribution | npm, executable via `npx flag-marshal` |
| npm publication boundary | Repository root is private; `npm-package/` plus `scripts/assemble-npm-package.mjs` generates the allowlisted public artifact |
| Parsing strategy | tree-sitter grammars; broad shallow detection, narrow deep refactoring |
| Core boundary | `core/` must not import CLI, editor, or platform APIs; emits structured issues only, never human-facing strings |
| Network policy | Zero network calls in core. A guard test enforces this. |
| v1 detection languages | TypeScript/JavaScript, Java, Kotlin |
| v1 providers | LaunchDarkly, OpenFeature, Unleash, Spring `@ConditionalOnProperty`, yml/properties, env vars, user-defined custom patterns |
| Paid tier content | **Superseded 2026-09-22.** No tiers or licensing; see "Product model". Was: CI governance (policy, baseline, ratchet, trend, SARIF), not basic scanning |
| Licensing | **Superseded 2026-09-22.** No tiers or licensing; see "Product model". Was: Offline signed license keys; no verification server, no telemetry |
| Confidence model | `HIGH`/`MEDIUM`/`LOW`/`UNKNOWN` on every finding; computed keys reported unresolved, never guessed |
| Adoption mechanic | Baseline + ratchet; CI fails only on new debt |
| Frontend reuse | Frontends are dumb renderers of a versioned JSON contract; they import `core/api` only |
| Type generation | `schema/v1/*.json` is source of truth; TS and Kotlin models generated from it |
| Wording | All human-facing strings come from `messages.json`; core emits none |
| Shared presentation | `src/present/` fills catalog placeholders and renders evidence for **every** frontend. It imports `core/api` only, and no frontend may import `messages.json` directly — three frontends reading the catalog themselves is how one finding acquires three vocabularies |
| Cross-frontend testing | Shared golden fixtures are the conformance suite for every frontend |
| Plugin distribution | VS Code then IntelliJ, both listed publicly, both free like everything else. The paid-capability question under M13 is moot since 2026-09-22 |
| Binary distribution | Core compiles to a per-platform standalone executable; no end-user Node requirement |
| Range encoding | Line/column with explicit encoding field, declared in the schema; frontends convert at their edge |
| LSP | Deferred from v1, additive later over the `serve --stdio` boundary |
| Test runner | Vitest; tests in `test/` mirroring `src/`, helpers do not end in `.test.ts` |
| Lint / format | ESLint flat config with typescript-eslint; Prettier, with markdown excluded (docs are hand-wrapped prose) |
| Boundary enforcement | Enforced twice — ESLint for speed, `test/architecture/` as the authority, because lint can be silenced inline |
| TypeScript version | Pinned `<6.1.0` (6.0.3); typescript-eslint 8.x does not yet accept TypeScript 7 |
| tsconfig layout | `tsconfig.json` covers src+test+configs with `noEmit`; `tsconfig.build.json` emits `dist/` from `src/` only |
| CLI exit codes | `0` ok, `1` usage error, `2` policy breach — part of the CLI contract |
| CI checkout depth | `fetch-depth: 0`; git history is analysis input from Milestone 5 |
| Contract shape | One schema file with `$defs`; avoids cross-file `$ref` resolution differing between the TypeScript and Kotlin generators |
| Golden `root` | The fixture name, never an absolute path, so goldens are machine-independent |
| Range convention | A reference range covers the key literal **including quotes**; an unresolved range covers the unresolvable expression |
| Generated artifacts | Committed, so `npm ci && npm run build` needs no generation step; staleness is a test failure, not a build step |
| Parser runtime | `web-tree-sitter` (WASM), never native bindings — native cannot be embedded in the planned standalone binary |
| Grammar source | `@vscode/tree-sitter-wasm`; `tree-sitter-wasms` grammars are tree-sitter 0.20 and will not load |
| Column encoding | tree-sitter emits UTF-16 code units, matching the declared `positionEncoding`; no conversion in core |
| Provider matching | **Superseded 2026-09-10.** A provider's methods are searched for only in files that import that provider. Method-name-only matching reported Lombok setters and application helpers as feature flags |
| Grammar assets | The parser pool is the only filesystem access in core, and it reads only bundled grammars, never workspace content |
| Workspace I/O | Frontends supply a `FileSystem` port; the core never touches a workspace directly |
| Ignore semantics | Nested `.gitignore` patterns are scoped to the directory that declares them, matching git |
| Symlinks | Never followed |
| Line numbering | Contract is 0-based; frontends convert to 1-based at their edge |
| `scan` exit code | Always 0. `scan` reports, `check` enforces — so `scan` is safe in any pipeline |
| Remote vs local providers | Remotely-served providers (LaunchDarkly, OpenFeature, Unleash) never raise `flag.missing-in-configuration` |
| Config flag heuristic | A boolean under a flag namespace stands alone; a boolean under any other namespace counts only when code reads it |
| Annotation arrays | `name = ["a", "b"]` / `{"a", "b"}` expand to one reference per literal |
| Call-level identity | Import **and** a receiver bound to that provider in the same file; a receiver containing a call is rejected |
| Age-based rules | Only for providers implying temporary intent. Spring/properties/env switches are operational, not debt |
| Unsupported platforms | Disclosed in every output format. A silently incomplete inventory is a confident wrong answer |
| Togglz keys | Enum constants and `NamedFeature("literal")`; `togglz.features.<K>.enabled` normalizes to `<K>` |
| Togglz enum identity | Package-qualified. A usage resolves its simple name via import, package, then wildcard; ambiguity means unresolved |
| Constant keys | Read from the parse tree, never source text. Only immutable bindings — `final`/`const`/`val`, or never reassigned in the file |
| Parsing versus matching | Anything asking "what does this code declare" is a tree-sitter query. Regex was wrong three separate times |
| Togglz discovery | A tree-sitter first pass, requiring real `org.togglz` evidence; declarations *and* usages are filtered through it |
| Contract policy | 1.0 is mutable until first release; added fields are always optional; after release, breaking changes bump the major |
| Module boundary | The package, after stripping build scaffolding — not the first path segment |
| Declarations | A distinct `ReferenceKind`. Inventory, never usage — rules count usages only |
| Test-local enums | Do not establish inventory; test usages of production flags still count |
| Additive contract fields | Optional within a major version. Required fields may only be added by bumping it |
| Receiver bindings | Declared types, typed parameters, factory calls, **and constructors** (`new Unleash(...)`) |
| Corpus | Two public repositories per provider, not checked in; only the baseline is committed |
| `matchIfMissing` | Recorded as `defaultsWhenAbsent`; suppresses the missing-configuration finding |
| Unverified calls | Omitted entirely, never surfaced as an uncertain candidate or a "computed flag key" |
| Confidence capping | Unparsed languages or any unresolved key cap `flag.absent-from-code` at `low`, with the reason in evidence |
| Evidence placement | Findings carry evidence and confidence from M4; record-level scoring lands in M5 |
| Git access | A `GitHistory` port; the core spawns no processes. Keys are argv entries, never shell strings |
| History source | `git log -S` pickaxe, not file timestamps — a recently edited file can hold an ancient flag |
| Signal independence | Age and dormancy count as one signal; they are one observation about one history |
| Score vs confidence | Separate axes: cost versus knowledge. Never blurred |
| Determinism | `--no-git` removes history-dependent evidence, making output byte-stable for CI and goldens |
| Golden scope | Goldens pin detection only; scoring is asserted by unit tests |
| Provider shape | A provider is data — id, method names, languages. Query construction is per language, written once |
| Kotlin grammar | `@tree-sitter-grammars/tree-sitter-kotlin`; `@vscode/tree-sitter-wasm` has none. Both ABI 14 |
| Broken queries | Skipped at runtime so a user's scan survives; every query is compiled against every grammar in CI |
| Custom patterns | `.flagmarshal.yml` `customPatterns.methods`, applied across every wired language |
| What `check` enforces | Policy findings only. Drift findings are reported by `scan`, never enforced |
| Policy confidence | Always `high` — a declaration either exists or does not |
| Violation identity | `id:flagKey`, excluding file position, so refactors do not churn the baseline |
| Metadata binding | Directives name their flag explicitly; the manifest wins on conflict |
| Baseline I/O | Frontend only. The core never writes to a workspace |
| Trend storage | The committed baseline's own git history. No database, ever |
| SARIF positions | 1-based, converted at the frontend edge from the 0-based contract |
| Rule vs instance text | `rule` is placeholder-free and describes the rule; `title` describes one instance |
| Tier map | **Superseded 2026-09-22.** No tiers or licensing; see "Product model". Was: Free / Team / Pro, split by capability. Diagnosis, Markdown and custom patterns free forever |
| Never gate by provider | **Superseded 2026-09-22.** Nothing is gated at all now. The principle stands if gating ever returns: a team runs one platform, and gating detection by it shows them zero flags |
| Licensing shape | **Superseded 2026-09-22.** No tiers or licensing; see "Product model". Was: Offline Ed25519 signed keys, verified locally, no server or telemetry. Not copy protection; annual expiry, no revocation |
| Undetermined licences | **Superseded 2026-09-22.** No tiers or licensing; see "Product model". Was: `unknown` grants Free — never Team, never nothing |
| Licence | **MIT**, decided by the user 2026-09-22. Replaces the proprietary notice; applies from the next release |
| Product model | **2026-09-22, by the user:** one free standalone tool. Every capability on every installation; no tiers, licence keys, accounts, or dedicated CI product. `check` keeps exit code 2 so anyone can gate their own pipeline or hook |
| No CLI bypass | **Superseded 2026-09-22.** No tiers or licensing; see "Product model". Was: Team is reachable only by injecting a service, never by a flag or env var |
| Debt ranking | Only flags with a debt reason are ranked — age past a year, dormancy, never read, test-only, unconfigured. Module spread raises the score but never earns a rank on its own |
| Ranking wording | A rank shows its reasons, never a second confidence. Confidence stays on findings, where it qualifies one claim; nothing in a ranking says a flag is removable |
| Custom helper calls | A declared name matches bare calls (`isOn("k")`) as well as member calls. Bare calls stay rejected for built-in SDK methods, which prove nothing without a receiver |
| Helper pass-through | An SDK call whose key is a bare, never-reassigned parameter of a declared helper is not unresolved — its callers carry the keys. Anything built from the parameter stays unresolved |
| `init` | Writes only when no settings file exists, and switches nothing on: helpers the scan proved are declared, every policy option stays commented out |
| Editor order | Debt order by default, name order one click away. The ranking rule is the CLI's, arranged in `model.ts`; `extension.ts` only holds the toggle |
| Spring prefix | Composed as Spring does — `prefix` plus a dot unless present, applied to every name. An unreadable prefix makes the key unresolved, never the bare name |
| Helper suggestion | Named only for a bare, never-reassigned parameter of a named function, and never for a name shared with a built-in SDK method. A suggestion attributes nothing |
| Helper attribution | Callers of declared helpers are relabelled to an SDK only when **every** declared helper was seen forwarding to that one SDK. Otherwise they stay `custom` |

---

## Milestone ladder

Each milestone is one vertical slice that leaves the product working and verifiable.
Milestone 3 is the first externally demonstrable point. Milestone 7 is the first
paid-tier capability and is gated.

### M0 — Repository scaffold — **complete**
**Goal:** an empty but fully governed repository a fresh agent can work in.

- [x] Node/TypeScript project, strict `tsconfig`, linter, formatter.
- [x] `core/` and `frontends/cli/` directory boundary established, with a lint rule
      or test that fails if `core/` imports a frontend or platform module.
- [x] Reciprocal lint rule: frontends may import `core/api` only, never `core/detect`,
      `core/score`, or any other internal module.
- [x] Repo-local `AGENTS.md` (working rules, architecture boundary, required
      validation), `docs/testing.md`, `README.md`, and this roadmap moved in.
- [x] CI running build, unit tests, and lint on every push.
- [x] Proprietary StackBlender license notice. **Replaced by MIT 2026-09-22.**
- [x] Network guard test scaffolded (fails if a network client appears in `core/`).

**Done when:** CI is green on an empty test suite and `AGENTS.md` alone is enough to
onboard a fresh agent. — met.

**Evidence.** `npm run check` and `npm run build` both green; 15 tests across 3 files.
All four guards were verified to *fail* on deliberately introduced violations before
being accepted: core importing a frontend, core importing `node:https`, core calling
`fetch`, and a frontend importing `core/detect`. ESLint independently flagged the
frontend violation. The procedure is recorded in `docs/testing.md`.

**Limitations.** No analysis engine exists. `scan` and `check` report themselves as
unimplemented and exit `1`. `AnalysisSession` is a placeholder carrying only a `root`
field; Milestone 1 defines the real models. Production dependencies: none.

### M1 — Core models and fixture corpus — **complete**
**Goal:** the vocabulary everything else is written against, plus deterministic test
data.

- [x] `FlagReference` (key, file, range, provider, language, resolution status),
      `FlagRecord` (key, references, config presence, evidence, score, confidence),
      `Evidence`, `Finding`, `Confidence` types.
- [x] Fixture repositories committed under `fixtures/`, each small, deterministic,
      and documented: `ts-launchdarkly`, `java-spring-conditional`,
      `kotlin-unleash`, `mixed-polyglot`, `no-flags`, `computed-keys`.
- [x] `no-flags` and `computed-keys` exist specifically to prove the tool stays
      quiet and reports unresolved rather than guessing.
- [x] `schema/v1/*.json` published as the source of truth for the wire contract,
      with a `schemaVersion` field on every payload and TypeScript types generated
      from it rather than hand-written.
- [x] Canonical range encoding fixed in the schema (line/column with an explicit
      encoding field), with conversion left to each frontend's edge.
- [x] `messages.json` catalog mapping issue id to template and arguments. The core
      emits no human-facing strings.
- [x] Golden JSON output committed for every fixture, established as the
      cross-frontend conformance suite.

**Done when:** models compile, fixtures and goldens are committed, types are
generated from the schema, and all of it is documented in `docs/testing.md`. — met.

**Evidence.** 75 tests across 6 files; `npm run check` and `npm run build` green.
Three drift guards were verified to *fail* on real drift before being accepted:
a schema change with stale committed types, a fixture source edit with stale
goldens, and a catalog entry removed for an id the schema still declares. The
probes are recorded in `docs/testing.md`.

**Decisions taken during the slice.**
- The contract is **one file** (`schema/v1/scan-report.schema.json`) using `$defs`,
  not several cross-referencing files. Cross-file `$ref` resolution would have to
  work identically in the TypeScript generator and the future Kotlin generator;
  one file removes that risk entirely.
- `ScanReport.unresolvedReferences` was added to the contract. Unresolved
  references belong to no `FlagRecord`, so without it the product's central
  credibility guarantee would be invisible in the payload rather than asserted.
- Goldens carry `root` as the fixture name rather than an absolute path, so they
  are byte-identical on every machine and CI runner.
- `findings` is empty in every golden. Rule output is added by the milestone that
  implements each rule; the inventory is the M1 contract.
- ajv runs with `allowUnionTypes` because `Evidence.detail` is deliberately a
  union of primitives.

**Limitations.** No analysis engine, so the goldens describe output nothing yet
produces — they are the acceptance specification for M2 through M6. `AnalysisSession`
still carries only `root`. Evidence, scoring, and findings are absent by design at
this milestone, and `test/contract/goldens.test.ts` asserts that absence so a later
slice cannot half-fill them.

### M2 — Detection: one provider, one language — **complete**
**Goal:** prove the detection seam end to end on the narrowest real case.

- [x] tree-sitter TypeScript grammar wired into a language adapter.
- [x] LaunchDarkly provider adapter extracting string-literal flag keys.
- [x] Non-literal keys emitted as `UNKNOWN` resolution, never guessed.
- [x] Reference index: flag key → all reference sites with precise ranges.
- [x] Unit tests against `ts-launchdarkly` and `computed-keys`.

**Done when:** the index returns exact, deterministic references for the TS fixture
and reports computed keys as unresolved. — met.

**Evidence.** 99 tests across 9 files; `npm run check` and `npm run build` green;
detection verified working from `dist/` with the WASM grammar resolved.
`test/core/golden-conformance.test.ts` reproduces the `ts-launchdarkly`,
`computed-keys`, and `no-flags` goldens **exactly** — the moment those files stop
being a specification and become a regression test. Two probes confirmed the
never-guess guarantee is enforced: an extractor returning `node.text` as the key
fails 5 tests, and treating an interpolated template literal as a literal fails 1.

**Decisions taken during the slice.**
- **Grammars are WebAssembly, never native bindings.** Native tree-sitter needs
  node-gyp builds or per-platform prebuilds and cannot be embedded in the
  standalone executable the IntelliJ frontend is meant to bundle. WASM keeps the
  distribution plan intact.
- **Grammar source is `@vscode/tree-sitter-wasm`.** `tree-sitter-wasms` was tried
  first and rejected: its grammars are built against tree-sitter 0.20 and fail to
  load under web-tree-sitter 0.26+ with a dylink error.
- **tree-sitter columns are UTF-16 code units**, matching the declared
  `positionEncoding`, so no conversion happens in the core. Verified empirically
  against multi-byte and surrogate-pair input rather than assumed.
- **Provider queries match on method name alone**, not on proving the receiver is
  an LDClient. Type resolution is unavailable here and would not survive the
  aliasing real codebases use. A false match surfaces as a visible, dismissable
  key; a missed call site is invisible.
- A **template literal with no interpolation is a genuine literal** and resolves.
  One with `${...}` does not.
- Reference kind (`production-code` / `test-code`) is decided at detection time
  from the path, since a test-only flag is a distinct kind of debt.

**Limitations.** TypeScript and LaunchDarkly only. Nothing walks a directory —
`scanSource` takes one file's text and the caller decides what a workspace is.
`mixed-polyglot` detection covers only its TypeScript half; the test asserts that
gap explicitly rather than weakening the golden.

### M3 — CLI `scan` — first demonstrable slice
**Goal:** the "we have far more old flag code than I expected" moment.

- [x] `flag-marshal scan` walks a directory, respects `.gitignore`, and prints a
      human-readable inventory: flag key, reference count, file locations.
- [x] `--json` emits the structured model for agents and CI.
- [x] Deterministic ordering; exit code 0 regardless of findings (`scan` reports,
      `check` enforces).
- [x] `core/api` `AnalysisSession` established as the single public surface; the CLI
      is a wrapper over it and reaches no further.
- [ ] **Deferred, not done.** Per-platform self-contained binary build (Node SEA or
      equivalent), so no Node runtime is required on an end user's machine.
- [x] Process-level tests invoking the real binary, asserted against the M1 goldens.

**Done when:** `npx flag-marshal scan` runs against a real third-party repository and
produces a correct inventory, and the standalone binary produces byte-identical JSON.
— **partially met.** The CLI half is done and verified; the binary half is deferred.

**Evidence.** 126 tests across 11 files; `npm run check` green. Process-level tests
invoke the real built CLI as a subprocess and reproduce the `ts-launchdarkly`,
`computed-keys`, and `no-flags` goldens exactly, proving grammar loading works from
`dist/` where module resolution differs from source. Scanned a real 30,100-file
repository (`../openapi-guard-vscode`) in **0.44s**, correctly skipping
`node_modules` and honestly reporting no flags — that repository uses no supported
flag SDK. The CLI also scans its own repository without crashing.

**Decisions taken during the slice.**
- **The filesystem port is real, not decorative.** The core performs no workspace
  I/O; frontends supply `FileSystem`. Both the CLI tests and the walker tests run
  against an in-memory tree, which is only possible because of it, and an editor
  frontend will later supply unsaved buffers through the same seam.
- **Nested `.gitignore` patterns are scoped to their own directory.** The first
  implementation added nested patterns to a root-relative matcher, which would
  have made `web/.gitignore`'s `notes.ts` silently ignore `service/notes.ts`. Each
  matcher is now tested against the path relative to its own base, and
  `test/core/walk.test.ts` pins the case.
- **`scanSources` reuses one parser per language** across a repository walk;
  `scanSource` remains the single-file entry point an editor wants.
- **Symbolic links are never followed** — a link out of, or back into, the
  workspace turns a walk infinite.
- **1-based line numbers are a frontend concern.** The contract stores 0-based;
  the renderer converts at its edge, exactly like position encoding.
- **Unreadable directories and files are skipped, not fatal.** Real repositories
  contain broken symlinks and permission-denied paths; none should cost a user
  their whole inventory.
- `npm run check` now builds before testing, because the process tests exercise
  the built artifact.

**Why the binary is deferred.** Its purpose in `docs/design.md` is to let the
IntelliJ plugin bundle an engine without requiring Node on the user's machine.
That frontend is deferred and not authorized, and `npx` — the actual v1
distribution — needs no binary. Building it now would serve a milestone that has
not started, and it carries a specific unsolved problem: under Node SEA the WASM
grammars must be embedded as SEA assets and handed to `Language.load` as bytes
rather than paths, which also affects how `web-tree-sitter` loads its own runtime.
The seam for this already exists — `parser-pool.ts` is the single place that turns
a grammar spec into a loaded language — so the change stays local when it happens.

**Limitations.** TypeScript and LaunchDarkly only. No configuration parsing, so
`inConfiguration` is always `false` and no rule fires — `findings` is empty by
construction. No third-party repository containing real LaunchDarkly usage has
been scanned yet; that evidence is exactly what the section 8 validation gate
requires, and it is not yet collected.

### M4 — Configuration sources and gap rules — **complete**
**Goal:** findings that need cross-referencing, not just grep.

- [x] Readers for `application.yml`, `application.properties`, `.env`, and provider
      config files.
- [x] Rule: referenced in code but absent from all configuration.
- [x] Rule: present in configuration but never referenced in code.
- [x] Rule: referenced only from test sources.

**Done when:** the three rules fire correctly on fixtures and produce zero findings
against `no-flags`. — met. `no-flags` yields 0 flags, 0 findings, 0 unresolved.

**Evidence.** 183 tests across 13 files; `npm run check` green. Four probes
confirmed the new logic is actually enforced: treating LaunchDarkly as locally
configured fails 2 tests, accepting any configuration namespace fails 2, and
removing the env-prefix check fails 1.

**A test gap the probes found.** The namespace check was initially unexercised —
every non-flag property in the fixtures happened to have a non-boolean value, so
the boolean check alone was carrying the tests. Three cases were added using real
Spring settings that *are* boolean (`spring.jpa.show-sql=true`,
`server.compression.enabled=true`) and would have been misreported as feature
flags. A probe that passes proves nothing; this one earned its keep.

**Decisions taken during the slice.**
- **Remotely-served providers never raise `flag.missing-in-configuration`.** A
  LaunchDarkly flag lives in LaunchDarkly and will never appear in
  `application.properties`. Firing that rule for remote providers would produce a
  finding for every flag in a repository — the fastest possible way to get
  uninstalled on first run. `provider-traits.ts` draws the line; Spring
  `@ConditionalOnProperty`, properties files, and env switches are the mechanisms
  where a missing entry is genuinely meaningful.
- **A configuration entry is a flag only when two signals agree**: a flag-ish
  namespace (`feature`, `flags`, `toggles`, …) *and* a boolean-like value. Real
  configuration is full of booleans that are settings, not flags. Teams with other
  conventions get explicit custom patterns in Milestone 6 rather than a looser
  default here.
- **Unparsed languages cap confidence.** If the walk passes over `.java`, `.kt`,
  `.py`, or similar and no grammar reads them, "nothing references this flag" may
  only mean "nothing this tool can read references it". `flag.absent-from-code`
  drops to `low` and names the unread extensions in its evidence. This is what
  keeps partial language support from producing confident false claims.
- **An unresolved key anywhere also caps `flag.absent-from-code`**, since a
  computed key could be exactly that flag.
- **`flag.unresolved-key` is reported at `high` confidence** — stating what could
  not be determined is always true.
- **YAML keys are flattened to the dotted form**, so `features: {nightly: true}`
  and `features.nightly=true` are one flag, not two.
- Findings carry evidence and confidence from this milestone; **record-level**
  evidence and scoring remain Milestone 5.
- The renderer prints every finding with its confidence and a plain-language
  `why:` line built from the evidence, with all wording drawn from
  `catalog/messages.json` rather than authored in the frontend.

**A fixture README was wrong and is corrected.** `fixtures/ts-launchdarkly/README.md`
predicted that both LaunchDarkly flags would raise `flag.missing-in-configuration`.
They correctly raise nothing. The file now records both the right behavior and why
the earlier prediction was wrong.

**Limitations.** Only TypeScript is parsed, so `java-spring-conditional` reports
its three properties as `absent-from-code` at `low` confidence — two of those are
false in reality, and the low confidence plus the `sources not read: .java`
evidence is what keeps the claim honest until Milestone 6. Configuration discovery
covers `application*.properties`, `application*.y[a]ml`, and `.env*` only; no
provider config files (`.launchdarkly`, Unleash exports) are read yet.

### M5 — Git evidence and confidence scoring — **complete**, one item deferred
**Goal:** the evidence layer that agents and grep cannot cheaply reproduce.

- [x] Git history evidence: first-seen commit per flag key, last-modified date.
- [x] Module and package spread.
- [ ] **Deferred, not done.** Branch complexity at reference sites.
- [x] Debt score plus the `HIGH`/`MEDIUM`/`LOW`/`UNKNOWN` confidence assignment
      from design section 5.
- [x] Every finding carries the evidence list that produced its confidence.
- [x] Performance budget recorded on a repository with 10k+ files.

**Done when:** no finding claims a flag is safe to delete without `HIGH` confidence
and a printed evidence trail. — met. No catalog message contains the phrase at all
(a contract test enforces it), every finding renders a plain-language `why:` line
built from its evidence, and `flag.stale` never claims more confidence than its
record earned.

**Evidence.** 212 tests across 14 files; `npm run check` green. Verified end to end
against a synthetic repository with real backdated commits: a flag introduced in
January 2023 is reported as `introduced 3.7 years ago; last changed 3.7 years ago`
while a flag added today is not flagged. Three probes confirm the logic is
enforced — counting age and dormancy separately fails 3 tests, removing the
partial-coverage cap fails 2, recording configuration absence for remote providers
fails 1.

**Performance budget.**

| Workload | With git | `--no-git` |
| --- | --- | --- |
| 30,100 files, 0 flags | 0.51s | 0.44s |
| 60 files, 180 flags, 6 commits | 0.79s | 0.36s |
| One pickaxe, 38-commit repository | ~0.11s | — |

**This does not scale, and the shape of the problem is now known.** Git evidence
costs one `git log -S` per flag, and pickaxe cost grows with history depth, so the
total is roughly *flags x commits*. At 0.11s per call on a 38-commit repository,
200 flags would already cost ~20s, and a repository with tens of thousands of
commits would be far worse. A 5s per-key timeout bounds the damage and degrades to
"no history evidence" rather than hanging, and `--no-git` skips it entirely. The
real fix is recorded in known debt.

**Decisions taken during the slice.**
- **Git is a port, like the filesystem.** The core spawns no processes; the CLI
  supplies `nodeGitHistory`. Keys are passed as argv entries and `--` ends option
  parsing, so a key containing shell metacharacters or a leading dash is inert.
- **Pickaxe, not file timestamps.** `git log -S<key>` finds commits that changed
  the number of occurrences of a literal string, which is what "when did this flag
  appear" means. A file edited yesterday can carry a flag added three years ago,
  so file mtimes answer a different question.
- **Age and dormancy count as one signal, not two.** They are a single observation
  about the same commit history; counting them twice would manufacture agreement
  that does not exist and inflate confidence.
- **Absence from configuration is evidence only for locally-configured
  mechanisms.** Recording it for a LaunchDarkly flag would turn completely normal
  operation into a staleness signal — the same mistake the M4 rule already avoids,
  found here a second time in the evidence layer.
- **`debtScore` and `confidence` are separate axes.** The score says how much a
  flag probably costs; confidence says how much the tool actually knows. A
  high-scoring flag at `low` confidence is a lead, never a conclusion.
- **Wide reach reduces urgency rather than raising it.** A flag in forty places is
  expensive to remove but no more likely to be dead.
- **`--no-git` produces fully deterministic output**, which is what makes goldens
  and CI diffing possible at all once history became an input.
- **Goldens now pin detection, not scoring.** Evidence depends on commit history
  and on which languages a build can read, so freezing it would make every golden
  stale on the next commit. Scoring is asserted by unit tests instead.
- **`unreadable-languages` was added to the contract.** Milestone 4 had overloaded
  `module-spread` to carry unread extensions, which collided with genuine module
  spread as soon as real spread existed — it rendered as "sources not read: 1".

**Why branch complexity is deferred.** Measuring the conditional nesting around a
reference needs AST context that only exists during detection, and carrying it
forward means adding a field to `FlagReference` in the contract, regenerating
models, and rebuilding every golden. Its scoring contribution is marginal next to
age, reference count, and code/config absence. Milestone 11 needs exactly this
context to compute a refactor preview, so the work belongs there rather than being
paid for twice.

**Limitations.** Only TypeScript is parsed, so confidence on any repository
containing Java or Kotlin is capped at `low` — correctly, but it means most real
Spring repositories cannot reach `high` until Milestone 6. Git evidence does not
scale as described above.

### M6 — Second language and second provider — **complete**
**Goal:** prove the adapter seam is real rather than aspirational.

- [x] Java and Kotlin tree-sitter adapters.
- [x] OpenFeature and Unleash provider adapters; Spring `@ConditionalOnProperty`.
- [x] User-defined custom pattern configuration, so a homegrown
      `Features.isEnabled(...)` helper works without a code change.
- [x] Tests across `java-spring-conditional`, `kotlin-unleash`, `mixed-polyglot`.

**Done when:** adding a provider requires no change to the index, evidence, or
scoring layers. — met. A provider is now a declaration in
`src/core/detect/providers/index.ts`: an id, a list of SDK method names, and the
languages it is used from. **Free tier is feature-complete.**

**Evidence.** 260 tests across 17 files; `npm run check` green. **Every fixture
golden is now reproduced by the engine** — the files Milestone 1 wrote by hand
before any code existed are all satisfied, including `mixed-polyglot` merging one
key across Java and TypeScript into a single record. Three probes bite, each
asserting it applied before drawing a conclusion.

**The Kotlin blocker is resolved.** `@vscode/tree-sitter-wasm` ships no Kotlin
grammar; `@tree-sitter-grammars/tree-sitter-kotlin` does, and both build against
tree-sitter ABI 14 — verified by loading and parsing before adopting it.

**Decisions taken during the slice.**
- **Providers are data, not code.** Every supported SDK has the same shape — the
  flag key is the first argument to a named method — so the per-language query is
  written once in `queries.ts` and each provider is a list of method names. This
  is what makes the milestone's `Done when` true rather than merely claimed.
- **Queries match on method name, not receiver type**, unchanged from Milestone 2
  and for the same reason: a visible false match beats an invisible miss.
- **A query that fails to compile is skipped, not fatal.** A bug in this codebase
  must not cost a user their whole scan. Because that safety net would also hide
  the bug, `test/core/queries.test.ts` compiles every adapter query against every
  grammar so breakage fails CI instead.
- **Custom patterns live in `.flagmarshal.yml`**, the same file Milestone 7 will
  use for policy. A homegrown `Features.isFeatureOn("x")` is found across every
  wired language without a change to this codebase — verified end to end.
- **Java and Kotlin were removed from the unreadable-languages list.** A language
  in both `GRAMMARS` and that list would cap confidence for no reason; a test now
  asserts the two never overlap.

**A real bug the tests caught.** Kotlin's brace-less `"prefix-$name"` interpolation
produces **no interpolation node at all** — its parse tree is indistinguishable
from a plain string, unlike `"${...}"` which does produce one. The extractor was
therefore reporting a flag key of literally `prefix-$name`: invented nonsense, the
exact failure the never-guess rule exists to prevent. Kotlin string text is now
scanned for an unescaped `$`, with `\$` correctly staying a literal.

**Confidence is no longer capped on Spring repositories.** `java-spring-conditional`
now reports `features.retired-dashboard` at `medium` rather than `low`, and the two
findings that were false in Milestone 4 are gone entirely, because the Java code
references are finally visible.

**Limitations.** Python, Go, C#, Ruby, Rust, and others remain unread and still cap
confidence — correctly. Spring's `prefix = "..."` combined with `name = "..."` is
not composed; only `name`/`value` are read. No provider export files
(`.launchdarkly`, Unleash exports) are parsed. Custom patterns match method calls
only, not annotations or bespoke config shapes.



> ### GATE — validation before Milestone 7 — **WAIVED BY THE USER, 2026-09-10**
>
> The gate below was **not satisfied**. The user was told what it required and what
> it was for, and chose to proceed to Milestone 7 anyway. That is their call to
> make; this note exists so no future reader mistakes the gate for passed, or for
> quietly forgotten.
>
> Still uncollected: five real repositories scanned with counts recorded, five
> leads shown the report with reactions recorded, one concrete price conversation
> with someone other than the original contact, and one team willing to trial
> `check` in CI.
>
> The evidence held for this product remains **one conditional buyer signal** —
> see `docs/design.md` section 2. Nothing built after this point should be
> described as validated demand, and the stop conditions in section 8 still apply
> if that evidence is ever collected and comes back negative.

### M7 — Policy engine, baseline, and ratchet — **complete**
**Goal:** the first paid-tier capability and the core of the recurring product.

- [x] `.flagmarshal.yml`: max age, owner required, expiry required, budget, severity
      map, permanent-flag allowlist.
- [x] Flag metadata via both inline comment annotation and central manifest.
- [x] Baseline file written on first run; ratchet logic failing only on new debt.
- [x] `flag-marshal check` with non-zero exit on violation.

**Done when:** a repository with heavy existing debt passes on first adoption and
fails when one new unowned flag is added. — met, and verified end to end against a
real git repository through the whole lifecycle: first run reports existing debt
and exits 2; `--update-baseline` accepts it; the next run exits 0; adding one
unowned flag exits 2 naming only that flag; declaring its owner and expiry exits 0;
paying down older debt is detected and reported as such.

**Evidence.** 300 tests across 19 files; `npm run check` green. Four probes bite —
ignoring the baseline fails 4 tests, ignoring the allowlist fails 2, putting file
position into the violation identity fails 2, and enforcing a drift finding fails 1.

**Decisions taken during the slice.**
- **`check` enforces policy findings only.** Missing owners, missing or passed
  expiries, and the budget are facts about the repository. `flag.stale` and
  `flag.absent-from-code` are inferences carrying a confidence, and failing a
  build on an inference is how a tool loses a team's trust in one afternoon.
- **Policy findings are always `high` confidence.** There is nothing to infer: the
  team either declared an owner or did not.
- **Violation identity excludes file position.** Moving a flag to another line is
  not a new violation, and a baseline that churned on every refactor would be
  abandoned within a week.
- **Inline directives name their flag explicitly** —
  `// flag-marshal: checkout-v2 owner=team-x expiry=2026-12-01` — rather than
  binding by proximity, which breaks the moment someone reformats a file. The
  directive is comment-syntax-agnostic because only the text after
  `flag-marshal:` is read.
- **The manifest wins over an inline directive** on conflict: a central
  declaration is the one a reviewer is most likely to be looking at.
- **The allowlist is load-bearing.** Kill switches and licensing gates
  legitimately live forever, and allowlisted flags are excluded from the budget
  count too.
- **Baselines are read and written by the frontend**, never the core, which still
  performs no workspace writes. A malformed baseline is treated as absent rather
  than failing a build over a corrupted bookkeeping file.
- **The first run has no baseline and says so**, pointing at
  `--update-baseline` instead of dumping every violation as a failure on a team
  that has done nothing wrong yet.

**A rendering bug this milestone exposed.** `renderScan` returned "No feature flags
found." whenever there were no flags — swallowing findings that carry no flag key,
such as a budget breach. A report with findings now always renders them.

**Limitations.** Severity is fixed per rule; the configurable severity map from the
design is not implemented. Policy applies repository-wide, with no per-directory
override. `check` has no `--format` beyond `--json`; Markdown and SARIF are
Milestone 8. Expiry dates are compared in UTC.

### M8 — Reporting and CI integration — **complete**
- [x] Markdown report suitable for a pull-request comment.
- [x] SARIF output for GitHub code scanning.
- [x] GitHub Action wrapping the CLI.
- [x] Trend history derived from committed baselines — no hosted database.

**Done when:** not stated for this milestone. Taken as: every output format renders
correctly, the action propagates failure, and trend data comes from committed
baselines with no hosted storage. All three verified.

**Evidence.** 326 tests across 21 files; `npm run check` green. Trend verified end
to end against a real git repository with three dated baseline commits, correctly
reporting `down 4 since the first recorded baseline`. Three probes bite — emitting
0-based SARIF positions fails 1 test, reading trend history newest-first fails 4,
and reusing an instance title as a rule descriptor fails 2.

**Decisions taken during the slice.**
- **Trend needs no database, and never will.** The baseline is committed alongside
  the code, so its own `git log` *is* the record of how much debt the team carried
  and when. `readTrend` is `git log` plus `git show`, which keeps the local-first
  guarantee intact for a feature that would normally demand a backend.
- **SARIF positions are converted at the frontend edge.** SARIF is 1-based in both
  line and column; the contract is 0-based in both. Getting this wrong puts every
  annotation on the wrong line, so it is pinned by a test.
- **The catalog gained a placeholder-free `rule` summary.** A SARIF rule descriptor
  describes the rule, not an instance, so there is nothing to substitute into it —
  reusing the instance title shipped a literal `{count}` into a code-scanning UI.
  A contract test now forbids a placeholder in any `rule` text.
- **Markdown folds its detail.** A pull-request comment that dumps two hundred rows
  into the timeline gets the bot muted, so the headline is one line and the table
  lives behind a `<details>`.
- **Markdown and SARIF from `check` carry only the introduced violations**, since
  they describe what CI would fail on rather than everything the baseline accepts.
- **The action defaults to `check`**, propagates the exit code, and documents
  `fetch-depth: 0` — without full history, flag age evidence silently vanishes.
- **SARIF upload is documented with `command: scan`**, because uploading findings
  should not depend on whether the build passed.

**Limitations.** The action refers to `npx flag-marshal`, which will not resolve
until the package is published; nothing is published yet. Trend reads at most 50
baseline revisions. Markdown accepts a trend but no command wires one into it yet.
There is no PR-comment posting step — the action produces the Markdown and leaves
posting to the caller.


### M9 — Entitlement seam — **complete**
- [x] `FREE`/`TEAM`/`UNKNOWN` entitlement service with a pluggable provider.
- [x] Feature map gating M7 and M8 capabilities.
- [x] Ship `FreeEntitlementProvider` only. **No licensing provider, activation flow,
      payment processor, or billing configuration.**

**Evidence.** 346 tests across 22 files; `npm run check` green. Verified against the
built binary: `scan` works, while `check`, `trend`, `--format=sarif`, and
`--format=markdown` each refuse with a message naming the capability and pointing
at what stays free. Three probes bite — letting an undetermined state unlock Team
fails 2 tests, moving policy enforcement into Free fails 4, and removing the gate
from `check` fails 1.

**A consequence worth stating plainly.** The seam is enforced, and only the Free
provider ships, so **a shipped build cannot run `check`, `trend`, SARIF, or
Markdown at all.** That is exactly what `docs/design.md` section 7 specifies, and
it is also the reason the paid tier currently cannot be demonstrated to anyone.
Tests reach Team capabilities by injecting an entitlement service, which is
available to any frontend but is not exposed on the command line — there is
deliberately no flag or environment variable that unlocks the paid tier, because a
bypass that trivial would be worse than no seam at all.

**Decisions taken during the slice.**
- **The tier map mirrors `docs/design.md` section 7 exactly.** Diagnosis — `scan`
  and JSON output — is free permanently, because it is the acquisition path.
  Enforcement, reporting, history, and custom patterns are Team.
- **`unknown` grants the Free set.** A provider that cannot reach a verdict must
  not silently unlock the paid tier, and must not take away diagnosis the user
  already had either.
- **A provider that throws is treated as `unknown`**, never as a crash.
- **The shipped provider returns `free`, not `unknown`**, because `unknown` should
  mean a provider tried and could not decide — a state no current build reaches.
- **The provider resolves once per service**, not per question.
- **Custom patterns are gated in the core**, since that is where adapters are
  assembled, but the *notice* is printed by the CLI: a user must never silently
  wonder why their configured helper is invisible.
- **Refusals exit 1 and name the capability**, then say what stays free.

**Limitations.** No licensing provider, activation flow, payment processor, or
billing configuration exists, and none is authorized. There is no way to obtain a
Team installation, which makes the paid tier undemonstrable from the CLI today.
Entitlement state is per process; nothing is cached across runs.


### Detector credibility — **complete** (unplanned; from real-world testing)

**Why this exists.** Another agent ran Flag Marshal against two real Spring
repositories, `acmenav-service` (Kotlin) and `acmeco-webapp` (Java). It found four
defects that fixtures could never have caught, because every fixture in this
repository was written by the same person who wrote the detector.

- [x] Kotlin and Java `@ConditionalOnProperty` array literals resolve to their
      keys, one reference per literal, instead of the whole array being reported
      as a computed key.
- [x] Provider identity is established from imports. A provider's methods are only
      searched for in files that import that provider.
- [x] Configuration correlation accepts any namespace when code demonstrably reads
      the key, while keeping the conservative heuristic for entries with no source
      evidence.
- [x] Unresolved wording no longer overstates certainty, and names the provider.
- [x] Regression fixture and tests derived from the reported shapes.

**The decision this reverses.** Milestones 2 and 6 both recorded, as deliberate,
that queries match on SDK method name rather than receiver type — justified as
"a visible false match beats an invisible miss". **Real repositories showed that
reasoning was wrong.** `isEnabled` is a Lombok builder setter. `getStringValue` is
a helper on an intake form. `variation` is a domain method on a pricing plan.
Reporting those as feature-flag debt does not produce a visible false match a user
shrugs off; it teaches them the tool does not know what it is looking at, and they
uninstall it. The decisions table now records the supersession rather than hiding
it.

**How identity is established.** A file's `import` and `require` statements are
read — not its whole text, so a provider named in a comment or a string constant
unlocks nothing. `spring-conditional` stays ungated because the annotation name is
specific enough that a false positive is implausible, and `custom` stays ungated
because the user named those methods themselves in `.flagmarshal.yml`.

**Known, deliberate miss.** A file that receives an already-constructed client
without importing its type is not detected. That is recall traded for correctness,
per the product principle: missing an unsupported pattern is acceptable when
clearly represented; confidently labelling ordinary application code as flag debt
is not.

**A second bug found while fixing the first.** Nested YAML keys flattened to a
dotted path had their range length computed from the dotted key rather than the
leaf text actually present, so an editor would underline past the end of the line.
Ranges now cover the leaf as written.

**Evidence.** 378 tests across 23 files; `npm run check` and `npm run build` green.
`fixtures/real-world-shapes/` reproduces every reported shape and yields exactly
three flags, zero unresolved references, and nothing at all from `OrdinaryCode.java`.
Three probes bite — removing the identity gate fails 4 tests, removing array
expansion fails 4, and the config-promotion rule is pinned by process tests
asserting `spring.jpa.show-sql` never enters the inventory.

**What this says about the validation gate.** The waived gate asked for exactly
this: contact with repositories the tool was not built against. One afternoon of
it produced four real defects. That is worth weighing before more is built on
untested assumptions.

### Detector credibility, round 2 — **complete** (from real-repository review)

A second review of the same two Spring repositories found six more issues. Two were
High, and both were failures of *honesty about scope* rather than ordinary bugs.

**1. Togglz was unsupported, and the report did not say so.** AcmeCo declares nine
Togglz flags; Flag Marshal reported one flag for the entire repository. A
confidently small inventory is its own kind of false claim — arguably worse than a
false positive, because nothing looks wrong. Two fixes:

- Togglz is now a supported provider. It names flags as enum constants rather than
  string literals, so it has its own query shape: the enum declaration supplies the
  inventory, `Flags.X.isActive()` supplies references, and
  `togglz.features.<KEY>.enabled` normalizes to `<KEY>` so configuration and
  constant are one flag.
- `ScanReport.unsupportedProviders` was added to the contract. When a flag platform
  this build cannot analyze is imported — Split, ConfigCat, Flagsmith, GrowthBook,
  Statsig, PostHog, Optimizely, Flipt, FF4j, FeatureHub — the report says so, in
  every format. **An inventory that silently omits a platform is a confident wrong
  answer, which is the one thing this tool must never give.**

**2. Spring operational switches were being sold as feature-flag debt.**
`@ConditionalOnProperty` proves something is *conditional* — a queue listener, a
scheduled job, non-production basic auth — not that it is a temporary rollout
awaiting cleanup. Those switches are permanent by design. Four `flag.stale`
findings on AcmeNav were technically correct and useless, and the fix cannot be
"allowlist every job you run".

Age-based rules are now restricted to providers that imply temporary intent —
LaunchDarkly, OpenFeature, Unleash, Togglz. Rules grounded in something other than
age still apply everywhere: a configured property nothing reads is still reported.

**3. Import gating did not establish call-level identity.** A file importing
Unleash turned *every* `.isEnabled(...)` in it into a flag reference, including
Lombok builders. Import proves the SDK is used somewhere in a file; it does not
prove a given call belongs to it. The receiver must now also be an identifier the
file binds to that provider — a declared field, a typed parameter, or an assignment
from a known factory. A receiver containing a call (`Builder.builder()`) or no
receiver at all is rejected outright.

**4. The false-negative tradeoff remains untested.** Neither repository uses
LaunchDarkly, OpenFeature, or Unleash, so nothing there can show whether import
gating lost legitimate SDK calls. Recorded as open risk; a third repository using a
remote provider is still needed.

**5. `matchIfMissing = true` is now honored.** Spring supplies its own default, so
absence of configuration is normal rather than a defect. Carried on the reference as
`defaultsWhenAbsent` and consumed by `flag.missing-in-configuration`.

**6. Stale roadmap text** claiming no analysis engine exists was removed.

**Evidence.** 416 tests across 23 files; `npm run check` and `npm run build` green.
Verified end to end: the reported Unleash/Lombok collision now yields exactly one
flag; a four-year-old Spring conditional produces no stale finding; a Split import
produces a disclosure line; the `java-togglz` fixture inventories three flags across
declaration, usage, and configuration.

**Limitations.** Detection requires an SDK import *and* a bound receiver, so a file
handed an already-constructed client is missed twice over. Togglz custom feature
managers and non-enum declarations are not handled. The unsupported-provider list is
a fixed set of markers; an unrecognized platform is still invisible.

### Detector credibility, round 3 — **complete** (from a public corpus)

Round 2 left one question open: neither reviewed repository used a remote provider,
so nothing showed whether import gating had cost legitimate detections. Four public
repositories that do use them were cloned to `~/flag-marshal-corpus` (outside any
StackBlender repository, nothing checked in) and scanned.

**Import gating did not lose remote-provider calls.** OpenFeature and LaunchDarkly
call sites were detected with correct provider attribution in all three repositories
that contain them. That closes the open risk from round 2.

**The unsupported-provider disclosure fired on real code**, correctly naming
ConfigCat, Flagsmith, Flipt, Optimizely, Statsig and GrowthBook where those
providers appear.

**But the corpus exposed a large defect: flag keys held in constants were reported
as computed.** This is the most common real shape there is —
`private static final String FLAG = "string-flag";` followed by
`client.getBooleanValue(FLAG, false)` — and it is the same class of error as the
Kotlin annotation arrays: a value written plainly in the source, reported as
unknowable.

| Repository | **Public** `StackBlender/flag-marshal`, a new repository created 2026-09-22. The previous private repository was retired; its scrubbed history is not carried over |
| --- | --- | --- |
| `java-sdk-contrib` | 7 flags, 170 unresolved | **36 flags, 2 unresolved** |
| `js-sdk-contrib` | 25 flags, 133 unresolved | **38 flags, 80 unresolved** |
| `java-server-sdk` | 9 flags, 40 unresolved | 9 flags, 33 unresolved |

Same-file string constants are now read, and `CONSTANT + "suffix"` chains folded
when every part is known. This is not guessing: the value is in the file.

**What stays unresolved is now genuinely unresolvable.** The remainder is
`flagKey` and `key` parameters inside generic test helpers, and constants exported
from *another* file — cross-file resolution is not attempted, and pretending
otherwise is how a wrong key reaches an inventory. A name declared twice with
conflicting values is dropped rather than picked.

**Evidence.** 424 tests across 23 files; `npm run check` and `npm run build` green.
The `computed-keys` fixture still resolves only its one genuine literal, because
`PREFIX + name` has an unknown part.

**Limitations.** Constant resolution is same-file and lexical: it reads
declarations by pattern, not by scope analysis, so a shadowed constant inside a
function is treated as a conflict and dropped. Cross-file constants, enum-held
keys outside Togglz, and keys built by function calls remain unresolved.

### Detector credibility, round 4 — **complete** (fourth real-repository review)

Six findings, three High. All six fixed.

**Togglz usages were almost entirely missed (High).** Nine declarations were found
and nearly no usages, because usage files import the *application's* enum —
`com.example.FeatureFlags` — not `org.togglz`. The file-level import gate that made
round 2 correct made Togglz wrong.

Togglz now needs workspace knowledge, so the session takes a **first pass** over
JVM sources to find enums implementing `Feature`, reading them by regular
expression with no parsing. Usages are then matched as plain member access —
`FeatureFlags.SOME_FLAG` — and filtered against the enums actually discovered. This
catches wrappers like `getTogglzFlagDetails(FeatureFlags.X)` that matching
`.isActive()` never could.

**Enum declarations counted as code usage (High).** Every declared flag therefore
looked referenced, hiding the ones nothing calls. `declaration` is now a distinct
`ReferenceKind`: it establishes that a flag exists without being code that reads
it. `flag.absent-from-code` and `flag.test-only` count usages only, and the
`java-togglz` fixture now correctly reports its two unused flags.

**A test-local feature enum polluted the inventory (Medium).** A `TestFlags` enum
defined inside a test class produced a phantom `FEATURE_A` with two findings of its
own. Enum declarations under test sources no longer establish inventory. Test
*usages* of a production-declared flag still count as test references, because
those arrive through the discovered-enum path — verified both ways.

**The contract changed incompatibly (Medium).** `unsupportedProviders` was made
required while `schemaVersion` stayed `1.0`, which retroactively invalidates every
report an earlier 1.0 build wrote. It is now **optional**: additive within the
version, which is what a version is for. Three contract tests pin this.

**Togglz configuration ranges underlined `enabled` (Low)** rather than the flag key
above it. The YAML walk now carries ancestor key positions so the range points at
`ANALYTICS_TAB`.

**The Kotlin Togglz query was too broad (Low)** — it captured every enum entry in a
file once Togglz was in scope, without checking the enum implements `Feature`.
Narrowed to match the Java query's rigour.

**A duplicate-reference bug found while fixing these.** Two query patterns could
match the same node, double-counting a reference and inflating reference counts,
module spread, confidence, and the debt score. References are now deduplicated by
key, position, provider, and kind.

**Evidence.** 441 tests across 23 files; `npm run check` and `npm run build` green.
Verified against a reconstruction of the reported AcmeCo shape: production usages
across files resolve, the wrapper call resolves, the test-local enum produces
nothing, and a test usage of a production flag still marks it test-only. The public
corpus shows no regression.

**Note on finding 1.** The stale `acmeco-after.json` and `acmenav-after.json` are in
the reviewer's worktree, not this repository. They need regenerating after
`npm run build`; nothing here produces them.

### Corpus regression suite — **complete**

Four review rounds produced seventeen defects, none of which the fixtures caught,
because the same person wrote both the fixtures and the detector. Twelve public
repositories now stand in for that missing perspective — **two per supported
provider**, plus two that must find nothing.

| Provider | Repositories |
| --- | --- |
| LaunchDarkly | `java-server-sdk`, `node-server-sdk` |
| OpenFeature | `java-sdk-contrib`, `js-sdk-contrib` |
| Unleash | `unleash-java-sdk`, `unleash-node-sdk`, `unleash-client-java-examples` |
| Togglz | `togglz`, `togglz-samples` |
| Spring `@ConditionalOnProperty` | `spring-boot`, `togglz` |
| properties / YAML | `togglz`, `togglz-samples` |

`spring-petclinic` and the Unleash **server** are kept precisely because they must
stay at zero. A change that starts reporting flags there is a false-positive
regression, and nothing else in the suite would notice.

**Expanding the corpus immediately found a real defect.** Both Unleash repositories
reported zero flags. The cause was that `const client = new Unleash(...)` — a
constructor — was not recognized as binding a receiver, so every direct
instantiation was invisible. Constructor bindings are now recognized:
`unleash-node-sdk` went from **0 to 20 flags** and `unleash-java-sdk` from 0 to 14.
That is the most common binding shape there is, and no fixture used it.

**The harness.** `scripts/scan-corpus.mjs` records flag counts, unresolved counts,
and detected providers per repository in a committed `corpus-baseline.json`. It
fails when counts fall, a provider stops being detected, or unresolved references
rise; rising detections are fine, since support improves. Verified by breaking
Unleash's import markers, which fails the check across all three Unleash repos.

The corpus itself is **not checked in** — it lives outside every StackBlender
repository, and only the baseline is committed. `npm test` runs the check when the
corpus is present and skips it otherwise, so CI never depends on cloning 200MB of
other people's code. Two assertions run regardless, because they are claims about
coverage rather than about disk: every provider has two repositories, and at least
one repository is expected to stay silent.

**Limitations.** These are mostly SDK and provider-contrib repositories, so their
keys are largely test fixtures. They measure recall and noise well; they say
nothing about how much flag debt a real product carries. Counts will drift when the
corpus is refreshed, and `corpus:update` accepts whatever it sees — the diff needs
reviewing, not rubber-stamping.

### Detector credibility, round 5 — **complete**

Four findings, two High. Both High were in the Togglz discovery written in round 4,
and both trace to one mistake: **I matched source text with a regular expression
where I should have parsed it.**

**Any enum implementing an unrelated `Feature` became Togglz flags (High).**
Discovery checked only the interface's simple name, so a perfectly ordinary
`enum ShippingOptions implements Feature` was reported as two feature flags.
`Feature` is a generic name that domain code uses constantly. Discovery now
requires real evidence: `import org.togglz.core.Feature`, a `org.togglz.core.*`
wildcard, or the fully qualified name at the declaration. A *qualified* reference
must match Togglz's exactly — `com.other.Feature` is somebody else's interface no
matter what the file imports.

The declaration query now also captures the enum name and is filtered through the
discovery pass, exactly like usages. A tree-sitter query cannot tell which
`Feature` is meant; only imports can, and discovery is where imports are read.

**Enum constants with constructor arguments were invisible (High).** Discovery
split the enum body on every comma, so `A("x", true), B("y", false)` produced
nothing — and because that first pass gates all Togglz detection, the failure
silently erased the entire inventory for the repository. Discovery is now a
tree-sitter query, which is what it should always have been.

**The contract widened `ReferenceKind` while staying at 1.0 (Medium).** Correct to
flag. Since nothing is published, the schema now states its own **pre-release
policy** out loud: version 1.0 is mutable until first release, but two rules
already apply and survive it — a field added within a version is optional, never
required, and after publication any breaking change bumps the major. The policy
names its own expiry, and a contract test asserts it is documented, so a future
reader knows a widened enum was a decision rather than an oversight.

**`module-spread` was useless on conventional layouts (Low).** Every Maven and
Gradle file starts `src/main/java`, so a first-segment rule reported spread 1 for a
flag touching the entire codebase — making the evidence and the debt score
meaningless on exactly the repositories that need them. Build scaffolding is now
stripped and the *package* is the module, so `com/example/billing` and
`com/example/search` are correctly two. Main and test sources of one package count
as one.

**Evidence.** 455 tests across 24 files; `npm run check` and `npm run build` green;
no corpus regression across the twelve public repositories. Both reported High
shapes verified fixed directly.

**A probe that proved nothing, again.** The first attempt at the simple-name probe
passed, because a second guard rejected the file before the rule under test ran.
Rewritten to isolate the rule, it fails as it should. That is now the fourth probe
in this project to pass for the wrong reason.

**Corpus coverage is not shape coverage.** The corpus has two Togglz repositories
and they exercise recall well — sixteen flags from production enums — but **neither
contains either shape that broke.** No enum in them implements an unrelated
`Feature`, and no *Feature* enum carries constructor arguments. Having a provider
represented is not the same as having its awkward shapes represented.

Both shapes now live in `fixtures/java-togglz/`, where they can be controlled:
constants declared as `NEW_CHECKOUT("checkout", true)`, and a `ShippingOptions`
enum implementing a local `interface Feature` that must stay silent.

**A golden that verified nothing.** While adding those, the `java-togglz` golden
turned out to be a specification **no test compared against the engine** — Togglz
needs the workspace discovery pass, so single-file conformance tests skipped it
entirely. It is now asserted through the built CLI at the session level. Probes
confirm both shapes fail loudly when their guard is removed.

**Limitations.** Discovery parses only files that mention both `enum` and
`Feature` and carry Togglz evidence, so a Togglz enum assembled some other way is
missed. `module-spread` treats every package as equally distant; it does not
measure how far apart two packages are.

### Detector credibility, round 6 — **complete**

Four findings, two High. Both High were in the constant resolution added in round
3, and the cause is the same one as round 5: **source text matched with a regular
expression where it needed parsing.** That is now three separate features —
provider identity, Togglz discovery, constant resolution — where regex was the
wrong tool. The rule is simple and was learned expensively: if the question is
"what does this code declare", parse it.

**Mutable bindings resolved as constants (High).**
`let FLAG = 'first'; FLAG = 'second';` reported `first` while the runtime saw
`second` — a confidently wrong key, which is worse than no key. Java `String`
fields without `final` had the same problem.

**A comment could invent a flag key (High).** A line reading
`// const FLAG = 'invented-key'` fabricated that key outright, next to a genuine
import the tool should have left unresolved. This broke the single guarantee the
product cannot break.

Both are fixed by reading declarations from the parse tree already built for the
scan — no extra parse. A declaration inside a comment or a string simply is not a
node.

**Effectively final, so correctness cost no recall.** Requiring `final`/`const`
outright was sound but dropped two real detections in `unleash-java-sdk`, where
locals are declared without `final` and never reassigned. Java has a name for
exactly that, so a same-file assignment query now supplies it: a binding nothing
writes to is treated as immutable. The reported reassignment cases stay
unresolved, and corpus recall returned to its baseline of 14 — soundness and
recall, rather than one traded for the other.

**Any Togglz import qualified a foreign `Feature` (Medium).** Importing
`org.togglz.core.manager.FeatureManager` does not tell you what a bare `Feature`
in that file refers to. Only `org.togglz.core.Feature` itself or the
`org.togglz.core.*` wildcard qualifies it now. Fixing this exposed a second bug:
the JVM import pattern's greedy character class swallowed the dot before `*`, so
wildcard imports were being parsed as `org.togglz.core.` and never matched at all.

**Togglz enums are keyed by simple class name (Low).** Two `FeatureFlags` classes
in different packages would merge their constants. Recorded as known debt rather
than fixed: doing it properly needs package-qualified identity plus import
resolution, and no reviewed repository exposes it.

**Evidence.** 469 tests across 24 files; `npm run check` and `npm run build`
green; corpus identical to baseline on all twelve repositories. Probes confirm
each guard: removing assignment analysis fails 2 tests, widening the Togglz import
check fails 1.

### Togglz hardening — **complete**

Prompted by learning that the user's organization uses **Togglz exclusively**. Both
outstanding Togglz debts were then no longer hypothetical, and one of them produced
a *wrong* inventory rather than an incomplete one — the more damaging kind.

**Enums are now identified by package-qualified name.** Two `FeatureFlags` classes
in different modules previously merged their constants, so a reference to one could
match a constant belonging to the other. A usage now resolves its simple name the
way the language does — explicit import, then the file's own package, then wildcard
imports — and when several enums share a name with nothing to disambiguate them,
the reference is dropped rather than guessed at. A single enum of that name in the
workspace is unambiguous anyway and still resolves.

Verified on a three-module layout: `FeatureFlags.BILLING_V2` resolves through the
billing import, while `FeatureFlags.RANKING_V3` — a constant belonging to the
*search* enum, referenced in a file importing billing's — correctly does not.

**`NamedFeature("some-flag")` is supported**, in Java and Kotlin. It is Togglz's
escape hatch for code that does not declare an enum, which custom feature managers
and dynamically registered flags reach for, and its key is a plain literal. It
needs no enum filter because no enum is involved; the Togglz import identifies it.
A computed argument stays unresolved.

**Evidence.** 480 tests across 24 files; `npm run check` and `npm run build` green.
Probes bite: merging same-named enums fails 4 tests, removing `NamedFeature` fails 1.

**A commercial note, recorded because it affects the product and not just the
code.** Togglz is free, self-hosted and Apache-licensed. The vendor-bill argument
in `docs/design.md` section 1 — the CFO-legible number that distinguishes this
product from OpenAPI Guard — **does not apply to a Togglz shop**. What remains
there is incident risk and governance, which are real but softer. If the buyer runs
a commercial platform the original argument holds; if the buyer looks like this
organization, the pitch is "stop flag debt accumulating", not "cut your flag bill".
Worth resolving before more is built on the stronger claim.

**Limitations.** Resolution is import- and package-based, not a full type
resolution: a same-named enum reached through an alias or a re-export is not
followed. `NamedFeature` subclasses and Togglz's programmatic `FeatureManager`
registration are still unsupported.

### Three-tier entitlements — **complete**

Prompted by the Togglz price signal: willingness to pay clearly differs by segment,
and a single paid tier taxes both ends wrongly.

The proposal on the table was to gate **detection by flag provider** — free for one
platform, paid for the rest. It was rejected, and the reasoning is recorded in
`docs/design.md` section 7 so it is not re-litigated: it kills acquisition, because
a team that cannot scan their own platform sees zero flags and uninstalls before a
buyer ever hears a number; nobody can consume the extra providers, since a team
runs one; and "why does Unleash cost more than Togglz" has no honest answer,
because provider support is a fixed cost to StackBlender rather than variable value
to the customer.

Tiers are split by capability instead:

| Free | Team | Pro |
| --- | --- | --- |
| `scan`, all providers, JSON, Markdown, custom patterns | `check`, baseline ratchet, `trend`, SARIF, Action | Provider API integrations, multi-repo rollup, migration tooling |

Commercial-platform shops land in Pro **naturally**, because provider API
integrations only exist for platforms with an API — the segment with a vendor bill
pays more because it gets more, with no rule saying so.

**Two capabilities moved down into Free.** Markdown output, because it is *how* a
developer forwards the alarming number to whoever holds the budget; and custom flag
patterns, because a shop with a homegrown helper would otherwise see nothing at all
and never reach the point of considering a paid tier. SARIF stayed in Team: it is a
CI ingestion format, not a way to show a colleague a number.

**Licensing is designed but deliberately unbuilt.** Section 7 now specifies the
full mechanism — Ed25519 offline signed keys, public key embedded in the package,
verification via `node:crypto` with no network call, tier carried in the payload,
merchant of record for fulfilment — along with what it honestly is not: it is not
copy protection, revocation is impossible offline so keys are annual and reissued,
and an undetermined verdict grants Free rather than a paid tier or nothing. **No
licensing provider, key format, or payment configuration exists**, and none may be
built without an explicit decision.

**Evidence.** 483 tests across 24 files; `npm run check` green. Tests assert the
tiers nest so an upgrade never removes a capability, that Pro capabilities are
denied to Team, and that **no entitlement names a provider** — the mistake this
slice exists to avoid.

### Release preparation — **complete**; publishing is the user's to run

**Published publicly, under a proprietary licence.** A private npm package costs
money per seat, and the portfolio already answers this: `@stackblender/openapi-guard@0.2.0`
is public on npm with `license: SEE LICENSE IN LICENSE`. Source-available
distribution, proprietary terms.

Public is also the only option that works, for two reasons beyond cost. Section 7
already concedes that offline keys are not copy protection — the package is
readable JavaScript — so a private registry protects nothing it claims to. And the
free tier *is* the acquisition path: a developer installs it, sees an alarming
number, forwards it to whoever holds the budget. A registry they cannot reach
without credentials breaks the first step, and `npx` in `action.yml` cannot resolve
at all.

**Named `@stackblender/flag-marshal`** for consistency with the sibling and so the
scope is owned; the installed command stays `flag-marshal`, with `marshal` as a
short alias. `publishConfig.access` is `public`, because a scoped package defaults
to restricted — which needs the paid plan this decision exists to avoid.

**The published artifact is stripped and minified.**

Source maps are no longer emitted — they referenced `../../src`, which is not
published, so they were broken for consumers *and* a map of the source layout.

Comments are stripped from both `.js` and `.d.ts`. This mattered more than it
looks: the source comments explain the **pricing strategy in plain English**
("a LaunchDarkly shop has a vendor bill, a Togglz shop does not"; "gets uninstalled
before anyone with a budget ever sees it"). They were written for internal readers
and would have shipped verbatim to npm.

The build then minifies per file. It is **deliberately not a bundle**: the runtime
resolves `catalog/messages.json` and the tree-sitter `.wasm` grammars through
relative paths and `createRequire`, and collapsing the module graph would break
both in ways unit tests could not catch, since those run against `src`. Both paths
are smoke-tested against `dist` after every build.

Minification is **not protection** and is not treated as such — section 7 is
explicit that licensing here is not copy protection, and a one-line patch to
`entitlementsFor` still unlocks every tier. What it buys is that the
implementation is no longer casually skimmable out of `node_modules`. Deliberate
obfuscation was considered and rejected: it breaks debuggability and stack traces
for real bug reports, risks subtle runtime failures, and stops nobody who is
actually motivated.

**Why honour-based licensing is nonetheless sound here.** The buyer is a company,
not an individual. Individuals pirate developer tools; procurement departments do
not patch a vendor's package to avoid a licence fee. This is the same bargain
JetBrains and Sublime make, and it holds for B2B precisely because the failure mode
is organizational, not technical.

The tarball is **33.5 kB packed, 99 kB unpacked, 83 files** — `dist`, `catalog`,
`schema`, `LICENSE`, `README.md`, nothing else. Verified by `npm pack --dry-run`:
no `src`, tests, fixtures, corpus, or tooling config.

**A version inconsistency found while preparing.** `CORE_VERSION` was `0.0.0` while
the package moved to `0.1.0`, so every report embedded a version the package did
not have — making an archived report untraceable to the build that wrote it. Both
the process test and the golden generator now derive the version from
`package.json` rather than hardcoding it, and `test/contract/version.test.ts` fails
if they ever drift.

**Not published.** `npm publish` is the first irreversible action in this project
and belongs to the user.

### Corrective npm artifact boundary — **complete**; 0.1.1 publishing is the user's to run

Version 0.1.0 was published, revealing that npm rendered the private repository
README and exposed development scripts, development dependencies, roadmap links,
and unshipped product-tier claims in the listing. It did not expose credentials or
source TypeScript, but the listing was an internal handoff rather than a product
page. Its declaration files also described every internal module.

Version 0.1.1 uses a separate, generated publication root. The repository manifest
is now `private: true`, while `scripts/assemble-npm-package.mjs` creates an explicit
allowlist under `artifacts/npm/package`: minified runtime JavaScript, catalog,
schema, customer-facing README, proprietary license, third-party notices, and a
generated manifest containing runtime dependencies only. TypeScript declarations
and source maps are not emitted. The customer README describes only the Free
scanner that a public installation can actually use; it contains no private links,
development layout, paid tiers, SARIF, or GitHub Action promises.

The boundary has two guards. `test/package/npm-artifact.test.ts` inspects the
assembled tree and metadata. `npm run test:npm-package` packs and installs that
tree in a temporary project, checks the installed version, and scans a real
fixture. The notices generator reads dependency manifests directly because some
runtime dependencies do not export `package.json`; `npm run check` now fails if
the committed notices become stale.

**Evidence.** 489 tests across 26 files; full check, build, artifact inspection,
installed-tarball smoke test, and package dry run green. The root package cannot be
published accidentally. Version 0.1.0 is immutable on npm; this correction must be
0.1.1.

### Public support repository — **complete**; 0.1.2 publishing is the user's to run

User-directed on 2026-09-11. The published package pointed nowhere: this source
repository is private, so a customer following any link got a 404, and the manifest
had no `repository`, `homepage`, or `bugs` field. The user created the public
`StackBlender/flag-marshal-support` repository, modelled on `openapi-guard-support`.

- `npm-package/package.template.json` points `repository`, `homepage`, and `bugs` at the
  support repository, never at this one.
- The customer README gains a Support section: docs, issue forms, private security
  reporting, and a reminder to replace flag keys with placeholders.
- Version 0.1.2, because npm metadata only changes with a new version. The goldens
  changed only in `coreVersion`.
- Guards: `test/package/npm-artifact.test.ts` and `npm run test:npm-package` both fail
  if any public link resolves anywhere but the support repository.

The support repository documents only shipped free behavior (`scan` in human, JSON,
and Markdown). It lists `check`, `trend`, and SARIF as Team capabilities the free
build refuses, and the GitHub Action as not yet available: the Action lives in this
private repository, so other workflows cannot reference it, and it defaults to the
refused `check`.

**Evidence.** Full check green, 584 tests across 33 files (one new artifact test);
installed-tarball smoke test passed for 0.1.2 with the link checks.

### M9b — RPC server for editor frontends — complete
- [x] `flag-marshal serve --stdio` exposing `AnalysisSession` over JSON-RPC, for
      editors needing incremental updates without a process spawn per keystroke.
- [x] Same golden-set conformance as the one-shot CLI.
- [x] Boundary kept clean enough that an LSP wrapper is additive later. **Do not
      implement LSP in v1** — see design section 4, "LSP is deferred, not rejected."

**What shipped.** `src/frontends/rpc/` in three files that stay separable:
`protocol.ts` (Content-Length framing and decoding, no knowledge of Flag Marshal),
`server.ts` (method dispatch over one `AnalysisSession`, no knowledge of streams),
and `stdio.ts` (the transport). Methods: `initialize`, `flagMarshal/scan`,
`shutdown`, `exit`. `scan` takes `{ root?, git? }` and returns the same `ScanReport`
the CLI prints, produced by the same `openWorkspace` call — the two frontends
cannot disagree about analysis, only about argument parsing.

**Why `exit` as well as `shutdown`.** Every editor client already speaks the LSP
pair. Answering only one of them leaves a conforming client waiting for a reply it
never receives. This is protocol courtesy, not LSP: no LSP types, capabilities, or
document synchronisation exist here.

**Why the framing is byte-counted.** `Content-Length` is bytes, not characters. A
flag key containing anything outside ASCII would silently desynchronise a
character-counted stream, and the resulting corruption appears several messages
later, nowhere near its cause. `test/rpc/protocol.test.ts` pins this with a
`café-🚀` payload.

**Recorded lesson — the self-await deadlock.** Requests are serialised on a promise
chain so two scans cannot interleave. The first shutdown implementation drained that
chain by awaiting it, from a callback that was itself a link in the chain: the link
waited for a queue that could not advance until the link returned, and the process
hung with every test passing. The fix is that a handler running *inside* the queue
stops directly (`stop()`), and only outside events — `end`, `close`, `error` —
drain it first (`stopWhenDrained()`). Any future work that adds a queued handler
needing to end the session must follow the same split. `test/process/rpc-process.test.ts`
now fails on this by timing out rather than hanging the suite.

**Evidence.** 510 tests across 29 files, full `npm run check` green. 17 RPC unit
tests (8 framing, 9 dispatch) and 5 process tests that spawn the built
`serve --stdio` and assert golden conformance for `java-togglz` and
`ts-launchdarkly`, repeated scans from one warm process, error isolation, and exit
on closed input. The golden comparison was probed by pointing it at the wrong
fixture and confirming it failed.

**Limitations, deliberate.** No incremental or push updates — a scan is a whole
workspace, and per-keystroke re-analysis is a Milestone 10 question once a real
editor makes the cost visible. No cancellation. No `initialize` handshake
enforcement: the server answers `flagMarshal/scan` whether or not a client
initialised first, because refusing would buy strictness no client wants.

### M10 — VS Code frontend

Split in three because the parts have different testability. Everything decidable
is in 10a and covered by the ordinary suite; 10b is the part that can only be
exercised inside a running editor, kept as thin as possible for exactly that
reason; 10c runs it in a real editor to prove it loads at all.

#### M10a — shared presentation and the view model — complete
- [x] Thin frontend importing `core/api` directly — same language, so no subprocess
      and no IPC.
- [x] All wording rendered from `messages.json`; no strings authored in the frontend.
- [x] Conformance test: the view model renders the golden set correctly.
- [x] No analysis logic duplicated from `core/`.

**What shipped.** Two things:

`src/present/` — a new layer between the core and the frontends. `fillTitle`,
`explanationOf`, `evidenceSummary`, `ageLabel` and `count` used to live in the
CLI's `render.ts`, which meant the only way for VS Code to reuse them was to copy
them. It imports `core/api` and nothing deeper, imports no frontend and no editor
API, and renders text but never layout. Three boundary tests enforce that, plus a
fourth asserting no frontend imports `catalog/messages.json` directly.

`src/frontends/vscode/model.ts` — the whole view: `toDiagnostics(report)` and
`toInventory(report)`, pure functions over a `ScanReport` with no `vscode` import.
This is where the judgement lives, so this is what the tests can reach.

**Why a flag-level finding fans out to every reference.** A stale or expired flag
carries no range — the debt is the flag, not one line of it. Pinning the warning
to the first reference makes it invisible in every other file, which a developer
experiences as the tool not reporting it at all. So those findings are attached to
all references. Findings that carry their own range stay where they are, and
`flag.unresolved-key` is excluded because it is already reported at its own call
site.

**Why workspace findings are kept.** A budget breach names no flag and no file, so
there is nothing to underline. It is also the finding a team explicitly agreed to
enforce. `DiagnosticSet.workspace` exists so it has somewhere to go instead of
being silently dropped.

**The npm tarball excludes it.** `assemble-npm-package.mjs` now deletes
`dist/frontends/vscode` from the artifact, and the package test asserts it is
absent while the CLI is still present. Editor frontends ship through their own
marketplaces; an `npx` user should not download a view model they cannot run.

**Evidence.** 542 tests across 30 files, full check green. 29 view-model tests
including golden conformance over all 8 fixtures, asserting no flag is invented or
lost and every finding reaches somewhere a user can see it. The fan-out rule and
all three new boundary guards were probed by breaking them and confirming the
failure.

#### M10b — extension host wiring — complete
- [x] `src/frontends/vscode/extension.ts`: `activate`, a `DiagnosticCollection`
      fed from `toDiagnostics`, a `TreeDataProvider` fed from `toInventory`, and a
      go-to-reference command. Translation only — any judgement belongs in
      `model.ts`, where it can be tested.
- [x] `vscode` as a dev-only peer; it must never reach the npm package.
- [x] Rescan on save, debounced. Whether a scan is fast enough for per-keystroke
      analysis is unanswered until a real workspace makes the cost visible.
- [x] Extension manifest and packaging, kept out of the published npm tarball.

**How to run it.** `npm run extension:dev`, then F5 in VS Code — `.vscode/launch.json`
opens a Development Host on `fixtures/ts-launchdarkly`. Change the second `args`
entry to point it at a real repository. `npm run package:vscode` produces the
standalone `artifacts/vscode/`.

**Node adapters moved to `src/frontends/node/`.** `nodeFileSystem`, `nodeGitHistory`
and `nodeBaselines` were under `cli/`, which would have made the extension import
the CLI to get a filesystem. All three Node-hosted frontends need exactly these.
The `Baselines` port and `BASELINE_PATH` moved further, into `core/api`: the
baseline file name is a product convention every frontend must agree on, not a CLI
detail, and two frontends each maintaining their own accepted debt is not a
recoverable mistake.

**The entry point is bundled to CommonJS.** The extension host loads `main` with
`require`, and everything else in this repository is ESM, so `esbuild` converts
just the entry point. Two details make it work rather than nearly work: the bundle
is written at the **same depth** as the source file it replaces, because grammar
and catalog paths resolve relative to the resolving module and flattening the
output would point `../../../catalog` at the wrong directory; and a banner
reconstructs `import.meta.url` from `__filename`, because esbuild otherwise
replaces it with an empty object and takes the grammar loader's `createRequire`
with it — silently, leaving an extension that parses nothing.
`test/package/vscode-artifact.test.ts` fails on both.

**Pruning: 73 MB to 14 MB.** The grammar packages ship for every consumer at once —
native prebuilds for a dozen platforms, the original C sources, and a `.wasm` per
language. This reads four languages through WebAssembly and never native bindings.
The prune list is an allowlist, so a new grammar added without a matching entry
fails loudly; the inverse would silently ship 60 MB again.

**The fake `vscode` module.** `test/fakes/vscode.ts` is aliased in by
`vitest.config.ts`, so `activate` runs against real fixture directories in the
ordinary suite. Without it, the one file that cannot run outside an editor would
also be the one file nothing verifies. It records what the extension asked the
editor to do; it is not a simulation. A boundary test keeps `vscode` out of every
frontend file except `extension.ts` — one import in `model.ts` would move testable
logic somewhere only a Development Host can reach.

**Evidence.** 557 tests across 32 files, full check green. 7 host tests driving
`activate` against fixtures and 7 packaging tests. The bundled extension was also
run outside the suite against three fixtures with a stub host: grammars loaded,
the tree filled, diagnostics landed on absolute workspace paths, both commands
registered. The URI mapping, the save-rescan wiring, the note ordering and the
`import.meta` guard were each probed by breaking them.

**Limitations, deliberate.** No settings UI — configuration is `.flagmarshal.yml`,
read from the workspace as the CLI reads it. No code actions or quick fixes; those
belong with M11's refactor preview. No incremental analysis: a scan is a whole
workspace, debounced 750 ms after a save, and whether that is fast enough on a
large repository is the first thing to learn from real use.

#### M10c — integration tests in a real VS Code — complete
- [x] `npm run test:integration`: downloads VS Code, installs the assembled
      extension into it, and drives the editor via `@vscode/test-cli`.
- [x] A second CI job under `xvfb-run`, separate from `check`.

**Why a fake editor was not enough.** `test/fakes/vscode.ts` proves the wiring, but
a fake says yes to everything you build it to say yes to. It cannot prove the
extension is loadable at all: that the manifest names a file that exists, that the
CommonJS bundle can be `require`d, that a contributed command is really registered,
or that the API calls are ones the real implementation accepts. Those are exactly
the failures that only appear when a user installs it.

**The first run found the test, not the code.** Pointed at `fixtures/ts-launchdarkly`,
three diagnostic tests failed — because that fixture produces no findings, so there
were no diagnostics to find. A fixture with a clean bill of health would have let a
completely broken diagnostic path pass silently. The workspace is now
`fixtures/java-spring-conditional`, which produces both flags and a finding.

**Deliberately few, and none of them decides anything.** Every judgement is in
`model.ts` and covered by tests that run in milliseconds. These cover only what a
fake cannot answer. 8 tests, about 700ms warm; the first run takes a couple of
minutes to download an editor.

**Evidence.** All 8 pass in a real VS Code 1.137. Probed by changing the
diagnostic `source` string: the three diagnostic tests fail, as they must.

#### M10d — the extension against the corpus — complete
- [x] The assembled extension driven against all 12 public corpus repositories,
      through its own activation path rather than the CLI's.

**Two findings, neither visible from fixtures.**

**Scanning does not scale to a large repository.** Eleven of the twelve finish in
under four seconds; `spring-boot` takes **55 seconds**. Isolating it through the
CLI, `--no-git` still takes 42 seconds, so git evidence accounts for only about a
quarter of it — the cost is parsing, and the known-debt row about pickaxe cost is
therefore not the main problem. Rescanning that on every save would keep a core
busy for the rest of the afternoon.

The interim answer is `shouldAutoRescan` in `model.ts`: the first scan always
happens, and after that the extension earns the right to run automatically by
being fast. Above `AUTO_RESCAN_BUDGET_MS` (3s) it says so once in its output
channel and falls back to the manual command. Silently continuing would be worse
than either option, because the user would experience an editor that stutters and
never learn why. This is a guard rail, not a fix; the fix is making the scan
faster, which is the next slice.

**A flag with no name.** The `togglz` repository has
`new NamedFeature("")` in a test asserting that empty names are rejected. The
extractor read it correctly — it is a genuine string literal — and the inventory
showed an entry with a blank label. An entry with no name reads as a bug in the
analyzer rather than a finding about the code, so a literal key that is empty or
whitespace-only is now dropped at the point the reference is built. Corpus
baseline for `togglz` moved 20 to 31, which is the accumulated gain from Togglz
support landing after the baseline was first recorded, less this one.

**What this did not test.** A repository with Togglz at organisational scale, and
therefore whether 55 seconds is an outlier or the shape of the problem. The corpus
is public SDK repositories, which are small and flag-dense; a real application is
large and flag-sparse.

### Detector credibility, round 7 — the extension against live repositories

External review ran the VS Code extension and the CLI against two private
repositories (AcmeNav, 17 flags; AcmeCo, 10 flags) and confirmed the extension and
CLI agree exactly. Every probe from rounds 1-6 now passes. Two defects found.

**The extension showed conclusions with no evidence.** `model.ts` built a hover
containing the catalog explanation, the evidence and the confidence — and
`extension.ts` passed only `message` to `vscode.Diagnostic`, so `detail` was
computed and dropped. Every finding reached the user as a bare assertion, which is
the one thing this product cannot do: a claim a user cannot weigh is a claim they
cannot act on.

The evidence now goes in the message. `Diagnostic` has no second field VS Code is
guaranteed to show — `relatedInformation` needs a location and is collapsed by
default, and there is no detail property at all — so the conclusion is the first
line and the evidence follows. Both the fake-host and the real-VS-Code suites now
assert it on the *rendered* diagnostic, not on the model's output. The model test
proved only that `detail` was calculated, which is exactly how this shipped.

**A mutable Java field could still resolve to the wrong key.** Effectively-final
analysis only saw assignments to a bare identifier, so `this.FLAG = "second"` was
invisible and the field resolved to its initialiser. Two changes, both of which
the reviewer is right about: a Java **field** must now say `final`, because
"effectively final" is a claim about every write in a program and a field can be
written from any method or any class holding a reference — none of it visible to a
file-local pass. Locals and parameters keep effectively-final treatment, because
every write to one *is* in view. And the reassignment query now sees writes through
a receiver, in Java and TypeScript both.

**A third defect, found while fixing the second.** Widening the assignment query
with a node type one grammar does not have made `new Query` throw, which the code
caught and turned into an empty set — read as "nothing is reassigned". Two
existing tests written precisely to catch confidently-wrong keys went green.
`reassignedNames` now returns `undefined` when it cannot analyse the writes, and
nothing is called constant on that basis. A pass that cannot see the writes must
say so, not answer "none".

**Round 7b: the explanation was impossible.** Retest confirmed both fixes hold —
AcmeNav and AcmeCo counts unchanged at 17/38 and 10/23, zero unresolved references,
all three findings still present, and the hover renders correctly in a real VS Code.
It also re-raised a wording defect flagged in an earlier round and not fixed:
`flag.missing-in-configuration` offered "the flag is served entirely by a remote
provider" as a possible cause, when `expectsLocalConfiguration` means the rule can
*never* fire for a remotely-served provider. The second half was wrong too — a
missing Spring property prevents bean creation; it does not make the flag evaluate
to a default on every request, and a call site that would default is already
excluded by `defaultsWhenAbsent`.

Rewritten to say what actually happened: a locally-configured mechanism reads the
key, nothing this scan parsed defines it, and either the value comes from
somewhere the scan cannot see or the guarded code never takes its active path.
The gate and the wording are now cross-referenced in both directions in
`provider-traits.ts` and `apply-rules.ts`, because this is the second round the
drift has survived. A user who checks an explanation against the evidence and finds
it impossible stops trusting every other explanation too.

**Real-repository scan cost.** AcmeNav takes about 13 seconds through the
extension, so auto-rescan correctly disables itself. That is a working guard rail
and a confirmation that the performance problem is not confined to `spring-boot`:
a 17-flag application repository is already over the budget by 4x.

**Dev-only advisories acknowledged.** Four vulnerabilities in `@vscode/test-cli`'s
bundled mocha. Production audit is clean; already recorded in Known debt, and
deliberately not fixed with `--force`.

**Evidence.** 569 tests, full check green, 8 integration tests in VS Code 1.137,
no corpus regression. Each new guard probed by breaking the code it protects.

### Scan performance — complete

Driven by measurement, not guesswork: Spring Boot took 55 seconds through the
extension and AcmeNav, a 17-flag application repository, took 13. A CPU profile
said 55% of the time was inside two tree-sitter WebAssembly functions, so parsing
was the cost — **not** the pickaxe cost recorded in Known debt, which was the
obvious suspect and the wrong one.

**Four changes, each measured before the next.**

*A parse prefilter* (42s → 10.5s). Detection already requires either an import of
a provider or a specific annotation, so a file whose text contains none of those
strings cannot produce a reference. A substring scan is deliberately blunter than
the real check — it matches comments and string literals too — and is enormously
cheaper than building a syntax tree. Most files in a real application mention no
flag mechanism at all.

The danger is that a marker missing from the prefilter is a **silent** false
negative: the scan succeeds and reports fewer flags. `test/core/prefilter.test.ts`
asserts every entry in every marker table reaches it, including the custom-method
and discovered-Togglz-enum lists that are not statically known. The custom-method
list was in fact missed in the first draft, which would have disabled every
user-configured pattern.

*One walk, one read* (10.5s → 8.5s). `sourceFiles` documented that "a repository
is read exactly once" while `discoverTogglzEnums` walked and read the whole
repository first — the comment had been true once. Now a single pass sorts files
into those that pass the prefilter and the paths of those that do not, and only a
workspace that actually declares a Togglz enum comes back to re-read the rest,
because those usage files name the application's own type and match no static
marker.

*Parallel reads* (8.5s → 4.6s). Nearly half the remaining profile was idle,
waiting on one file at a time. Reads are issued 32 at a time and consumed in walk
order — processed as an ordered array rather than as they arrive, because a report
whose contents depend on disk scheduling cannot be diffed between runs.

*Parallel git evidence* (14.3s → 6.4s through the extension). With parsing fixed,
the pickaxe finally was the dominant cost — ten seconds of a fourteen-second scan,
and only visible once everything else got out of the way. Eight in flight, bounded
lower than the read concurrency because each spawns a process.

**Results.** Spring Boot 55s → **6.4s** through the extension, 42s → 4.6s for the
CLI with `--no-git`. `togglz` 3.6s → 2.7s, `spring-petclinic` 0.09s. Detection is
byte-identical: no corpus regression across all 12 repositories, and two
consecutive git-enabled scans of the same repository produce the same SHA-256.

**Known debt updated.** The pickaxe row stands — parallelism hides the cost rather
than removing it, and a repository with hundreds of flags will still feel it. The
documented fix (one `git log --name-only` pass, reserving the pickaxe for flags
that already look stale) remains the real answer.

**Confirmed on the repositories that matter.** External measurement over three
processes per figure: AcmeNav 1.29s and AcmeCo 1.89s through the extension's own
`scanWorkspace` path, with git evidence on. Both are under the 3-second auto-rescan
threshold, so the extension rescans on save on a real application repository —
which is the case that decides whether anyone keeps it installed. Flag counts and
all three findings unchanged.

AcmeNav had previously been observed at about 13 seconds and now publishes its
first diagnostic in about 1.7 in a real VS Code. The reviewer is right that this
is not a controlled comparison — different host, different caches — so treat the
1.29s figure as the measurement and the 13s as the reason to have looked.

Spring Boot at 6.4s remains over the threshold, so the guard rail still engages on
the largest repositories. That is the intended behaviour, not a remaining defect.

### Report and helper-coverage improvements — complete (2026-09-22)

Requested by the user after the package passed a few hundred downloads: "add
whatever you think is highest value". Chosen from a critical review in the same
session; the items that need a decision were not built and are listed below.

**Scan summary and debt ranking.** `debtScore` was calculated for every flag and
then never shown: output was an alphabetical inventory with findings at the end,
which answers "what flags exist" but never "how much of this is debt". The human
and Markdown reports now open with a headline (older than a year, never read by
code, read only by tests, unresolved keys) and the top flags by debt score, each
with the evidence behind its rank. `src/present/summary.ts` holds it, so every
frontend can render the same numbers. Two deliberate choices: a flag whose only
contribution is module spread is not ranked, and the ranking shows reasons rather
than flag-level confidence, because beside a finding's own confidence it read as a
contradiction (`low` in the ranking, `medium` on the finding, same flag).

**Declared helpers as plain functions.** Custom patterns matched only
`receiver.method(...)`. The commonest TypeScript helper is an imported function,
`isOn('checkout-v2')`, which was never read at all. Declared names now match bare
calls too, in all three languages. Built-in SDK methods still require a receiver.

**Helper pass-through.** The one unresolved key almost every wrapped codebase has
is inside its own helper — `isOn(key) { return client.variation(key, ...) }` —
and one unresolved key caps confidence for every flag in the repository. When the
helper is declared, that call is a pass-through: its callers are read one by one.
It is skipped only when the key is a bare parameter of the declared function and
is never assigned in it, so `key = 'team-' + key` or `'team-' + key` stays
unresolved. The CLI's unresolved-key section now tells the user this option exists.

**Attribution to the wrapped SDK.** Callers of a custom helper were labelled
`custom`, which counts as locally configured — so a helper wrapping LaunchDarkly
raised "absent from configuration" on every flag read through it, and age rules
never applied. Declaring the helper, which the new hint recommends, would have
made this worse. Now, when every declared helper is seen forwarding to the same
SDK, its callers are that SDK's references and the remote-provider rules apply.
Anything less attributes nothing.

Tests: `test/present/summary.test.ts`, `test/core/wrapper.test.ts` (member and bare
calls in every language, pass-through and its refusals, attribution and its
refusals). 608 across 35 files; corpus check shows no regression.

The follow-up work this slice surfaced is recorded, with the rest of the backlog,
in the next section.

### Next candidates — recorded 2026-09-22

Agreed with the user as the backlog after "Report and helper-coverage
improvements", and ordered by value. **Recorded, not scheduled:** take them one
slice at a time, in this order, before M11. Items in the second group need an
explicit user decision before any code is written; record the decision in
**Decisions already made** when it is made.

**Buildable now — no recorded decision changes.**

- [x] **Suggest the helper name — complete 2026-09-22.** An unresolved key that
      is a bare, never-reassigned parameter of a named function now carries
      `helperCandidate` (optional contract field, additive within 1.x). The CLI
      prints the function beside the call and a `customPatterns` snippet to paste;
      Markdown names the likely helpers. Nothing is attributed until the user
      declares it. A name shared with a built-in SDK method (`isEnabled`,
      `variation`, ...) is never suggested: declared, it would match that name on
      every receiver and bring back the Lombok false positives the import gate
      exists to stop. Also fixed on the way: Markdown called a repository whose
      only flag call was unresolved "No feature flags found", hiding the reason,
      and said "1 call site compute their". Corpus: suggestions appear only on
      genuine pass-throughs (the SDKs' own `boolVariation`, `getToggle`, ...), and
      the SDK-name guard removes `isEnabled`/`getVariant`.
- [x] **Spring `prefix` + `name` — complete 2026-09-22.**
      `@ConditionalOnProperty(prefix = "features", name = "checkout")` now reads
      `features.checkout`, as Spring does: the dot is added unless the prefix ends
      with one, every name in an array gets the prefix, a constant prefix resolves,
      and an unreadable prefix makes the whole key unresolved. Java and Kotlin.
      Corpus baseline raised deliberately: spring-boot 76 -> 78, togglz 31 -> 32,
      because distinct switches such as `togglz.enabled` and
      `togglz.console.enabled` had collapsed into one key `enabled`; two prefixed
      Togglz switches now also match their configuration.
- [x] **Debt ranking in VS Code — complete 2026-09-22.** The Feature Flags tree
      lists flags with a debt reason first, highest score first, then the rest by
      key — `arrangeFlags` in `model.ts`, fed by `src/present/summary.ts`, so the
      editor and the CLI rank identically. Ranked flags show `debt N` in their
      description and their reasons in the hover; a score is never shown without
      them. A title-bar button (`flagMarshal.toggleSort`) switches to name order
      without rescanning. The computed-key note names a helper to declare when the
      scan found one. Verified in a real VS Code 1.137: 8 integration tests pass.
- [ ] **Single-pass git evidence — measured 2026-09-22, deferred until a
      repository shows the cost.** Full togglz history (1,764 commits): git adds
      0.6s to a scan (2.53s -> 3.12s), about 0.1s per pickaxe. A synthetic
      5,000-commit, 200-flag repository: about 1s. The "minutes on a deep history"
      in Known debt was an estimate and nothing measured reproduces it. The
      recorded fix is also a correctness risk: file-level dates are what the
      "History source" decision rejects. If a real repository does show the cost,
      the sound design is one streamed `git log -p --unified=0` pass computing
      pickaxe semantics for every key at once (a key's count differing between a
      hunk's `-` and `+` lines is exactly what `-S` tests), exposed as an optional
      batch method on the `GitHistory` port, falling back to per-key pickaxe on
      failure. Also check then whether the 5s per-pickaxe timeout silently drops
      age evidence on very large histories — that would be a confidence bug, not
      only a speed one.
- [x] **`flag-marshal init` — complete 2026-09-22.** Writes a starter
      `.flagmarshal.yml`: helpers the scan found (via `helperCandidate`) declared,
      every policy option and the flag manifest present and commented out, the
      Team requirement of `check` stated. Never overwrites — the CLI checks first
      and the Node writer uses `wx`, so a file created in between is still safe.
      Tests uncomment the template and run it through `readSettings`, so an
      example that stops validating fails the build. No real flag key appears in
      it. Verified from the assembled npm package.

**Reclassified 2026-09-22 after the move to one free tool:** the Free `check`
preview is moot — `check` itself is free — and the PR-scoped scan no longer has a
tier question, so it is buildable. The rest still needs a decision on its merits.

**Needs a user decision first — do not start without one.**

- [x] ~~**Free `check` as a report-only preview.**~~ Moot 2026-09-22: `check`
      and its non-zero exit are free for everyone.
- [ ] **Provider state export files.** Read a LaunchDarkly or Unleash export the
      user downloads (local file, no network). The only route to `HIGH` for
      remotely served flags: today they have at most two local signals, so "safe
      to delete" can never be shown for them. Sits close to "no provider API
      integrations".
- [ ] **PR-scoped scan, `--changed-since <ref>` — buildable since 2026-09-22.**
      Diff two inventories: "this change adds `checkout-v3` with no owner", "this
      change removes the last reference to `legacy-export`". No tier question
      remains. Useful locally and in anyone's own pipeline; building a CI
      integration around it is still out of scope.
- [ ] **Scope the unresolved-key cap.** An unresolved LaunchDarkly call cannot be
      an Unleash flag or a Spring property, but OpenFeature, custom helpers and
      Spring can front anything, so this helps mixed repositories only. Changes
      the recorded "Confidence capping" decision.
- [ ] **Python.** Probably the commonest unreadable language, but with no
      telemetry that is a guess. Build on an issue-form request, not on download
      counts.

**Not code — do before M12's listing copy.**

- [ ] **Verify the competition.** Design section 8's stop condition names Uber's
      Piranha and the vendors' own code-reference tools; LaunchDarkly's
      `ld-find-code-refs` is free and tracks references and removals. Never
      checked. If one covers the core value, it changes what is worth building.

### One free tool — complete (2026-09-22)

The user: "I no longer plan on adding the CI component, we can bake everything we
can into a free standalone runner." Done as one slice:

- **Removed:** `src/core/entitlement/` and its exports, every gate in the session,
  CLI, RPC server and VS Code (`requireEntitlement`, the ignored-custom-pattern
  warnings), `test/core/entitlement.test.ts`, the CLI's Free/Team tests, the
  GitHub Action (`action.yml`), its test, and `docs/ci.md`.
- **Now unconditional:** `check` with the baseline ratchet and exit code 2,
  `trend`, SARIF, Markdown, custom patterns.
- **Tests:** `cli.test.ts` "one free tool" runs every format and `check` with no
  configuration and asserts no output mentions a tier.
- **Docs:** README "Tiers" became "One free tool"; the npm README documents
  policy, `check`, `trend` and SARIF; AGENTS.md replaces the paid-tier rules with
  "no tiers" and "no dedicated CI product"; design sections 1, 2, 7, 8 marked
  superseded rather than deleted.
- **Verified by hand** from a clean workspace: `check` exits 2 with no baseline,
  `--update-baseline` accepts, a new violation exits 2, `trend` and SARIF run.

### Open-sourcing — if decided

Raised by the user 2026-09-22 as likely, **not decided**. Blockers found by audit,
to clear before any source goes public:

- [ ] **Customer data in code and history.** "AcmeNav"/"AcmeCo" appear in 14 files
      (fixtures, tests, source comments, docs), and
      `fixtures/real-world-shapes` holds a flag key from a customer repository.
      The name is in history too. Publish a **fresh repository from one scrubbed
      commit**, not this one; this repository stays the private archive.
- [ ] **Business material:** design sections 1, 2, 7, 8 and the roadmap's pricing
      and lead discussions stay private.
- [x] **Licence — MIT, decided by the user 2026-09-22.** `LICENSE` replaced with
      the MIT text (copyright StackBlender); `license: "MIT"` in the root,
      npm and VS Code manifests and the lockfile's root entry; both READMEs
      updated. Earlier published versions (0.1.0, 0.1.1) remain under the
      proprietary terms they shipped with.
- [ ] **Portfolio references** to `stackblender-operations` in AGENTS.md, design
      and roadmap.
- [ ] Add CONTRIBUTING and SECURITY; decide whether the public support repository
      folds into the new one.

### Open-source 0.1.3 — prepared (2026-09-22); publishing is the user's to run

The user created a new public repository, `StackBlender/flag-marshal`, and retired
the private one and the support repository: "we check everything into the new
repo… keep same versioning and point npm package to it."

- **Moved:** every tracked file of the old repository, plus the uncommitted 0.1.3
  work, copied into the new repository. Nothing ignored came across.
- **Folded in from the support repository, updated rather than copied:** issue
  forms (`.github/ISSUE_TEMPLATE/`), a PR template for code contributions,
  `SECURITY.md`, `SUPPORT.md`, a new `CONTRIBUTING.md` that accepts code under MIT,
  `docs/cli.md` covering every command now that all are free, `docs/privacy.md`,
  and `CHANGELOG.md` in place of its release-status page. Its old claims — Team
  capabilities, proprietary source, the Action — were not carried over.
- **Links:** `repository`, `homepage` and `bugs` point at the new repository; the
  npm README links its issue forms and security reporting. Both link guards
  (`test/package/npm-artifact.test.ts`, `scripts/test-npm-package.mjs`) now require
  the new repository and reject the retired one.
- **Version 0.1.3:** `package.json`, the lockfile, `CORE_VERSION`, and the goldens'
  `coreVersion`.
- **Verified** in a committed copy of the new tree: 616 tests, installed-tarball
  smoke test, packed manifest `0.1.3` / `MIT` / new-repository links.
- **Before the first commit** one test fails by design: "collects real git evidence
  for its own repository" needs the fixtures to exist in history.

### M11 — Refactor preview (dry-run only)
- [ ] For one language and one simple pattern, compute the resulting diff when a
      flag is resolved to permanently-on or permanently-off.
- [ ] Preview only. Never write files without an explicit, separate apply step.
- [ ] Refuse to preview when confidence is below `HIGH`.

### M12 — Publish the VS Code extension

Authorized 2026-09-11. The goal is **surface area**, not conversion. StackBlender
already ships OpenAPI Guard; a second listing under the same publisher reads as a
toolmaker rather than a side project, which is worth something to a lead who looks
the company up before a budget conversation.

This is a deliberate change of reasoning, not of evidence. Design section 2 still
records that a prior StackBlender dev-tool launch converted about one install, and
that remains the base rate for a listing treated as an *acquisition strategy*.
Listing as presence is a different and much cheaper bet: a few hours once, then
near-zero upkeep. Do not quietly re-read this milestone as evidence that
marketplace distribution works.

- [ ] `npm run package:vsix` producing a signed-off `.vsix` from `artifacts/vscode`.
- [ ] Claim the `stackblender` publisher id.
- [ ] Publish to the VS Code Marketplace.
- [ ] Publish the same `.vsix` to **Open VSX**. Cursor, Windsurf and VSCodium do
      not install from Microsoft's marketplace, and that audience skews toward
      people who try new dev tools. Second net, near-zero extra work.
- [ ] Listing copy states the limits out loud — four languages, no settings UI,
      whole-workspace scan. A listing is the version people judge you on and
      reviews are sticky. An honest limit reads as confidence; an oversold one
      earns the review where somebody's Python repo came back empty.
- [ ] ~~Before listing: the extension must name the next step.~~ Moot 2026-09-22:
      there is no paid tier to lead to. See "The funnel does
      not exist yet" below — without it this is a listing, not a funnel.

### M13 — IntelliJ plugin

Authorized 2026-09-11, after M12. Ordered second because it is the expensive one,
not the less valuable one — the opposite is true, and that is the tension to keep
in view.

**This is the editor the buyer actually uses.** The target org is Togglz, Java and
Spring; that audience lives in IntelliJ. So the plugin most likely to reach someone
who can approve a budget is the one that costs a milestone, while the cheap one
reaches an audience that may not include them. VS Code first is a sequencing
decision about cost, and it should not be mistaken for a judgement about reach.

- [ ] Blocked on the standalone Node-free binary, which is still deferred and still
      has the unsolved WASM-asset problem. That dependency is the whole cost of
      this milestone; resolve it first or the plugin cannot ship.
- [ ] Consumes the M9b RPC server and a bundled binary. It does **not** reimplement
      analysis natively — see design section 4 for why the OpenAPI Guard "no
      shelling out" rule does not carry over.
- [ ] Kotlin models generated from `schema/v1`, never hand-written.
- [ ] All wording from `messages.json` through the same shared presentation layer.

### Where paid features fit in a plugin — moot since 2026-09-22

There are no paid features. Kept as the record of the question.

Recorded because it was raised and is **not decided**. No licensing provider,
activation flow, or payment processor may be built on the strength of this section.

Both plugins are free-tier utilities, and that boundary already holds without
anyone designing it: Free is `scan`, `json-output`, `markdown-output` and
`custom-patterns` — exactly what the VS Code extension uses today. Team is the CI
governance that runs on every pull request. So the plugin is the diagnosis and the
paid tier is the enforcement.

**The funnel does not exist yet.** The extension never mentions that `check`,
baseline ratchet, trend or SARIF exist. A developer sees 17 flags and 3 findings,
feels a small "huh", and closes it. Nothing tells them the next move is CI and
nothing gives their lead something to buy. Free-tier-as-funnel only works if the
free tier makes the paid tier legible **at the moment the user feels the pain** —
which is precisely when that findings list is on screen. One honest sentence
pointing at the ratchet, shown then, is the whole mechanism. Doing M12 without it
produces a listing rather than a funnel.

Three ways the paid tier could reach a plugin, in the order they look defensible:

1. **Activation, not sale.** A team that already bought Team tier pastes its key
   into the plugin and sees policy violations, ratchet status and trend in the
   editor. This is retention and expansion rather than acquisition, and it gives
   the free tier an honest tease — "3 policy violations, available with Team" —
   without asking a developer to buy something they cannot approve.
2. **Sell the refactor preview.** The one dev-facing capability that is already
   Pro: M11's refactor preview maps to `migration-tooling`. It is individually
   valuable, editor-native, and needs no CI. If anything in a plugin is worth
   selling to the person holding the mouse, it is this — and it is already on the
   roadmap for other reasons.
3. **Sell governance in the plugin.** Weakest. It targets the wrong wallet: the
   developer who installs a plugin usually cannot approve a purchase, and team
   governance is a lead's decision. Ask a developer to buy it and the answer is "I
   will mention it to my manager", which is the funnel we already have.

**Mechanics, when a decision is made.** The VS Code Marketplace has no paid-extension
mechanism at all, so selling there means linking out — Gumroad, per the recorded
decision — and pasting a key into settings. The JetBrains Marketplace is different:
it has paid-plugin licensing built in, with JetBrains as merchant of record. That
is a genuine asymmetry in IntelliJ's favour, and it conflicts with the recorded
decision to use offline Ed25519 keys with no server. Do not resolve that conflict
by accident while building M13.

**What would settle it.** The same thing that settles the price question: one
developer outside StackBlender running this on their own repository unprompted, and
telling you what they wanted next. Both open questions have the same cheap
experiment behind them, and it is smaller than either milestone above.

### Deferred — not authorized
Standalone per-platform binary (Node SEA); moved out of M3 — see that milestone for
the rationale and the unsolved WASM-asset problem, and note that M13 is blocked on
it. LSP wrapper; additional languages (Python, Go, C#, Ruby); multi-repository
analysis; provider API integrations for runtime evidence; migration/audit tooling;
any billing implementation. Each requires an explicit decision recorded here.

---

## Definition of done (every slice)

1. Implement the smallest coherent outcome. One slice, not two.
2. Add or update proportionate automated tests.
3. Run the relevant suite and record the resulting counts.
4. Update **Current state** with status, test counts, decisions, limitations, and
   the next recommended slice.
5. Record any new architectural decision in **Decisions already made**.
6. Give concise manual verification steps and their expected results.
7. Suggest one Conventional Commit message. Do not create the commit.

Do not mark planned, partially implemented, or unverified work complete. If a slice
is abandoned mid-way, record what exists, what does not, and what the next agent
must know.

---

## Where work paused — 2026-09-11

> **Resumed 2026-09-22.** The licensing/gate deadlock below is dissolved: the user
> dropped the paid tier and made every capability free. The adoption question is
> moot for the same reason.

Read this before picking anything up. Nothing here is broken; the pause is the
user's, not a blocker.

**Code state.** All green and externally validated: 582 tests across 33 files, 8
integration tests in a real VS Code 1.137, no corpus regression across 12
repositories, production dependency audit clean. Everything through the scan
performance work is pushed to `origin/main`; the plugin-roadmap commit may still be
local — check `git status -sb` before assuming.

**The last external review round (round 8) found no correctness regressions.**
AcmeNav 17 flags / 38 production references, AcmeCo 10 / 23, all three expected
findings intact, hover renders correctly, both repositories now scan in about 1.3s
and 1.9s through the extension with git evidence on.

### An open-questions walkthrough was started and not finished

The user asked to work through the open questions in order of importance. **One was
discussed. Nothing was decided.** Do not treat anything below as an approved
decision — it is reasoning to pick up from, and the user may disagree with all of
it.

**Question 1, the licensing/gate deadlock.** A shipped build can run no Team
capability, while the validation gate asks you to show leads the paid tier and get
a price conversation. Discussion reached one reframe worth keeping: the deadlock is
mostly illusory. Gate items 2 (show ≥5 leads) and 3 (a price conversation) need a
*compelling artifact*, not a licensed binary — `check`, `trend` and SARIF can be
run today from a local build by injecting a Team entitlement service, and a
recording of a build failing on new flag debt is more persuasive than a CLI. Only
gate item 4, a team running `check` in their own CI, genuinely requires licensing.

Three paths were sketched, each gated on the one before, **none authorized**:
C, demo from a local build, zero code; B, a loud opt-in evaluation mode that
returns `team` and prints an unmissable unlicensed banner, roughly an afternoon,
worth building when a lead agrees to a trial; A, the real offline signed keys,
worth building when someone wants to pay — because the key payload has to encode
what is licensed (seat, repository, org, time window) and none of that is known
before a price conversation. Building A first means guessing a pricing model and
baking the guess into every key ever issued. Open sub-question if B is ever built:
does evaluation mode ship in the public npm package, or only in a build handed to a
trial team?

**A follow-up question the user asked and did not resolve:** whether to wait for
free-tier npm adoption before any of this. The argument given against waiting was
that the portfolio rule already states downloads are not evidence of paid demand;
that "took off" has no actionable threshold given no telemetry and mirror-dominated
npm counts; that nothing currently drives adoption at all, so takeoff is something
to cause rather than wait for; and that the design's acquisition path is push — a
developer forwards the number to a buyer — which starts with a person, not a
counter. The user declined to record this as a decision. **It is therefore still
open**, and a future agent must not cite this paragraph as settled.

**Questions 2 onward were never reached.** The full list is in the session that
produced this note; the material is all in this file's Known debt table, design
section 8's gate, and the "Where paid features fit in a plugin" section above.

### If you are resuming

The cheapest high-value action remains unchanged and needs no code: a second
platform lead, other than the original contact, looking at a report. Gate items 2
and 3 both turn on that, and every commercial question downstream turns on them.

## Known debt and limitations

Maintained as the project progresses. Rows are removed when the slice that addresses them lands.

| Item | Impact | Slice that would address it |
| --- | --- | --- |
| **Standalone binary not built** | IntelliJ cannot bundle an engine without Node; `npx` users are unaffected | The IntelliJ frontend slice, or earlier if a user needs Node-free distribution |
| No provider config files are read | An Unleash or LaunchDarkly export would give a second configuration source | M6 or later |
| **Git evidence is O(flags x commits)** | One pickaxe per flag, eight in parallel. Measured 2026-09-22: +0.6s on togglz's full 1,764-commit history, ~1s for 200 flags over 5,000 synthetic commits. Unmeasured on very large histories. `--no-git` is the escape hatch | One streamed `git log -p` pass computing pickaxe semantics for all keys, if a repository shows the cost; see "Next candidates" |
| **Branch complexity not measured** | The debt score omits how tangled a flag's conditionals are | M11, which needs the same AST context for refactor previews |
| **`HIGH` confidence unreachable for remote SDK flags** | At most two local signals exist for LaunchDarkly, OpenFeature and Unleash flags, so "safe to delete" can never be shown for them | Provider state export files, needs a decision; see "Next candidates" |
| Unresolved-key cap is repository-wide | One computed key anywhere caps every flag's confidence. Declared helper pass-throughs no longer count | Decision on scoping; see "Next candidates" |
| A declared custom name can collide with an SDK method | Declaring `isEnabled` by hand matches every `.isEnabled(...)` in the repository, Lombok setters included. Suggestions avoid this; hand-written config is not checked | Warn in settings validation, demand-driven |
| Helper attribution needs the helper's body | A helper defined in a dependency, or wrapping two SDKs, keeps its callers labelled `custom`, so "absent from configuration" can still fire for remote flags read through it | Demand-driven |
| Python, Go, C#, Ruby and others still cap confidence | Correct, but a polyglot repository cannot reach `high` | Demand-driven; each is an additive grammar entry |
| Custom patterns match calls only | Member and bare calls are matched; a homegrown annotation or config shape is not configurable | Demand-driven |
| Detection requires an SDK import **and** a bound receiver | A file handed an already-constructed client is missed. Declaring the team's helper under `customPatterns` recovers the common case | Type resolution, if demand shows it matters |
| **Integration tests need a display and a download** | `npm run test:integration` fetches VS Code (cached in `.vscode-test/`) and runs Electron; headless CI needs `xvfb-run`. Kept out of `npm run check` so that stays fast and offline | Nothing; this is the cost of testing inside a real editor |
| **Dev-only advisories from `@vscode/test-cli`** | Its bundled mocha pulls vulnerable `diff` and `serialize-javascript`. They run only on a developer's machine and reach no artifact; the production audit in CI is `--omit=dev` and stays clean | Upstream, or drop the runner if it stops being maintained |
| Constant resolution is not scope-aware | A name reassigned in any scope disqualifies it everywhere in the file — deliberately blunt, erring unresolved | Demand-driven |
| No cross-file constant resolution | A key exported from another module stays unresolved | Demand-driven; correctness prefers the miss |
| Unsupported-platform list is a fixed set of markers | A platform not on the list is still invisible | Demand-driven |
| Togglz enum aliases and re-exports not followed | Resolution is import- and package-based, not full type resolution | Demand-driven |
| Programmatic `FeatureManager` registration unsupported | Flags registered in code rather than declared are invisible | Demand-driven |
| Severity map not configurable | Every rule has a fixed severity | Demand-driven |
| Policy is repository-wide | No per-directory or per-team override | Demand-driven |
| Kotlin model generation is unproven | The schema is designed for it but no Kotlin generator has been run against it | The IntelliJ frontend slice |
| TypeScript pinned `<6.1.0` | Cannot adopt TypeScript 7 until typescript-eslint widens its peer range | Revisit when typescript-eslint supports TS 7 |
