# Editor frontends dropped (2026-10-07)

The owner: "can we scrap the extension completely and only focus on the cli / ci tool support for this tool". Removed: `src/frontends/vscode/`, `vscode-extension/`, `src/frontends/rpc/` and `serve --stdio`, the integration tests and their CI job, and 74 tests; 146 lockfile entries went with five dev dependencies, and no remaining version changed. `flag-marshal serve` is now an unknown command (exit 1).

Superseded decisions, kept as the record:

- **Plugin distribution:** VS Code then IntelliJ, both listed publicly. VS Code first was a decision about cost, not reach: the target organization (Togglz, Java, Spring) lives in IntelliJ, which was blocked on the standalone binary.
- **M12, marketplace listing** (authorized 2026-09-11) was for surface area, not conversion: a prior StackBlender dev-tool launch converted about one install ([docs/design.md](../design.md) section 2). It would have published to the VS Code Marketplace and Open VSX (Cursor, Windsurf and VSCodium do not install from Microsoft's).
- **M13, IntelliJ plugin** would have consumed the RPC server and a bundled binary, with Kotlin models generated from `schema/v1`. The JetBrains Marketplace has built-in paid licensing; the VS Code Marketplace has none.
- **LSP** was deferred, not rejected, until no editor frontends remained.
- The refactor preview's planned editor code action was dropped with them.

See [the VS Code extension](2026-09-11-vscode-extension.md) and [the RPC server](2026-09-11-rpc-server.md).
