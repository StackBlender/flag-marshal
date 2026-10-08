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
| `--format=github` | GitHub Actions annotations: one workflow command per finding, shown on the pull request's files |
| `--format=codequality` | GitLab Code Quality JSON, for the merge request widget |
| `--no-git` | Skip repository history. Output becomes fully deterministic, but flag-age evidence is unavailable |
| `--changed-since <ref>` | Report only what changed since `<ref>`; see below |

`scan` always exits with code 0, even when it reports findings.

The `github` and `codequality` formats give paths relative to the directory the
command runs in, which is where CI systems resolve them, so `scan services/api`
from the checkout root still annotates the right files. Run them from the
repository root. GitHub annotations need no upload step and no code-scanning
licence; SARIF upload needs GitHub Advanced Security on private repositories.
A Code Quality fingerprint ignores the line, so moving code does not make GitLab
report an issue as new, and a finding with no position (the flag budget) is placed
on `.flagmarshal.yml`.

### What a change does: `--changed-since`

```sh
flag-marshal scan --changed-since origin/main
flag-marshal scan --changed-since=origin/main --format=markdown
```

Compares the working tree, uncommitted edits included, with the merge base of
`<ref>` and `HEAD`, the same comparison a pull request shows. A branch is not
credited with flags that `main` added after the branch was cut. The report lists
flags added and removed, flags whose number of references changed, findings
introduced and resolved, and new computed keys.

Flags are matched by key and findings by rule and flag, so moving code is not a
change. Human and Markdown output show only the change. JSON carries the whole
report plus a `changes` object. SARIF carries only the introduced findings.

`--changed-since=auto` takes the base from the CI system running the job:
GitLab's `CI_MERGE_REQUEST_DIFF_BASE_SHA` (the exact merge base) first, then the
target branch from `GITHUB_BASE_REF`, `CI_MERGE_REQUEST_TARGET_BRANCH_NAME`,
`BITBUCKET_PR_DESTINATION_BRANCH` or `SYSTEM_PULLREQUEST_TARGETBRANCH` (Azure
Pipelines), as `origin/<branch>`. It prints the ref it chose on stderr. Outside a
pull request, a push build for example, it exits 1 rather than guess.

The comparison needs a git repository that contains `<ref>`. In CI, fetch it first
(for example `fetch-depth: 0` with `actions/checkout`). If `<ref>` is unknown or
shares no history with `HEAD`, the command exits 1 rather than guessing. `--no-git`
still works with it: it skips age evidence, not the comparison.

Flag age and staleness come from Git history. In CI, check out the full history (for
example `fetch-depth: 0` with `actions/checkout`, or `GIT_DEPTH: 0` on GitLab). A
shallow clone is treated as having no history, because its log stops at the
clone's boundary and every flag would look new. Confidence drops as it does with
`--no-git`, and a warning on stderr says how to fix it.

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

```sh
flag-marshal check --changed-since origin/main   # exits 2 only on violations this branch adds
```

With `--changed-since`, the merge base takes the place of the baseline: violations
already present there pass, and only those the change introduces fail. No baseline
file is needed, and one that exists is not read. It cannot be combined with
`--update-baseline`.

| Exit code | Meaning |
| --- | --- |
| 0 | No new violations |
| 1 | Usage error |
| 2 | A new policy violation |

## `trend`

Shows how accepted flag debt has moved over time, read from the committed baseline's
own Git history. `--json` is supported.

## `preview`

Shows the diff that resolves one flag to a fixed value. It writes nothing.

```sh
flag-marshal preview checkout-v2 --on                       # review it
flag-marshal preview checkout-v2 --on --format=diff | git apply   # apply it yourself
```

| Option | Effect |
| --- | --- |
| `--on` or `--off` | The value the flag is resolved to: truthy everywhere it is read, or falsy. One is required |
| `--format=human` | The diff with a short summary (default) |
| `--format=diff` | Only the patch, for `git apply`. A refusal goes to stderr, so nothing is piped |
| `--format=json` or `--json` | The files before and after, or the reasons for a refusal |
| `--no-git` | Skip history; only the confidence shown beside the preview changes |

It is narrow on purpose. Every read of the flag must be in TypeScript or
JavaScript and be the whole condition of an `if` statement or a `?:` expression,
or initialize a `const` whose every use is such a condition
(`const modern = await client.variation(...)` then `modern ? 9 : 12`); `await`,
`!` and parentheses around the call are fine. The `const` is then removed. The `if` keeps the branch
the value selects: a block is unwrapped into the code around it, unless it
declares a `const`, `let`, class or function, which keeps its braces. With no
branch to keep, the statement is removed.

The preview is refused, listing every place that blocks it, when it cannot be
exact:

- a read in any other shape, such as `let on = ...`, `if (flag && other)`, or a
  `const` whose value is passed on, returned or redeclared in its scope
- an `if` that shares a line with other code, or is the braceless body of
  another statement, or an `else if`
- a rewrite that could join two statements, which happens when the statement
  before the `if` has no semicolon
- any computed flag key or unreadable language anywhere in the repository,
  because a read of this flag could be hiding there
- the flag also named in configuration, or read outside TypeScript and
  JavaScript

The flag's staleness confidence is shown beside the preview, not used to block
it. A preview says what the code does with that value. It does not say the flag
can be removed: check the evidence with `scan` first. Imports, clients and code
that becomes unreachable are left as they are.

| Exit code | Meaning |
| --- | --- |
| 0 | Preview shown |
| 1 | Usage error |
| 3 | Refused: the rewrite could not be shown exactly |

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
