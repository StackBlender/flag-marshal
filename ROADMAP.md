# Flag Marshal roadmap: v1

A local-first command-line and CI tool that finds stale, dead, duplicated and undocumented feature flags, shows the evidence behind each finding, and enforces flag policy in CI. README: [README.md](README.md). Rules: [AGENTS.md](AGENTS.md). Design: [docs/design.md](docs/design.md). CLI: [docs/cli.md](docs/cli.md). CI: [docs/ci.md](docs/ci.md). Proposals: [docs/roadmap/proposals/](docs/roadmap/proposals/README.md). Findings: [docs/findings/](docs/findings/README.md).

## Next

1. Prepare the release of the work merged since 0.2.0: the maximum-age findings `flag.too-old` and `flag.age-unknown`, Unleash export reconciliation, settings problems printed by `scan`, the product homepage in the npm manifest, and the CI recipe's job-summary fix. Done when `CHANGELOG.md` lists them under the new version, `package.json`, `CORE_VERSION` and the goldens agree, and `npm run check`, `npm run build` and `npm run test:npm-package` pass. Publishing stays the owner's.
2. Run the GitLab recipe in [docs/ci.md](docs/ci.md) in a real merge-request pipeline, and the SARIF upload on GitHub. Needs a hosted GitLab project from the owner, who deferred it (2026-10-14). Done when both render as `docs/ci.md` says, with evidence beside [docs/evidence/ci-github-2026-10-14/](docs/evidence/ci-github-2026-10-14/README.md), or the recipe is corrected.
3. Make this repository the source of the website's Flag Marshal docs: move them to `docs/site/` and list them in the website's `docs-sources.json`. Done when the website builds its Flag Marshal pages from this repository and its hand copies are gone.

## Decisions

Product (owner):

- 2026-09-09, owner: build Flag Marshal as designed in [docs/design.md](docs/design.md): TypeScript on Node, distributed on npm and run with `npx`; CLI `flag-marshal`, short alias `marshal`.
- 2026-09-22, owner: one free standalone tool. Every capability on every installation; no tiers, licence keys or accounts. See [the superseded tier design](docs/findings/2026-09-10-tiers-and-licensing.md).
- 2026-09-22, owner: MIT licence from 0.1.3; 0.1.0 to 0.1.2 stay under the proprietary terms they shipped with.
- 2026-09-22, owner: the source lives in the public `StackBlender/flag-marshal` repository with the same versioning; the private repository and `flag-marshal-support` are retired. See [the finding](docs/findings/2026-09-22-open-source-fresh-repository.md).
- 2026-10-07, owner: "scrap the extension completely and only focus on the cli / ci tool support". No editor frontends; CI support is in scope; marketplace publishing, accounts and hosted checks stay the owner's. See [the finding](docs/findings/2026-10-07-editor-frontends-removed.md).
- 2026-10-07, owner: the public repository may describe unreleased behaviour before it reaches npm.
- 2026-10-07, owner: a refactor preview is gated on the rewrite being exact, not on `HIGH` staleness confidence. The user picks the value; the preview never claims the flag is safe to remove; staleness confidence is shown beside it.
- 2026-10-14, owner (approved in review, FLAG-MARSHAL-586): read a local Unleash export as provider state (`--unleash-export`, `providerState` in `.flagmarshal.yml`). Its entries are leads: no findings, never "safe to delete", no change to what `check` enforces. See [docs/cli.md](docs/cli.md).
- 2026-09-09, owner: not authorized without the owner: a hosted backend, provider API integrations, publishing (npm, releases, marketplaces). See [AGENTS.md](AGENTS.md).

Architecture (stream, under the approved design):

- 2026-09-10: `core/` imports no CLI, editor, platform or network API and emits structured issues only; frontends import `core/api` only. Enforced by ESLint and, authoritatively, `test/architecture/`.
- 2026-09-10: zero network calls in core, enforced by a guard test. Flag keys never reach logs, errors or telemetry.
- 2026-09-10: all human-facing strings come from `catalog/messages.json` through `src/present/`; no frontend reads the catalog directly.
- 2026-09-10: `schema/v1/scan-report.schema.json` (one file, `$defs`) is the source of truth; generated types are committed, and staleness is a test failure.
- 2026-09-10: contract policy: 1.0 was mutable until first release; added fields are always optional; a breaking change bumps the major.
- 2026-09-10: positions are 0-based line and UTF-16 column, as tree-sitter emits them; frontends convert at their edge (SARIF is 1-based).
- 2026-09-10: grammars are WebAssembly through `web-tree-sitter`, never native bindings; `@vscode/tree-sitter-wasm`, plus `@tree-sitter-grammars/tree-sitter-kotlin`.
- 2026-09-10: the core touches no workspace directly: frontends supply `FileSystem`, `GitHistory` and baseline I/O. The parser pool reads only bundled grammars.
- 2026-09-10: nested `.gitignore` patterns are scoped to their directory; symlinks are never followed.
- 2026-09-10: shared golden fixtures are the conformance suite; goldens pin detection only, with `root` as the fixture name, and scoring is asserted by unit tests.
- 2026-09-10: a corpus of two public repositories per provider plus two that must stay silent, not checked in; only `corpus-baseline.json` is committed. See [the finding](docs/findings/2026-09-10-corpus-regression-suite.md).
- 2026-09-10: anything asking "what does this code declare" is a tree-sitter query, never a regex. See [round 6](docs/findings/2026-09-10-detector-round-6.md).
- 2026-09-10: a provider is data (id, method names, languages); broken queries are skipped at runtime and every query is compiled against every grammar in CI.
- 2026-09-10: a provider call needs the provider's import **and** a receiver bound to it (declared type, typed parameter, factory call or constructor); a receiver containing a call is rejected. Supersedes method-name matching ([round 1](docs/findings/2026-09-10-detector-round-1.md)).
- 2026-09-10: never guess. Computed keys are reported unresolved; unverified calls are omitted entirely.
- 2026-09-10: constant keys are read from the parse tree, only for immutable bindings (`final`/`const`/`val`, or a local never reassigned in the file); a Java field must say `final`; a pass that cannot see the writes calls nothing constant.
- 2026-09-10: Togglz keys are enum constants and `NamedFeature("literal")`; `togglz.features.<K>.enabled` normalizes to `<K>`. Enums need real `org.togglz` evidence, are found by a first pass, and are identified by package-qualified name; ambiguity means unresolved.
- 2026-09-10: `declaration` is its own `ReferenceKind`: inventory, never usage. Test-local enums do not establish inventory.
- 2026-09-10: `@ConditionalOnProperty` arrays expand to one reference per literal; `matchIfMissing` is `defaultsWhenAbsent`.
- 2026-09-10: a config boolean under a flag namespace stands alone; under any other namespace it counts only when code reads it. YAML keys flatten to the dotted form.
- 2026-09-10: remotely served providers (LaunchDarkly, OpenFeature, Unleash) never raise `flag.missing-in-configuration`.
- 2026-09-10: age-based rules only for providers implying temporary intent (LaunchDarkly, OpenFeature, Unleash, Togglz); Spring, properties and env switches are operational.
- 2026-09-10: unsupported platforms are disclosed in every output format.
- 2026-09-10: confidence (`HIGH`/`MEDIUM`/`LOW`/`UNKNOWN`) and evidence on every finding. Unparsed languages or any unresolved key cap `flag.absent-from-code` at `low`.
- 2026-09-10: git history comes from `git log -S` pickaxe, never file timestamps; keys are argv entries; age and dormancy are one signal. `--no-git` makes output byte-stable.
- 2026-09-10: score and confidence are separate axes; the module is the package after stripping build scaffolding.
- 2026-09-10: `scan` always exits 0 and reports; `check` enforces policy findings only (always `high`), never drift. Exit codes: `0` ok, `1` usage error, `2` policy breach.
- 2026-09-10: baseline and ratchet: CI fails only on new debt; violation identity is `id:flagKey`, excluding position. Directives name their flag; the manifest wins on conflict.
- 2026-09-10: trend comes from the committed baseline's own git history. No database, ever.
- 2026-09-10: SARIF and catalog `rule` text is placeholder-free; `title` describes one instance.
- 2026-09-10: npm boundary: the repository root is private; `scripts/assemble-npm-package.mjs` generates the allowlisted public artifact from `npm-package/`. See [the finding](docs/findings/2026-09-10-npm-publication-boundary.md).
- 2026-09-10: CI checks out with `fetch-depth: 0`; git history is analysis input.
- 2026-09-10: Vitest, tests in `test/` mirroring `src/`; ESLint flat config with typescript-eslint; Prettier, markdown excluded. `tsconfig.json` type-checks with `noEmit`, `tsconfig.build.json` emits `dist/` from `src/`.
- 2026-09-22: only flags with a debt reason are ranked (old, dormant, never read, test-only, unconfigured); module spread alone never earns a rank. A rank shows reasons, never a second confidence.
- 2026-09-22: declared helper names match bare and member calls; bare calls stay rejected for built-in SDK methods. A call whose key is a bare, never-reassigned parameter of a declared helper is a pass-through.
- 2026-09-22: helper callers are relabelled to an SDK only when every declared helper forwards to that one SDK. Helper suggestions never name a built-in SDK method and attribute nothing.
- 2026-09-22: Spring `prefix` composes as Spring does; an unreadable prefix makes the key unresolved.
- 2026-09-22: `init` writes only when no settings file exists and switches nothing on.
- 2026-10-07: `--changed-since` compares the working tree with the **merge base** of the ref and `HEAD`, through a git-object `FileSystem`; both scans share one history and one "now". Changes are optional `changes` on `ScanReport`.
- 2026-10-07: `check --changed-since` replaces the baseline with the merge base; a baseline file is not read.
- 2026-10-07: preview scope and mechanics: TypeScript and JavaScript; reads that are the whole condition of an `if` or `?:`, or a single-declarator `const` used only that way; anything else refuses the whole preview, naming each place, with exit code `3`. One site at a time with a re-scan between. See [the finding](docs/findings/2026-10-07-refactor-preview.md).
- 2026-10-07: preview types are hand-written in `src/core/refactor/preview.ts`, not yet in `schema/v1`.
- 2026-10-07: a shallow clone counts as no history. See [CI support](docs/findings/2026-10-07-ci-support.md).
- 2026-10-07: TypeScript pinned `<6.1.0`, because typescript-eslint 8.x does not accept TypeScript 7.

## Known debt

- The work merged on 2026-10-14 is unreleased and missing from `CHANGELOG.md`: npm users do not have it (Next 1).
- The GitLab recipe and the SARIF upload have never run in a real pipeline: the Code Quality widget is taken from GitLab's documentation (Next 2).
- The website's Flag Marshal docs are hand copies: they drift from [docs/cli.md](docs/cli.md) (Next 3).
- `HIGH` confidence is unreachable for remote SDK flags: at most two local signals exist for LaunchDarkly, OpenFeature and Unleash, so "safe to delete" can never be shown; the Unleash export adds leads, not signals.
- No LaunchDarkly export is read: Unleash is the only provider state source.
- The unresolved-key cap is repository-wide: one computed key anywhere caps every flag's confidence (declared helper pass-throughs excepted).
- Git evidence is one pickaxe per flag, eight in parallel: unmeasured on very large histories, and the 5s timeout may silently drop age evidence there. `--no-git` is the escape hatch. See [the proposal](docs/roadmap/proposals/2026-09-22-single-pass-git-evidence.md).
- Branch complexity is not measured: the debt score omits how tangled a flag's conditionals are, though the preview's `locateSite` has the AST context.
- No standalone binary: a CI image without Node needs Node first. See [the proposal](docs/roadmap/proposals/2026-09-10-standalone-binary.md).
- A declared custom name can collide with an SDK method: declaring `isEnabled` by hand matches every `.isEnabled(...)`, Lombok setters included; hand-written config is not checked.
- Helper attribution needs the helper's body: a helper in a dependency, or wrapping two SDKs, keeps callers `custom`, so "absent from configuration" can fire for remote flags.
- Python, Go, C#, Ruby and others are unread: a polyglot repository cannot reach `high`.
- Custom patterns match calls only: a homegrown annotation or config shape is invisible.
- A file handed an already-constructed client without importing its type is missed; declaring the team's helper recovers the common case.
- Constant resolution is file-local and not scope-aware: a name reassigned in any scope is disqualified everywhere in the file, and a key exported from another module stays unresolved.
- The unsupported-platform list is a fixed set of markers: an unlisted platform is invisible.
- Togglz: aliases and re-exports of an enum are not followed; `NamedFeature` subclasses and programmatic `FeatureManager` registration are invisible.
- The preview leaves imports, clients and newly unreachable code; it refuses `else if`, braceless bodies and `&&`/`||` conditions, and costs one full scan.
- Severity is fixed per rule and policy is repository-wide: no configurable severity map, no per-directory or per-team override.

## Ideas

Not scheduled; each needs the owner's decision.

- Single-pass git evidence, if a repository shows the cost. Proposal: [docs/roadmap/proposals/2026-09-22-single-pass-git-evidence.md](docs/roadmap/proposals/2026-09-22-single-pass-git-evidence.md).
- Standalone per-platform binary, if a CI image without Node matters. Proposal: [docs/roadmap/proposals/2026-09-10-standalone-binary.md](docs/roadmap/proposals/2026-09-10-standalone-binary.md).
- A pull-request comment recipe that updates one comment instead of adding one per push (needs a `gh` version check).
- Read a LaunchDarkly export as provider state, as the Unleash export is read.
- Scope the unresolved-key cap by provider: helps mixed repositories only, and changes the confidence-capping decision.
- Python, built on an issue-form request rather than a guess; then Go, C#, Ruby.
- Verify the competition named in design section 8 (Uber's Piranha, LaunchDarkly's free `ld-find-code-refs`): if one covers the core value, it changes what is worth building.
- Multi-repository analysis; provider API integrations for runtime evidence (opt-in network); migration and audit tooling.
