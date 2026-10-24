# Flag Marshal — product and technical design

Flag Marshal is one free, MIT-licensed command-line and CI tool: every capability runs on every
installation (owner, 2026-09-22), and there are no editor frontends (owner, 2026-10-07). Product name
**Flag Marshal**, npm package `@stackblender/flag-marshal`, CLI `flag-marshal` with the short alias
`marshal` (see [Naming](#10-naming)). This design and the [roadmap](../ROADMAP.md) are the source of truth
for this repository; portfolio priority lives in the private `stackblender-operations` repository.

## 1. The case

Feature flags are created constantly and removed almost never. A flag that shipped
a rollout eighteen months ago is still in the code, still evaluated on every
request, still branching, still carrying a dead path that no test exercises and no
one is willing to delete because no one can prove it is dead.

Every engineering organization knows this. Almost none of them fix it, because the
work is unrewarding, the risk of deleting the wrong branch is real, and nobody owns
the problem.

What makes this a business rather than a nice idea is that flag debt, unlike most
code-quality problems, **has a dollar amount attached to it**:

- **The flag vendor bill.** Commercial flag platforms price on seats, monthly active
  users, and plan tier, and flag volume pushes teams upward. "You are paying to host
  200 flags; 140 have been permanently enabled for more than a year" is a sentence
  that changes a renewal negotiation. *(Verify current LaunchDarkly and Unleash
  pricing mechanics against official pricing pages before using any specific claim
  externally. Do not publish a savings number that has not been reproduced.)*
- **Incident risk.** Stale flags cause outages. A dormant flag flips during a config
  change, a dead branch executes for the first time in a year, a kill switch no one
  tested fails open. These produce postmortems, and postmortems unlock tooling
  budget in a way that "our code is untidy" never does.

This is the difference between Flag Marshal and a general code-quality tool. The cost
is legible to someone with a budget.

### Why this is defensible against coding agents

An agent can already delete a flag branch on request. It cannot cheaply tell you
*which* of your 200 flags is safe to delete, because that requires a cross-repository
index, git history, configuration reconciliation, and a policy about what "stale"
means in your organization.

So Flag Marshal does not sell the edit. It sells the **inventory, the evidence, and the
enforcement**, and it emits structured output an agent consumes to perform the edit.
The agent is a distribution channel, not a competitor.

### Why governance, not cleanup

Cleanup is a low-frequency job. A team purges flags once a quarter, under duress,
before an audit or a renewal. A tool for a four-times-a-year job has no renewal
logic and cannot support a subscription.

Prevention has a trigger on **every pull request**: a new flag must have an owner
and an expiry date, and the repository's total flag debt must not increase. That is
a policy running continuously in CI, with a named owner who wants it enforced.

`scan` produces the moment of alarm; `check` makes sure it never happens again.

## 2. Users and evidence

**Who acts on it:** a platform, developer-experience, or engineering-productivity lead accountable for
codebase health across teams. Individual developers run `scan`, generate the alarming number, and forward
it; the lead puts `check` in CI.

**Evidence:** one platform lead, after seeing it run on their own Togglz repositories, valued the gap
detection. A prior StackBlender dev-tool marketplace launch converted about one install, so a listing is
not a distribution plan. Nothing here is validated demand.

### What the Togglz signal means

Togglz is free, self-hosted and Apache-licensed: there is no vendor bill to cut. For a Togglz shop, what
remains is incident risk and governance, so the pitch is prevention ("stop flag debt accumulating": every
flag gets an owner and an expiry, and CI keeps the number from rising), not cost recovery. Commercial
platforms (LaunchDarkly, Split, ConfigCat) bill by seats and flag volume, where section 1's bill argument
holds. A migration aid (Togglz to OpenFeature: inventory every flag, rewrite every call site) is a
possible later use of the same inventory.

## 3. Scope

### In scope for v1

Find feature-flag technical debt and provide the evidence needed to remove it safely.

### Explicitly out of scope

- Hosting, serving, or evaluating flags. This is not a flag platform.
- Replacing LaunchDarkly, Unleash, or OpenFeature.
- General-purpose dead-code detection or a broad code-quality suite.
- Any deployment platform or hosted service.
- Automatically applying destructive refactors without a previewed, reviewable diff.

### The local-first constraint

Analysis runs entirely on the developer's or CI runner's machine against a local
checkout. v1 requires **no StackBlender-hosted backend**: no database, no persistent
servers, no source upload, no background cloud processing. This keeps infrastructure
cost near zero and makes the privacy story simple enough to pass a security review
without a questionnaire.

Optional provider integrations (section 9) are the only future network surface, they
are opt-in, and they never transmit source code.

## 4. Architecture

### The central decision: broad detection, narrow refactoring

Inventory and governance need to cover **every language in the repository** to be
credible — a platform lead will not pay for a tool that reports on 40% of the flags.
Refactoring needs deep semantic understanding of **one language at a time**.

These have completely different cost curves, so they are separate layers:

- **Detection is broad and shallow.** Finding a flag reference is largely "locate
  calls to known SDK methods and extract the string-literal key," plus configuration
  file parsing. This is tractable across many languages with tree-sitter grammars
  and does not require full type resolution.
- **Refactoring is narrow and deep.** Rewriting a conditional requires real AST
  semantics, and is added one language at a time, demand-driven.

The broad layer carries the product's value; refactoring (the `preview` command) is TypeScript and
JavaScript only.

### Component boundary

```text
src/core/        # no I/O beyond provided ports (FileSystem, GitHistory); no CLI, editor or network API
├── api/          # AnalysisSession: the only public surface
├── detect/       # tree-sitter grammars + provider adapters
├── config/       # yml, properties, .env, provider state readers
├── refindex/     # flag key -> reference sites, normalized FlagRecord
├── evidence/     # git history, reference counts, module spread, test-only detection
├── score/        # debt scoring + explicit confidence levels
├── rules/        # findings
├── policy/       # owner/expiry rules, budget, baseline + ratchet
├── compare/      # --changed-since
├── refactor/     # preview
└── workspace/
src/present/     # catalog text and evidence rendering, shared by every output format
src/frontends/   # cli/ and node/ (the Node ports)
```

The core emits **structured issues only**; human-readable strings come from the catalog through
`src/present`. The core must never import a CLI, editor, or platform API.

### Implementation language and distribution

**TypeScript on Node, distributed via npm**, executable as `npx flag-marshal`.

Rationale:

- CI installation friction is the single biggest adoption risk. `npx` is the
  lowest-friction install that exists for a polyglot team.
- tree-sitter has mature Node bindings and grammars for every language in scope,
  giving broad detection without a per-language parser project.
- It reuses StackBlender's existing TypeScript/Node static-analysis competency and
  the core/CLI architecture already built once.

Alternatives considered and rejected for v1: a JVM implementation (better Java/Kotlin
depth, much worse CLI and CI distribution, wrong for a polyglot buyer); a Go binary
(best distribution, weakest ecosystem reuse, no existing competency); per-language
native parsers (rejected — this is exactly the cost tree-sitter exists to avoid).

### Establishing provider identity

A call is only attributed to a provider when the file **imports** that provider.

Matching on method name alone fails on real repositories: `isEnabled` is a Lombok builder setter, `getStringValue` is a helper
on an intake form, `variation` is a method on a pricing plan. Reporting those as
feature-flag debt is not a harmless false positive — it is the tool announcing
that it does not understand the code, which is fatal for a product whose value is
being right about what is dead.

Only import and require statements are read, so a provider mentioned in a comment
or a string constant unlocks nothing. Spring's `@ConditionalOnProperty` needs no
gate; the annotation name is specific enough on its own. User-configured custom
patterns need no gate either, because the team has asserted those are their flag
helpers.

An import alone is not enough, though. A file can import Unleash *and* build a
Lombok object whose setter is called `isEnabled`. So the call's receiver must also
be an identifier the file binds to that provider — a declared field, a typed
parameter, or an assignment from a known factory. A receiver that is itself a call,
or a bare call with no receiver, is rejected.

The deliberate cost is a file that receives an already-constructed client without
importing its type. That flag is missed. Under the principle in section 5 — never
claim more than the evidence supports — a clear miss beats a confident error.

### Operational switches are not feature flags

`@ConditionalOnProperty` proves something is conditional, not that it is temporary.
A queue listener, a scheduled job, or non-production basic auth is a permanent
deployment control, and telling a team their queue listener is "stale" after a year
is noise they cannot act on — the only remedy would be allowlisting nearly every
job they run.

Age-based rules therefore apply only to providers that imply an intention to remove
the branch later: LaunchDarkly, OpenFeature, Unleash, Togglz. Rules grounded in
something other than age — configured but never read, referenced only from tests —
apply everywhere.

### Saying what was not analyzed

A report that lists one flag for a repository running nine behind an unsupported
platform is a confident wrong answer, and nothing about it looks wrong. When a flag
platform this build cannot analyze is imported, the report names it and states that
its flags are missing from the counts.

This is the same principle as never guessing a computed key, applied at the level of
the whole inventory rather than a single call site.

### Detection targets for v1

Provider adapters are the seam. v1 ships:

- LaunchDarkly SDK call patterns
- OpenFeature SDK call patterns
- Unleash SDK call patterns
- Spring `@ConditionalOnProperty`
- `application.yml` / `application.properties` boolean switches
- Environment-variable feature switches
- User-defined custom patterns via configuration (a homegrown `Features.isEnabled(...)`
  utility is extremely common and must be supportable without a code change)

Languages for v1 detection: TypeScript/JavaScript, Java, Kotlin. Python, Go, C#, and
Ruby are additive grammar work and are demand-driven, not speculative.

### Reuse across frontends

The rule that keeps output formats and any future frontend from diverging: **frontends are dumb
renderers of a versioned JSON contract, and nothing else crosses the boundary.**

| Layer | Contents |
| --- | --- |
| Analysis core | detect, config, index, evidence, score, policy |
| Public API | one `AnalysisSession` surface; frontends may import nothing else |
| Wire contract | versioned JSON schema plus the message catalog |
| Presentation | `src/present`: catalog placeholders filled, evidence rendered |

**One public API.** `core/api` exposes `AnalysisSession`: open a workspace, scan, query, check policy. A
lint rule and `test/architecture/boundaries.test.ts` enforce that frontends import only `core/api` and
never `core/detect`, `core/score`, or any other internal module.

**The schema generates the types.** `schema/v1/*.json` is the source of truth, and
every payload carries a `schemaVersion`. TypeScript types are generated from it and
committed; staleness is a test failure.

**Message catalog shipped as data.** The core emits structured issues and never
human-facing strings. A `messages.json` catalog maps issue id to template plus
arguments, and all frontends render wording from that one file. Without this, each
frontend accumulates its own copy of every message and they silently diverge; with
it, fixing a confusing message fixes it in every output format at once.

**Rendering the catalog is itself shared.** A catalog is not enough on its own: a
message declares placeholders like `{count}`, and something has to decide which
piece of evidence fills each one and how to phrase "introduced 14 months ago".
`src/present` holds that logic, so it is never copied. It sits between the core and the frontends: it may
import `core/api` and nothing deeper, may not import any frontend or editor API,
and produces text but never layout, so where those strings are arranged stays each
frontend's business. No frontend may import `messages.json` directly;
`test/architecture/boundaries.test.ts` enforces all four rules.

**Golden fixtures are the conformance suite.** The fixture corpus produces golden
JSON, and every output path tests against the same goldens.

**One-shot invocation.** `scan`, `check`, `trend` and `preview` serve CI, agents and people alike.

**Range encoding is specified once.** The contract declares one canonical form — 0-based line and
UTF-16 column with an explicit encoding field — and every output converts at its own edge (SARIF and
human output are 1-based).

## 5. Evidence and confidence

The product must never assert that a flag is safe to delete when it cannot know.
This is the credibility constraint; a tool that confidently recommends deleting a
live kill switch is uninstalled that day and never reinstalled.

**Local evidence** (available in v1, from the repository alone):

| Signal | Source |
| --- | --- |
| Reference count and reference sites | Detection index |
| Age since first introduced | `git log` first-seen commit for the key |
| Time since last modification | `git log` most recent touch |
| Declared in code but absent from configuration | Config reconciliation |
| Declared in configuration but never referenced | Config reconciliation |
| Referenced only from tests | Reference site classification |
| Module and package spread | Reference index |
| Branch complexity around the flag | AST shape at reference sites |
| Declared owner and expiry date | Flag metadata (section 6) |

**Runtime and provider evidence** (not available locally; provider integrations need the owner, section 9):
rollout percentage, archived-upstream status, recent evaluation activity, state
across environments.

**Confidence levels** are reported explicitly on every finding:

- `HIGH` — multiple independent local signals agree and no contradicting signal
  exists. Example: zero non-test references, absent from all configuration, and
  first introduced more than a year ago.
- `MEDIUM` — signals agree but coverage is partial, or the flag is referenced in a
  language the detector parses shallowly.
- `LOW` — one weak signal only, such as age alone.
- `UNKNOWN` — detection found the key but could not resolve enough to judge, for
  example a computed or non-literal flag key.

Non-literal and computed flag keys are **reported as unresolved, never guessed**.
This mirrors the rule OpenAPI Guard got right about computed paths, and it is the
main defense against the false positives that kill static-analysis tools.

No finding at any confidence level uses the words "safe to delete" unless it carries
`HIGH` confidence *and* the report states which evidence produced it.

## 6. Governance model

### Flag metadata

Flags acquire an owner and an expiry date, declared either inline at the definition
site by comment annotation or centrally in a manifest. Both are supported because
teams disagree about which they want, and the choice is not worth losing a customer
over.

### Policy file

A repository-root `.flagmarshal.yml` defines the policy: maximum flag age, whether an
owner is required, whether an expiry is required, the per-repository flag budget,
severity mapping, and allowlisted permanent flags (kill switches and licensing
gates legitimately live forever and must be declarable as such).

### Baseline and ratchet

**This is the single most important adoption mechanic in the product.** No team
adopts a CI check that fails on day one with 200 pre-existing violations; they
disable it and never return.

So the first CI run writes a **baseline** recording existing debt. CI then fails only
on *new* violations — a new flag without an owner, a flag past its declared expiry,
or a total that exceeds the baseline. Existing debt is grandfathered and burned down
deliberately. The ratchet means debt can only decrease.

`flag-marshal check` returns a non-zero exit code on policy violation and is the command
that runs in CI.

### Reporting

Trend history is derived from committed baseline files rather than a hosted database,
preserving the no-backend constraint. Reports render as Markdown for pull-request
comments, JSON for agents and dashboards, and SARIF for GitHub code scanning.

## 7. Licensing

MIT from 0.1.3; 0.1.0 to 0.1.2 stay under the proprietary terms they shipped with. There are no tiers,
licence keys, accounts or payment; do not build any without an explicit owner decision (AGENTS.md). The
published package is minified per file to strip comments, not as protection.

## 8. Competition

Uber's Piranha and the flag vendors' own code-reference scanners (LaunchDarkly's free `ld-find-code-refs`)
are asserted from memory and must be verified before positioning is written: if one covers the core
value, it changes what is worth building.

## 9. Privacy and security

- No source code, flag keys, configuration, findings, or repository metadata leave
  the machine.
- Enforced by a guard test that fails the build if a network client is introduced
  into the core.
- Flag keys can themselves be sensitive (they leak unreleased product names), so
  they are treated as confidential in all output paths, logs, and error messages.
- Optional provider integrations, if ever built, are opt-in, send only flag keys,
  never source, and require explicit user approval to design or implement.

## 10. Naming

**Decided: Flag Marshal.** Repository slug `flag-marshal`, npm package
`@stackblender/flag-marshal`; CLI `flag-marshal`, with `marshal` as a short bin alias.

Marshalling means imposing order on a disordered set, which describes the product's
job more accurately than cleanup metaphors do, and the enforcement connotation fits
governance rather than a one-time purge. It follows the
`[domain] + [role noun]` pattern already established by OpenAPI Guard without
reusing "Guard" — a shared family brand is deliberately deferred until something in
the portfolio has adoption worth inheriting.

Rejected: `DriftSweep` (collides with OpenAPI Guard's "drift" vocabulary, and
"sweep" implies the one-time cleanup framing this product explicitly does not sell);
`Flag Debt` (names the condition rather than the remedy); `Flag Sentry` (Sentry the
error-monitoring vendor); `Flag Ledger` (trademark exposure).

No software product, company, or trademark named "Flag Marshal" was found (2026-09-09). The unscoped
`marshal` npm package is a dormant Ruby-`Marshal` parser with no `bin`, so the bin alias collides with
nothing installable.

**One adjacent-mark caution:** SecConOne holds a family of `MARSHAL` trademarks —
MARSHAL, CYBER MARSHAL, ASSET MARSHAL, DEFENSE MARSHAL, INTEL MARSHAL, RISK
MARSHAL — covering security, compliance, vulnerability, and risk-management software
and consulting. That is an adjacent class to a developer governance tool rather than
the same product, and a package name is not a trademark filing. If StackBlender ever
registers a mark, have that family reviewed properly first. This note is not legal
advice.
