# Flag Marshal

Local-first feature-flag technical-debt analysis and governance.

Feature flags get created constantly and removed almost never. Flag Marshal finds the
ones that are stale, dead, or undocumented, shows the evidence behind each finding,
and keeps new flag debt from accumulating.

Free and open source under the [MIT License](LICENSE). Published on npm as
[`@stackblender/flag-marshal`](https://www.npmjs.com/package/@stackblender/flag-marshal).

> This README covers using and developing Flag Marshal. The npm package ships its
> own shorter README from `npm-package/`. See the [CLI reference](docs/cli.md) for
> every command and option.

## What it reads

| | |
| --- | --- |
| **Languages** | TypeScript, JavaScript, Java, Kotlin |
| **Providers** | LaunchDarkly, OpenFeature, Unleash, Togglz, Spring `@ConditionalOnProperty` |
| **Key shapes** | String literals, same-file constants, `CONST + "suffix"`, Togglz enum constants, `NamedFeature("k")`, Spring `prefix` + `name` |
| **Configuration** | `application*.properties`, `application*.y[a]ml`, `.env*` |
| **Your own helper** | `customPatterns.methods` in `.flagmarshal.yml`, called as a method or a plain function |

A call counts as a flag only when the file **imports** that provider **and** the
receiver is bound to it, so a Lombok `.isEnabled(...)`, an application
`getStringValue(...)`, or a domain `.variation(...)` is not mistaken for one. The
cost is that a file handed an already-constructed client is missed — a deliberate
trade, because confidently labelling ordinary code as flag debt is worse than a
clear miss.

When a flag platform Flag Marshal cannot analyze is in use, the report says so
rather than presenting a quietly incomplete inventory.

Spring `@ConditionalOnProperty` switches are inventoried but never called stale:
that annotation proves something is conditional, not that it is a temporary rollout.

Computed flag keys are reported as unresolved, never guessed. Findings carry the
evidence that produced them and a confidence that reflects how much of the
repository could actually be read.

## Local-first

Analysis runs entirely on your machine. No source code, flag keys, configuration,
findings, or repository metadata ever leave it. There is no hosted backend, no
account, and no telemetry.

This is enforced, not just promised: a test fails the build if a network client or
global network API appears anywhere in the analysis core.

## Install

```sh
npm install -g @stackblender/flag-marshal
flag-marshal scan .
```

Or without installing:

```sh
npx @stackblender/flag-marshal scan .
```

The package is `@stackblender/flag-marshal`; the command it installs is
`flag-marshal` (with `marshal` as a short alias).

Release packaging is intentionally separate from this repository root. Run
`npm run package:npm` to build and test the publishable artifact under
`artifacts/npm/`; the root manifest is private so `npm publish` cannot accidentally
ship internal documentation or development metadata.

## Development

Requires Node 20 or newer.

```sh
npm install
npm run check     # format, lint, typecheck, build, test
node dist/frontends/cli/main.js scan .
node dist/frontends/cli/main.js scan . --json
node dist/frontends/cli/main.js scan . --no-git   # deterministic; skips history
```

`scan` always exits 0 — it reports, it does not enforce, so it is safe to run in
any pipeline. Its output opens with a debt summary and the flags most worth
reviewing first, ranked by debt score with the evidence behind each rank.
`check` exits 2 on a **new** policy violation.

## Governance

`flag-marshal init` writes a starter `.flagmarshal.yml` — detected helpers
declared, every policy option present and commented out — and never overwrites
an existing one. Or put a policy in `.flagmarshal.yml` directly:

```yaml
policy:
  requireOwner: true
  requireExpiry: true
  budget: 50
  allowlist:
    - kill-switch-payments   # kill switches legitimately live forever

flags:
  checkout-v2:
    owner: team-checkout
    expiry: 2026-12-01
```

Or declare metadata beside the flag, in any comment syntax:

```ts
// flag-marshal: checkout-v2 owner=team-checkout expiry=2026-12-01
```

Then adopt the ratchet:

```sh
flag-marshal check --update-baseline   # accept existing debt, once
flag-marshal check                     # CI: fails only on NEW violations
```

**No team adopts a check that fails on day one with two hundred violations.** The
baseline records what already exists, so debt can hold steady or fall but never
rise. `check` enforces policy only — never the drift findings, which are
inferences.

Or skip the baseline and review one change against the branch it came from:

```sh
flag-marshal scan --changed-since origin/main    # "adds checkout-v3 with no owner"
flag-marshal check --changed-since origin/main   # fails only on what this branch adds
```

The comparison is with the merge base, as a pull request shows it, and includes
uncommitted edits.

## One free tool

Every capability — scanning, every provider, custom helpers, `check` with the
baseline ratchet, `trend`, and every output format — runs on every installation.
There are no tiers, no licence keys, and no account. `check` exits 2 on a new
violation, so it can gate a pre-commit hook or any pipeline you already run; there
is no dedicated CI product.

## Refactor preview

```sh
flag-marshal preview checkout-v2 --on                       # the diff, nothing written
flag-marshal preview checkout-v2 --on --format=diff | git apply
```

Resolves one flag to a fixed value in TypeScript and JavaScript, where every read
is the whole condition of an `if` or a `?:`, directly or through a `const`.
Anything it cannot rewrite exactly is refused with the place that blocks it,
rather than half-done. It shows what the code does with that value, never that
the flag is safe to remove. See
[docs/cli.md](docs/cli.md#preview).

## Output formats

```sh
flag-marshal scan --format=markdown   # a pull-request comment
flag-marshal scan --format=sarif      # GitHub code scanning
flag-marshal check --format=github    # annotations on the pull request
flag-marshal check --format=codequality > gl-code-quality.json   # GitLab widget
flag-marshal check --format=json      # for agents and dashboards
flag-marshal trend                    # debt over time
```

`trend` reads the committed baseline's own git history. There is no database and
no telemetry — the record already exists in your repository.

To run it in a pipeline, check out full history (`fetch-depth: 0` on GitHub,
`GIT_DEPTH: 0` on GitLab), then run `npx @stackblender/flag-marshal check
--changed-since=auto`. [`docs/ci.md`](docs/ci.md) has copy-paste recipes for
GitHub Actions, GitLab CI and other systems.

## Layout

```text
src/
├── core/          Analysis engine. Platform-free, network-free.
│   └── api/       The only surface frontends may import.
│   ├── detect/    Grammars, provider adapters, key extraction.
│   ├── refindex/  Groups references into the flag inventory.
│   └── workspace/ Walking and the analysis session.
├── present/       Wording shared by every frontend, from the message catalog.
└── frontends/
    ├── cli/       Command-line frontend.
    └── node/      Node adapters for the core's ports: files, git, baselines.
test/
├── architecture/  Boundary and local-only guarantees.
├── contract/      Schema, catalog, and generated-artifact drift.
├── core/          Detection, walking, positions, golden conformance.
├── frontends/     Frontend behavior.
└── process/       The real built CLI, as a subprocess.
```

Flag Marshal is a command-line and CI tool; there are no editor plugins. The core
stays separate from the CLI anyway, because that boundary is what keeps the
analysis testable and its output a versioned JSON contract other tools can build
on.

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/cli.md`](docs/cli.md) | Every command, option, exit code, and configuration key |
| [`docs/ci.md`](docs/ci.md) | Pipeline recipes: GitHub Actions, GitLab CI, anywhere else |
| [`CHANGELOG.md`](CHANGELOG.md) | What changed in each release |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Development setup and the rules the build enforces |
| [`SUPPORT.md`](SUPPORT.md) | Where to report bugs and detection problems |
| [`SECURITY.md`](SECURITY.md) | Reporting a vulnerability privately |
| [`docs/privacy.md`](docs/privacy.md) | What stays on your machine |
| [`docs/testing.md`](docs/testing.md) | How to run and debug each test layer |
| [`docs/design.md`](docs/design.md) | Architecture and the reasoning behind it |
| [`ROADMAP.md`](ROADMAP.md) | Current state, milestone ladder, decisions already made |
| [`AGENTS.md`](AGENTS.md) | Working rules for automated contributors |

## License

MIT. Copyright (c) 2026 StackBlender. See [`LICENSE`](LICENSE).
