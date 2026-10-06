# Contributing

Flag Marshal is MIT-licensed, and contributions are welcome: bug fixes, detection
improvements, new providers or languages, documentation, and minimal reproduction
cases.

## Before you start

For anything beyond a small fix, open an issue first so the approach can be agreed
before you spend time on it. Detection changes in particular need a reproduction:
the product's value rests on not reporting ordinary code as flag debt.

## Development

Requires Node.js 20 or newer.

```sh
npm install
npm run check     # format, lint, typecheck, build, and the full test suite
npm run build
node dist/frontends/cli/main.js scan .
```

[`docs/testing.md`](docs/testing.md) describes every test layer and how to debug it.
[`docs/design.md`](docs/design.md) explains the architecture.

## Rules the build enforces

- **`src/core/` is platform-free.** It imports no frontend, editor API, or network
  module. Frontends import `src/core/api` only.
- **No network calls in the core.** A test fails the build if one appears. Analysis
  must stay local.
- **The core emits structured findings, never wording.** Text comes from
  `catalog/messages.json` through `src/present/`, so every frontend says the same
  thing.
- **Never guess.** A key that cannot be read statically is reported as unresolved,
  not resolved speculatively. Every finding carries a confidence and the evidence
  behind it.
- **Flag keys are confidential.** Never write them to logs or error messages.

## Pull requests

1. Keep each pull request to one coherent change, with tests.
2. Run `npm run check` and make sure it passes.
3. Make the contribution safe to publish permanently: replace real flag keys with
   placeholders, and remove credentials, secrets, personal or customer data,
   proprietary code, and sensitive logs.
4. Explain what changed and how you verified it.

By contributing, you agree that your contribution is licensed under the
[MIT License](LICENSE) and that you have the right to publish it under that license.
