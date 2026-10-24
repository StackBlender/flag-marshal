# Standalone per-platform binary (2026-09-10)

A Node SEA (or equivalent) executable per platform, so no Node runtime is needed. Its first consumer was the IntelliJ plugin, dropped on 2026-10-07; it now waits for a CI image without Node to matter. `npx` users need no binary.

**The unsolved problem.** Under Node SEA the WASM grammars must be embedded as SEA assets and handed to `Language.load` as bytes rather than paths, which also affects how `web-tree-sitter` loads its own runtime. `parser-pool.ts` is the single place that turns a grammar spec into a loaded language, so the change stays local.

Done when the binary produces byte-identical JSON to `npx flag-marshal scan` on the fixtures.
