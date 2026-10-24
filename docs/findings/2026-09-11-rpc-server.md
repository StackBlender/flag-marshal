# The JSON-RPC server for editors (2026-09-11)

`flag-marshal serve --stdio` exposed `AnalysisSession` over JSON-RPC (`initialize`, `flagMarshal/scan`, `shutdown`, `exit`). Removed on 2026-10-07 with the editor frontends; the lessons stand.

- **Three separable files:** framing (`protocol.ts`), dispatch over one session (`server.ts`) and transport (`stdio.ts`). `scan` returned the same `ScanReport` as the CLI from the same `openWorkspace` call, so the frontends could disagree only about argument parsing.
- **`exit` as well as `shutdown`:** every editor client speaks the LSP pair, and answering one leaves a conforming client waiting.
- **Framing is byte-counted.** `Content-Length` is bytes; a non-ASCII flag key would silently desynchronise a character-counted stream several messages later. Pinned with a `café-🚀` payload.
- **The self-await deadlock.** Requests were serialised on a promise chain. The first shutdown drained the chain by awaiting it from a callback that was itself a link in it, and the process hung with every test passing. A handler inside the queue must stop directly (`stop()`); only outside events (`end`, `close`, `error`) drain first (`stopWhenDrained()`).
