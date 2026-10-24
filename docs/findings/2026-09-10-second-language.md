# Second language and second provider (2026-09-10)

Milestone 6: Java and Kotlin adapters; OpenFeature, Unleash and Spring `@ConditionalOnProperty`; user-defined custom patterns. Adding a provider became a declaration in `src/core/detect/providers/index.ts` (an id, SDK method names, languages), with no change to the index, evidence or scoring layers. **Every fixture golden is reproduced by the engine**, including `mixed-polyglot` merging one key across Java and TypeScript into one record.

- **Kotlin grammar:** `@vscode/tree-sitter-wasm` ships none; `@tree-sitter-grammars/tree-sitter-kotlin` does, and both build against tree-sitter ABI 14, verified by loading and parsing before adopting it.
- **Providers are data**: the flag key is the first argument to a named method, so the per-language query is written once in `queries.ts`.
- **A query that fails to compile is skipped, not fatal**; `test/core/queries.test.ts` compiles every query against every grammar so breakage fails CI instead.
- **Custom patterns live in `.flagmarshal.yml`**; a homegrown `Features.isFeatureOn("x")` is found across every wired language, verified end to end.
- **A real bug the tests caught:** Kotlin's brace-less `"prefix-$name"` produces **no interpolation node**, so the extractor reported a flag key of literally `prefix-$name`. Kotlin string text is now scanned for an unescaped `$`, with `\$` staying a literal.
- `java-spring-conditional` now reports `features.retired-dashboard` at `medium` rather than `low`, and the two milestone 4 findings that were false are gone, because the Java references are visible.
