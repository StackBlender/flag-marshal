# Running Flag Marshal in CI

Flag Marshal is a command-line tool, so it runs in any pipeline that has Node 20
or later. It makes no network calls of its own; the only download is the package
itself through `npx`. Pin the version you have tested, as below.

> These recipes need Flag Marshal 0.2.0 or later, which added `--changed-since`
> and the `github` and `codequality` formats.

## Two ways to gate a pipeline

| Approach | Command | Fails on |
| --- | --- | --- |
| Compare with the pull request's base | `flag-marshal check --changed-since=auto` | Policy violations this change adds |
| Ratchet against a committed baseline | `flag-marshal check` | Violations not in `.flagmarshal-baseline.json` |

The comparison needs no file in the repository and suits pull requests. The
baseline suits a main-branch build, and `trend` reads its history. Either way,
`check` exits 0 when clean, 2 on a new violation and 1 on a usage error, so the
job fails on 2 and a broken invocation fails too.

Both need **full history**. A shallow clone, the default checkout in most CI
systems, has no merge base to compare with, and its log would make every flag look
new. Flag Marshal treats a shallow clone as having no history and warns.

## GitHub Actions

Annotations on the pull request, failing on new violations:

```yaml
name: Flag Marshal
on: pull_request

jobs:
  flags:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # history is analysis input, and the base must be present
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx --yes @stackblender/flag-marshal@0.2 check --changed-since=auto --format=github
```

`--changed-since=auto` reads `GITHUB_BASE_REF`, and `--format=github` prints one
annotation per violation on the changed lines. Annotations need no extra
permission and no code-scanning licence.

A Markdown summary on the job page, alongside the annotations:

```yaml
      - run: npx --yes @stackblender/flag-marshal@0.2 scan --changed-since=auto --format=markdown >> "$GITHUB_STEP_SUMMARY"
```

Code scanning, if the repository has it (public repositories, or GitHub Advanced
Security on private ones):

```yaml
    permissions:
      contents: read
      security-events: write
    steps:
      # checkout and setup-node as above
      - run: npx --yes @stackblender/flag-marshal@0.2 scan --format=sarif > flag-marshal.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: flag-marshal.sarif
```

## GitLab CI

The Code Quality widget on the merge request, failing on new violations:

```yaml
flag-marshal:
  image: node:22
  variables:
    GIT_DEPTH: 0 # history is analysis input, and the base must be present
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - npx --yes @stackblender/flag-marshal@0.2 check --changed-since=auto --format=codequality > gl-code-quality.json
  artifacts:
    when: always # upload the report even when check exits 2
    reports:
      codequality: gl-code-quality.json
```

In a merge request pipeline, `--changed-since=auto` uses
`CI_MERGE_REQUEST_DIFF_BASE_SHA`, the merge base GitLab computed, which a full
clone always contains. Code Quality fingerprints ignore line numbers, so moving
code does not make the widget report an issue as new.

## Anywhere else

Bitbucket Pipelines (`BITBUCKET_PR_DESTINATION_BRANCH`) and Azure Pipelines
(`SYSTEM_PULLREQUEST_TARGETBRANCH`) are read by `--changed-since=auto` too. On any
other system, name the base:

```sh
git fetch origin main
npx --yes @stackblender/flag-marshal@0.2 check --changed-since origin/main
```

A main-branch build that ratchets against the committed baseline:

```sh
npx --yes @stackblender/flag-marshal@0.2 check
```

Accept today's violations once, and commit the result:

```sh
npx --yes @stackblender/flag-marshal@0.2 check --update-baseline
```

The same commands work in a pre-push hook. `--no-git` skips history for a fast,
deterministic run, at the cost of flag ages.
