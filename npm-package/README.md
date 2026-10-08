# Flag Marshal

Find feature-flag debt without uploading your source code.

Flag Marshal inventories feature flags in a local repository, reports stale or
undocumented flags with supporting evidence, and identifies key expressions it
cannot safely resolve instead of guessing.

## Quick start

Requires Node.js 20 or newer.

```sh
npx @stackblender/flag-marshal scan .
```

Or install the commands globally:

```sh
npm install --global @stackblender/flag-marshal
flag-marshal scan .
```

`marshal` is available as a shorter alias. A scan reports findings but always
exits successfully, so trying it will not break a build.

## What it detects

| Surface | Current support |
| --- | --- |
| Languages | JavaScript, TypeScript, Java, Kotlin |
| Providers | LaunchDarkly, OpenFeature, Unleash, Togglz |
| Framework configuration | Spring `@ConditionalOnProperty` (including `prefix`), `application*.properties`, `application*.yml` |
| Other configuration | `.env*` feature switches |
| Custom helpers | Method names configured in `.flagmarshal.yml` |

Provider calls must have both a matching import and a receiver bound to that
provider. This avoids treating unrelated methods such as `isEnabled()` or
`variation()` as feature flags.

Literal keys, same-file immutable constants, simple constant concatenation,
Togglz enum constants, and `NamedFeature("key")` are supported. Computed keys are
reported as unresolved and never assigned a guessed value.

## Useful output

Human-readable output is the default:

```sh
flag-marshal scan ./my-repository
```

Use JSON for scripts and agents, Markdown for sharing a report, or SARIF for
code-scanning tools:

```sh
flag-marshal scan . --json --no-git
flag-marshal scan . --format=markdown
flag-marshal scan . --format=sarif
```

The report opens with a summary (flags older than a year, never read by code,
read only by tests) and the flags most worth reviewing first, each with the
evidence behind its rank. A rank is a lead to review, not a verdict that a flag
can be removed.

`--no-git` skips repository history and makes output deterministic; without
history, age cannot be measured. Run `flag-marshal --help` for the complete
command reference.

## Flag policy

Declare owners and expiry dates, then keep new flag debt from creeping in:

```yaml
# .flagmarshal.yml
policy:
  requireOwner: true
  requireExpiry: true
  budget: 50
flags:
  example-flag:
    owner: team-example
    expiry: 2027-01-31
```

```sh
flag-marshal check --update-baseline   # accept today's debt, once
flag-marshal check                     # exits 2 only on violations added since
flag-marshal trend                     # accepted debt over time, from git history
```

Or review one branch without any baseline:

```sh
flag-marshal scan --changed-since origin/main    # flags added, removed, findings introduced
flag-marshal check --changed-since origin/main   # exits 2 only on violations this branch adds
```

Metadata can also sit beside the flag, in any comment syntax:
`// flag-marshal: example-flag owner=team-example expiry=2027-01-31`.
`check` enforces policy only, never inferred findings such as staleness. Commit
`.flagmarshal-baseline.json` so everyone shares one baseline.

Everything is free: there are no tiers, licence keys, or accounts.

## Custom flag helpers

The quickest start is:

```sh
flag-marshal init
```

It writes a `.flagmarshal.yml` that declares any helper the scan found, with the
policy options included and commented out. It never replaces an existing file.

For a homegrown helper such as `Features.enabled("checkout-v2")` or an imported
`isOn("checkout-v2")`, add a `.flagmarshal.yml` file at the repository root:

```yaml
customPatterns:
  methods:
    - enabled
```

If the helper forwards its key straight to an SDK —
`isOn(key) { return client.variation(key, ...) }` — Flag Marshal recognizes the
call inside it. That call is no longer reported as unresolved, so it no longer
lowers confidence for every other flag. When every helper you declare forwards to
the same SDK, calls through them are treated as that SDK's calls.

You rarely need to find the helper yourself: when a scan sees a key passed
straight through a function, it names that function and prints the lines to add.

## Privacy and limitations

Analysis runs on your machine. Flag Marshal has no hosted backend, account,
telemetry, or source upload, and the analysis core is tested to reject network
dependencies.

This is static analysis, not runtime proof that a flag can be removed. Findings
include confidence and evidence, and unsupported languages or unresolved keys are
reported as coverage limitations. Review the evidence before changing production
code.

## Support

Source, documentation, and issue forms are in the
[Flag Marshal repository](https://github.com/StackBlender/flag-marshal).
[Report a bug or detection problem](https://github.com/StackBlender/flag-marshal/issues/new/choose),
or [report a security concern privately](https://github.com/StackBlender/flag-marshal/security/advisories/new).
Flag keys can reveal unreleased features, so replace them with placeholders before
posting.

## License

Flag Marshal is released under the [MIT License](LICENSE). Runtime dependency
notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
