# CLI reference

Install nothing and run the latest version:

```sh
npx @stackblender/flag-marshal scan .
```

Or install the commands globally:

```sh
npm install --global @stackblender/flag-marshal
flag-marshal scan .
```

`marshal` is a shorter alias for `flag-marshal`. Every command is free; there are
no tiers, licence keys, or accounts.

## `scan`

Inventories the feature flags in a repository and reports findings.

```sh
flag-marshal scan [path]
```

| Option | Effect |
| --- | --- |
| `--format=human` | Readable terminal output (default): a debt summary, the flags most worth reviewing, the inventory, and findings |
| `--format=json` or `--json` | Machine-readable report for scripts and agents |
| `--format=markdown` | A report suitable for sharing or a pull-request comment |
| `--format=sarif` | SARIF 2.1.0 for code-scanning tools |
| `--no-git` | Skip repository history. Output becomes fully deterministic, but flag-age evidence is unavailable |

`scan` always exits with code 0, even when it reports findings.

Flag age and staleness come from Git history. In CI, check out the full history (for
example `fetch-depth: 0` with `actions/checkout`), or age evidence is missing.

## `init`

Writes a starter `.flagmarshal.yml`, declaring any flag helper the scan finds and
including every policy option commented out. It never replaces an existing file.

```sh
flag-marshal init [path]
```

## `check`

Enforces the policy in `.flagmarshal.yml`: required owners and expiry dates, maximum
flag age, and a flag budget. Inferred findings such as staleness are reported by
`scan` and never enforced.

```sh
flag-marshal check --update-baseline   # accept today's violations, once
flag-marshal check                     # exits 2 only on violations added since
```

The baseline is written to `.flagmarshal-baseline.json`. Commit it so everyone
shares one. `check` accepts `--format` and `--no-git` like `scan`.

| Exit code | Meaning |
| --- | --- |
| 0 | No new violations |
| 1 | Usage error |
| 2 | A new policy violation |

## `trend`

Shows how accepted flag debt has moved over time, read from the committed baseline's
own Git history. `--json` is supported.

## `serve --stdio`

A long-running JSON-RPC 2.0 analysis server with `Content-Length` framing, for editor
integrations. It answers `initialize`, `flagMarshal/scan`, `shutdown`, and `exit`.

## Configuration

`.flagmarshal.yml` at the repository root. Every section is optional:

```yaml
customPatterns:
  methods: [isFeatureOn]      # your own flag helpers

policy:
  requireOwner: true
  requireExpiry: true
  maxAgeDays: 180             # 0 disables
  budget: 50                  # 0 disables
  allowlist:
    - example-kill-switch

flags:
  example-flag:
    owner: team-example
    expiry: 2027-01-31
```

Owner and expiry can also sit beside the flag, in any comment syntax:
`// flag-marshal: example-flag owner=team-example expiry=2027-01-31`.

A declared helper matches both `features.isFeatureOn("k")` and a plain
`isFeatureOn("k")`. When the helper passes its key straight to an SDK call, that call
is not reported as unresolved, and when every declared helper forwards to the same
SDK, calls through them are treated as that SDK's calls.

## Limitations

- This is static analysis, not runtime proof that a flag can be removed. Review the
  evidence before changing production code.
- A call is recognized only when its file imports the provider. Code that receives an
  already-constructed client from elsewhere may be missed; declaring your helper
  usually recovers it.
- Unsupported languages and unresolved keys are reported as coverage limitations, and
  they lower the confidence of affected findings.

If a flag is reported wrongly or missed, use the
[detection problem form](https://github.com/StackBlender/flag-marshal/issues/new?template=detection.yml).
