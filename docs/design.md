# Flag Marshal — product and technical design

Last updated: 2026-09-22

> **Direction changed 2026-09-22, by the user.** Flag Marshal is one free,
> standalone tool. There is no paid tier, no licensing, and no dedicated CI
> product; every capability runs on every installation, and the entitlement seam
> and the GitHub Action were removed. Sections 1, 2, 6 (its "paid core" framing),
> 7 and 8 are kept as the record of the reasoning that was abandoned, not as
> current direction. It is MIT-licensed from 2026-09-22; publishing the source is
> under consideration and not decided. The architecture, evidence, privacy and
> naming sections still apply.

Status: **approved to build.** Product name **Flag Marshal**, repository slug
`flag-marshal`, CLI `flag-marshal` with the short alias `marshal` (see
[Naming](#naming)). This design and the [implementation roadmap](../ROADMAP.md) are
the source of truth for this repository. The portfolio-level view lives in the
private `stackblender-operations` repository, not here.

The repository and public npm package now exist. Version 0.1.0 was the first public
release; 0.1.1 separates its customer-facing package material from this private
development repository. No license provider, deployment, or billing plan exists.

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

### Why the paid tier is governance, not cleanup

Cleanup is a low-frequency job. A team purges flags once a quarter, under duress,
before an audit or a renewal. A tool for a four-times-a-year job has no renewal
logic and cannot support a subscription.

Prevention has a trigger on **every pull request**: a new flag must have an owner
and an expiry date, and the repository's total flag debt must not increase. That is
a policy running continuously in CI, with a named owner who wants it enforced and a
natural per-repository price.

The free tier produces the moment of alarm. The paid tier makes sure it never
happens again.

## 2. Buyer and evidence

**Buyer:** a platform, developer-experience, or engineering-productivity lead at a
company with roughly 50–300 engineers — someone accountable for codebase health
across teams, who owns or influences the flag-platform renewal, and who has a
tooling budget.

**Not the buyer:** the individual developer. Individual developers install the free
CLI and IDE plugin, generate the alarming number, and forward it to the buyer. That
is the acquisition path, and the free tier exists to serve it.

**Evidence held today:**

| Evidence | Strength |
| --- | --- |
| One platform lead reviewed the concept and said they would buy it if budget exists | Real but conditional and single-source. Not a commitment, not a price test, not a purchase order. |
| The same lead, after seeing it run: gap detection is **appreciated**, but they are **unsure it would cost as much** with Togglz, given less monetary impact | The first direct price signal, and it is **negative on price while positive on value**. Same single source. See "What the Togglz signal means" below. |
| Flag debt is a widely documented industry problem | Background support only. Does not demonstrate willingness to pay StackBlender. |
| StackBlender's prior dev-tool launch converted approximately one install | Direct negative evidence about marketplace-listing distribution. Treat as the base rate to beat. |

The portfolio rule that page views, downloads, and desk research are not evidence of
paid demand still applies. Section 8 defines the gate that must clear before the
paid tier is implemented.

### What the Togglz signal means

The lead confirmed the value and questioned the price, in one sentence. Both halves
matter and they point in different directions.

**The value held.** Detection of real gaps was appreciated once they saw it against
their own code. That is the product working.

**The price did not.** Section 1 rests on flag debt carrying a dollar amount, and
the loudest part of that was the flag-platform bill. **Togglz is free, self-hosted
and Apache-licensed — there is no bill to cut.** What remains for a Togglz shop is
incident risk and governance: real, but neither is a line item, and this is exactly
the shape of cost that made API drift unsellable.

So the honest reading is: for a self-hosted-flag organization this is a governance
tool with a modest price ceiling, not a cost-recovery tool. That is a smaller
business than section 1 describes, and section 8's stop conditions name
"leads find the report interesting but not budget-worthy" — this is not yet that,
but it is the first movement toward it.

Three ways the product can respond. They are alternatives, not a sequence, and
choosing needs evidence this project does not have.

1. **Sell to commercial-platform shops instead.** LaunchDarkly, Split and
   ConfigCat all bill by seats and flag volume, so the section 1 argument works
   unchanged. It requires buyers outside this organization, which is precisely the
   validation that was waived.
2. **Reposition around prevention.** Drop the cost-recovery claim and sell the
   ratchet: flags get an owner and an expiry, and CI keeps the number from rising.
   Honest, and priced as governance tooling rather than as savings.
3. **Sell the migration instead of the subscription.** Togglz is largely dormant
   upstream, and OpenFeature is the CNCF standard many JVM shops are moving toward.
   A dated, expensive, time-boxed job — inventory every flag, rewrite every call
   site — is worth more to a Togglz shop than a recurring governance fee, and
   Flag Marshal's inventory plus call-site rewriting is the tool for exactly that.

The evidence remains **one person**. A second opinion, from someone who pays for a
commercial flag platform, would separate "Togglz shops will not pay much" from
"nobody will pay much" — and those imply completely different products.

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

Optional provider integrations (section 7) are the only future network surface, they
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

The layer that sells is the broad one. This is the design's most important property:
the technical shape and the monetization shape agree.

### Component boundary

```text
flag-marshal-core/           # no I/O beyond a provided filesystem port; no CLI, no IDE APIs
├── detect/               # tree-sitter language grammars + provider adapters
├── config/               # yml, properties, .env, provider config file readers
├── index/                # flag key -> reference sites, normalized FlagRecord
├── evidence/             # git history, reference counts, module spread, test-only detection
├── score/                # debt scoring + explicit confidence levels
├── policy/               # owner/expiry rules, budget, baseline + ratchet
└── report/               # structured issue model, no human-facing strings

frontends/
├── cli/                  # npx flag-marshal scan | report | check
├── vscode/               # thin frontend over core
├── intellij/             # later
├── github-action/        # thin wrapper over the CLI
└── mcp/                  # agent-callable adapter
```

The core emits **structured issues only**. Human-readable strings are produced in
frontends. The core must never import a CLI, editor, or platform API. This mirrors
the boundary already proven in `openapi-guard-vscode`, where `src/core` is forbidden
from importing the VS Code API, and it is what makes four frontends affordable.

### Implementation language and distribution

**TypeScript on Node, distributed via npm**, executable as `npx flag-marshal`.

Rationale:

- CI installation friction is the single biggest adoption risk for the paid tier.
  `npx` is the lowest-friction install that exists for a polyglot team.
- tree-sitter has mature Node bindings and grammars for every language in scope,
  giving broad detection without a per-language parser project.
- It reuses StackBlender's existing TypeScript/Node static-analysis competency and
  the core/CLI/MCP architecture already built once.
- A VS Code extension is then a thin frontend rather than a second implementation.

Alternatives considered and rejected for v1: a JVM implementation (better Java/Kotlin
depth, much worse CLI and CI distribution, wrong for a polyglot buyer); a Go binary
(best distribution, weakest ecosystem reuse, no existing competency); per-language
native parsers (rejected — this is exactly the cost tree-sitter exists to avoid).

The IntelliJ frontend, when built, talks to the core through the CLI's structured
output rather than reimplementing analysis. This is a deliberate departure from the
OpenAPI Guard IntelliJ decision, which chose native reimplementation; the difference
is that Flag Marshal's core is not tied to a JVM program model.

### Establishing provider identity

A call is only attributed to a provider when the file **imports** that provider.

Matching on method name alone was the original design, and real repositories
disproved it: `isEnabled` is a Lombok builder setter, `getStringValue` is a helper
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

Flag Marshal ships four frontends over one core. The rule that keeps them from
diverging: **frontends are dumb renderers of a versioned JSON contract, and nothing
else crosses the boundary.** Target is roughly 85–90% shared logic, with the
remainder being editor chrome measured in hundreds of lines per frontend.

| Layer | Shared | Contents |
| --- | --- | --- |
| Analysis core | 100% | detect, config, index, evidence, score, policy |
| Public API | 100% | one `AnalysisSession` surface; frontends may import nothing else |
| Wire contract | 100% | versioned JSON schema plus the message catalog |
| Presentation | 100% | `src/present`: catalog placeholders filled, evidence rendered |
| Transport | per family | direct import (VS Code), subprocess (CLI, CI), JSON-RPC (IntelliJ) |
| UI glue | 0% | gutter icons, tool windows, settings panels, marketplace metadata |

**One public API, four wrappers.** `core/api` exposes `AnalysisSession`: open a
workspace, scan, query, check policy. The CLI wraps it, the RPC server wraps it,
the VS Code extension imports it directly (same language, so no IPC and no
subprocess latency), and IntelliJ talks to the RPC server. A lint rule enforces that
frontends import only `core/api` and never `core/detect`, `core/score`, or any other
internal module. Reuse leaks the moment a frontend reaches past the API.

**The schema generates the types.** `schema/v1/*.json` is the source of truth, and
every payload carries a `schemaVersion`. TypeScript types and Kotlin models are both
generated from it, so the IntelliJ plugin never hand-writes a model that can drift
from what the core emits.

**Message catalog shipped as data.** The core emits structured issues and never
human-facing strings. A `messages.json` catalog maps issue id to template plus
arguments, and all frontends render wording from that one file. Without this, each
frontend accumulates its own copy of every message and they silently diverge; with
it, fixing a confusing message fixes it in all three surfaces at once.

**Rendering the catalog is itself shared.** A catalog is not enough on its own: a
message declares placeholders like `{count}`, and something has to decide which
piece of evidence fills each one and how to phrase "introduced 14 months ago".
That logic began in the CLI, which meant the second frontend's only option was to
copy it — and a copied vocabulary drifts exactly as fast as a copied catalog would.
`src/present` holds it instead. It sits between the core and the frontends: it may
import `core/api` and nothing deeper, may not import any frontend or editor API,
and produces text but never layout, so where those strings are arranged stays each
frontend's business. No frontend may import `messages.json` directly;
`test/architecture/boundaries.test.ts` enforces all four rules.

**Golden fixtures are the conformance suite.** The M1 fixture corpus produces golden
JSON, and every frontend tests against the same goldens. A frontend conforms if it
renders the golden set correctly. This is the only cheap mechanism that reliably
catches behavioral drift between three separate UIs.

**Self-contained binary.** The core compiles to a per-platform standalone executable
(Node SEA or an equivalent bundler-compiler). This is what makes JVM reuse viable:
the IntelliJ plugin bundles a binary and requires **no Node runtime on the user's
machine**. Requiring IntelliJ users to install Node would forfeit the audience.

> **Deliberate departure, recorded so it is not "corrected" later.** The OpenAPI
> Guard IntelliJ roadmap forbids shelling out to a Node CLI. That rule is correct
> *there*, because its analysis is bound to the JVM program model through UAST and a
> subprocess could not deliver incremental in-editor results. Flag Marshal's analysis
> is file-based and tree-sitter-driven and has no such binding, so the constraint
> does not carry over.

**Two invocation modes over the same core.** One-shot (`scan --json`, `check`) serves
CI, agents, and the GitHub Action. Long-running (`serve --stdio`, JSON-RPC) serves
editors that need incremental updates without spawning a process per keystroke.

**Range encoding is specified once.** IntelliJ uses character offsets, LSP uses
UTF-16 line/column, tree-sitter emits byte offsets. The contract declares one
canonical form — line/column with an explicit encoding field — and every frontend
converts at its own edge. Left unspecified, this produces off-by-one highlights that
are miserable to debug across three UIs.

**LSP is deferred, not rejected.** Diagnostics, navigation, and code actions map
cleanly onto the Language Server Protocol, and an LSP server would add Neovim, Zed,
Emacs, and Sublime at low marginal cost. It is deferred from v1 for two reasons:
IntelliJ's official LSP API is Ultimate-only, so Community support would depend on a
third-party plugin and add install friction to the free acquisition tier; and LSP is
a large investment serving the free tier while the paid product runs in CI. Build
`serve --stdio` with a clean RPC boundary so an LSP wrapper is additive later.

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

**Runtime and provider evidence** (not available locally, deferred to section 7):
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

## 7. Monetization — superseded 2026-09-22, see the note at the top

| Tier | Contents | Pricing hypothesis |
| --- | --- | --- |
| **Free** | `scan`, flag inventory, reference discovery, confidence-scored findings, **every supported provider**, JSON, human and Markdown output, custom flag patterns, editor plugin, MCP adapter | $0 — permanently. Acquisition and the agent channel. |
| **Team** | `check` policy enforcement, baseline and ratchet, `trend`, SARIF, GitHub Action | Recurring, per repository or per seat. Anchor to what the governance is worth, not to a bill it defends. |
| **Pro** | Team, plus provider API integrations (rollout percentage, archived-upstream, recent evaluations), organization-wide multi-repository rollup, migration and refactor tooling | Recurring, higher. The only tier with a network surface and the only one that costs anything to run. |
| **Migration / audit** | Full inventory, vendor-migration call-site rewriting, guided cleanup of an existing backlog | One-time, high ticket. Time-boxed engagement. |

### Why tiers are not split by flag provider

Willingness to pay clearly differs by segment, and the provider a team runs is a
fair proxy for it: a LaunchDarkly shop has a vendor bill and a budget, a Togglz
shop has neither. The obvious move is to gate detection by provider — free for one,
paid for the rest. It does not work, for three reasons.

**It kills acquisition.** The free tier exists so a developer installs the tool,
sees an alarming number, and forwards it to whoever holds the budget. A team that
cannot scan *their own* platform sees zero flags and uninstalls, so nobody ever
reaches a paid tier.

**Nobody can consume the extra providers.** A team runs one flag platform.
"Also supports Unleash" is worth exactly nothing to a Togglz shop, and the reverse.
Charging for capability a buyer structurally cannot use is charging for nothing.

**It has no answerable justification.** "Why does Unleash support cost more than
Togglz support?" has no honest answer — provider support is a fixed cost to
StackBlender, not variable value to the customer. Capability tiers survive the same
question easily: enforcement is worth more than diagnosis, obviously and to
everyone.

Commercial-platform shops still land in **Pro naturally**, because provider API
integrations only exist for platforms that expose an API. They pay more because
they get more — runtime evidence local analysis genuinely cannot produce, which is
the boundary section 5 already draws. No rule has to say so.

### Licensing mechanism

**Nothing below is implemented.** What exists today is the entitlement seam: a
`LicenseState` of `free | team | pro | unknown`, a capability map per tier, a
pluggable provider interface, and a single shipped `freeEntitlementProvider` that
always answers `free`. There is no key format, no verification, no payment
processor, and no billing configuration, and none may be built without an explicit
decision — see `AGENTS.md`.

When it is built, the design is **offline signed licence keys**, because the
local-first guarantee in section 9 forbids a verification server:

1. **One keypair, generated once.** Ed25519. The private key lives only in the
   fulfilment system; the public key is embedded in the published package.
2. **A purchase mints a token.** The fulfilment webhook signs a small payload —
   tier, customer, issue date, expiry, and the seat or repository count — and emits
   `payload.signature`, base64-encoded.
3. **The customer supplies it** through `FLAG_MARSHAL_LICENSE`, a path in
   `.flagmarshal.yml`, or a key file. An environment variable is what CI wants.
4. **Verification is local.** `node:crypto` verifies the signature against the
   embedded public key and checks the expiry against the system clock. No network
   call, no telemetry, no phone-home — it works air-gapped and in CI, which is
   exactly where this product runs.
5. **The tier comes from the payload**, and the entitlement provider returns it.

**What this deliberately is not.** It is not copy protection. The package is
readable JavaScript, so a determined user can share a key, patch the public key, or
set the clock back. Offline keys keep honest customers honest — the same bargain
JetBrains and Sublime make — and buy the ability to sell without operating
infrastructure. Treating it as enforcement would mean a licence server, which would
cost the local-first promise that makes this tool adoptable inside a security
review.

Two consequences follow and should be planned for rather than discovered:

- **Revocation is impossible offline.** Only expiry works, so keys are time-limited
  (annual) and reissued on renewal. A refunded or abused key stays valid until it
  expires.
- **An undetermined verdict grants Free**, never a paid tier and never nothing. A
  corrupt key file or an unreadable clock must not silently unlock Pro, and must
  not take away diagnosis the user already had.

**Selling it — decided 2026-09-10: Gumroad, as checkout only.**

A merchant of record rather than a raw payment processor, because they carry global
sales tax and VAT, which is the part a one-person business cannot sensibly operate.
Gumroad has been a full merchant of record since January 2025 and needs no company
approval to start.

Gumroad's own licence keys are **not** used. They are count-only, and validating
one is an API call to Gumroad — which breaks the local-only guarantee in section 9
outright and is hostile in CI, where this product runs on ephemeral machines that
may have no outbound network. Gumroad is reduced to a payment page: it takes the
money, its Ping webhook fires, and StackBlender mints and emails the signed key.
Gumroad never participates in verification.

The cost is roughly **13%** all-in — 10% + $0.50, plus Stripe processing on top —
against Paddle's ~5%. That is worth paying at low volume for zero setup and zero
tax work. Move to Paddle when a buyer needs a formal invoice, VAT ID capture or a
purchase order, or when volume makes the gap hurt. **Because the key format is
StackBlender's own, changing merchant never touches the product.**

No account, no login, no dashboard: the product never talks to StackBlender, so
there is nothing to log into.

### Do not inherit OpenAPI Guard's entitlement service

`openapi-guard-vscode` plans Gumroad **plus a StackBlender-operated entitlement
service** — activation, refresh, deactivation, a 14-day offline grace period, rate
limiting, key rotation, an outage procedure. That is a defensible design for an IDE
extension, where a person sits at a keyboard with a network connection.

**Flag Marshal must not adopt it.** This product runs in CI and promises no hosted
backend; activation flows and grace periods are meaningless on an ephemeral runner,
and a service would forfeit the local-first property that gets the tool through a
security review. Same merchant, deliberately different mechanism. Do not "align"
the two.

## 8. Validation gate before the paid tier — superseded 2026-09-22

The free tier through Milestone 6 is authorized on the strength of the current
greenlight. Implementing the paid tier (Milestones 7 onward) requires clearing this
gate, so that the portfolio does not repeat a build-then-hope launch:

0. **Partially collected, and partly negative.** Two real repositories were
   scanned (`acmenav-service`, `acmeco-webapp`) and produced credible inventories —
   17 and 10 flags. The lead who reviewed them values the detection but questions
   the price for a Togglz shop. Gate items 1 and 3 below are therefore *begun*, not
   met, and the price evidence so far is discouraging rather than encouraging.

1. Run `scan` against **at least five real repositories** and record actual flag
   counts and stale-flag counts. If real codebases do not contain meaningful flag
   debt, the premise is wrong and the product stops here.
2. Show the resulting report to **at least five platform or engineering leads**, not
   one, and record their reactions verbatim.
3. Obtain **at least one concrete price conversation** — a stated number, a budget
   line, a procurement path, or a written intent — from someone other than the
   original contact.
4. Confirm at least one team will run `check` in their CI during a trial.

### Stop conditions

Stop or re-scope if: real repositories show little flag debt; leads find the report
interesting but not budget-worthy; the tool cannot reach acceptable precision on
non-literal flag keys; or a free tool (Uber's Piranha and the flag vendors' own code
reference scanners are the ones to check) covers the paid surface well enough that
the differentiated value collapses. *(Competitive landscape is asserted from memory
and must be verified before launch positioning is written.)*

## 9. Privacy and security

- No source code, flag keys, configuration, findings, or repository metadata leave
  the machine in Free or Team tiers.
- Enforced by a guard test that fails the build if a network client is introduced
  into the core, ported from the equivalent OpenAPI Guard rule.
- Flag keys can themselves be sensitive (they leak unreleased product names), so
  they are treated as confidential in all output paths, logs, and error messages.
- Optional provider integrations, if ever built, are opt-in, send only flag keys,
  never source, and require explicit user approval to design or implement.

## 10. Naming

**Decided: Flag Marshal.** Repository slug and npm package `flag-marshal`; CLI
`flag-marshal`, with `marshal` published as a short bin alias.

Marshalling means imposing order on a disordered set, which describes the product's
job more accurately than cleanup metaphors do, and the enforcement connotation fits
a paid tier that is governance rather than a one-time purge. It follows the
`[domain] + [role noun]` pattern already established by OpenAPI Guard without
reusing "Guard" — a shared family brand is deliberately deferred until something in
the portfolio has adoption worth inheriting.

Rejected: `DriftSweep` (collides with OpenAPI Guard's "drift" vocabulary, and
"sweep" implies the one-time cleanup framing this product explicitly does not sell);
`Flag Debt` (names the condition rather than the remedy); `Flag Sentry` (Sentry the
error-monitoring vendor); `Flag Ledger` (trademark exposure).

**Availability, verified 2026-09-09:** `flag-marshal` is unregistered on npm and is
the package name to claim. The `marshal` package name is taken by a dormant Ruby
`Marshal`-string parser (v0.5.4, last published 2022), but it declares no `bin`
field, so shipping `marshal` as a bin alias from `flag-marshal` collides with
nothing installable. No software product, company, or trademark named "Flag Marshal"
was found.

**One adjacent-mark caution:** SecConOne holds a family of `MARSHAL` trademarks —
MARSHAL, CYBER MARSHAL, ASSET MARSHAL, DEFENSE MARSHAL, INTEL MARSHAL, RISK
MARSHAL — covering security, compliance, vulnerability, and risk-management software
and consulting. That is an adjacent class to a developer governance tool rather than
the same product, and a package name is not a trademark filing. If StackBlender ever
registers a mark, have that family reviewed properly first. This note is not legal
advice.

## 11. Open decisions

These are unresolved and must not be silently settled by an implementing agent:

1. Team-tier price point and whether pricing is per repository or per seat.
2. Whether the IntelliJ frontend consumes the CLI or reimplements natively.
3. Where Flag Marshal sits in portfolio priority relative to the in-progress OpenAPI
   Guard IntelliJ plugin, which currently holds priority 1 with no code written.
