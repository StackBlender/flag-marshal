# The VS Code extension (2026-09-11)

Milestone 10, removed on 2026-10-07 by the owner's decision. What it taught:

- **Shared presentation.** `src/present/` was created so frontends render catalog text without copying the CLI's renderer; it imports `core/api` only. It stays, used by the CLI.
- **Flag-level findings fan out** to every reference: pinned to the first reference, a stale flag's warning is invisible in every other file.
- **Bundling to CommonJS.** The extension host `require`s `main`; esbuild converted the entry point, written at the **same depth** as the source (grammar and catalog paths are relative), with a banner rebuilding `import.meta.url`, which esbuild otherwise replaces with an empty object, leaving an extension that parses nothing.
- **Pruning: 73 MB to 14 MB** by an allowlist of grammar files; a new grammar without an entry fails loudly.
- **A fake editor is not enough.** It cannot prove the manifest names a real file, the bundle can be `require`d, or a command really registers. In a real VS Code 1.137, the first run failed because the chosen fixture produced no findings, so a broken diagnostic path would have passed.
- **Against the 12-repository corpus,** eleven scanned in under four seconds; `spring-boot` took **55 seconds**, 42 with `--no-git`, so parsing, not git, was the cost. Auto-rescan was disabled above 3s (`AUTO_RESCAN_BUDGET_MS`). That led to [scan performance](2026-09-11-scan-performance.md).
- **A flag with no name:** `togglz` has `new NamedFeature("")` in a test; an empty or whitespace-only literal key is now dropped. The `togglz` corpus baseline moved 20 to 31.
