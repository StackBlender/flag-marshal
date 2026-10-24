# The detection seam: grammars and literals (2026-09-10)

Milestone 2: TypeScript and LaunchDarkly end to end. `test/core/golden-conformance.test.ts` reproduces the `ts-launchdarkly`, `computed-keys` and `no-flags` goldens **exactly**, the moment those files stop being a specification and become a regression test. Two probes confirmed the never-guess guarantee: an extractor returning `node.text` as the key fails 5 tests, and treating an interpolated template literal as a literal fails 1.

- **Grammars are WebAssembly, never native bindings.** Native tree-sitter needs node-gyp builds or per-platform prebuilds and cannot be embedded in a standalone executable.
- **Grammar source is `@vscode/tree-sitter-wasm`.** `tree-sitter-wasms` was tried first and rejected: its grammars are built against tree-sitter 0.20 and fail to load under web-tree-sitter 0.26+ with a dylink error.
- **tree-sitter columns are UTF-16 code units**, matching the declared `positionEncoding`, so no conversion happens in the core. Verified empirically against multi-byte and surrogate-pair input rather than assumed.
- A **template literal with no interpolation is a genuine literal** and resolves. One with `${...}` does not.
- Reference kind (`production-code` / `test-code`) is decided at detection time from the path, since a test-only flag is a distinct kind of debt.
- Provider queries matched on method name alone. Superseded on 2026-09-10: see [detector credibility, round 1](2026-09-10-detector-round-1.md).
