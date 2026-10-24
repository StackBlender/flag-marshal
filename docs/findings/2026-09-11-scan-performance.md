# Scan performance (2026-09-11)

Spring Boot took 55 seconds through the extension and AcmeNav 13. A CPU profile put 55% of the time inside two tree-sitter WebAssembly functions: parsing, **not** the pickaxe cost that was the obvious suspect. Four changes, each measured before the next:

- *Parse prefilter* (42s → 10.5s): a file containing no provider import marker or annotation string cannot produce a reference, and a substring scan is far cheaper than a syntax tree. A missing marker is a **silent** false negative, so `test/core/prefilter.test.ts` asserts every marker reaches it; the first draft missed the custom-method list, which would have disabled every user-configured pattern.
- *One walk, one read* (10.5s → 8.5s): `discoverTogglzEnums` had walked and read the whole repository first; only a workspace that declares a Togglz enum now re-reads the rest.
- *Parallel reads* (8.5s → 4.6s): 32 at a time, consumed in walk order so output does not depend on disk scheduling.
- *Parallel git evidence* (14.3s → 6.4s through the extension): with parsing fixed, the pickaxe was ten seconds of fourteen. Eight in flight.

Spring Boot 55s → **6.4s** through the extension, 42s → 4.6s for the CLI with `--no-git`; `togglz` 3.6s → 2.7s; `spring-petclinic` 0.09s. Detection is byte-identical across the corpus, and two consecutive git-enabled scans give the same SHA-256.

External measurement over three processes per figure: AcmeNav **1.29s** and AcmeCo **1.89s** with git evidence on, under the 3-second threshold, with flag counts and all three findings unchanged. (The earlier 13s was a different host and caches: the reason to look, not a controlled baseline.)
