# Single-pass git evidence (2026-09-22)

Git evidence runs one `git log -S` pickaxe per flag, eight in parallel. Measured cost is small ([finding](../../findings/2026-09-22-git-evidence-deep-history.md)), so this waits until a real repository shows the cost.

**Design.** One streamed `git log -p --unified=0` pass computes pickaxe semantics for every key at once: a key's occurrence count differing between a hunk's `-` and `+` lines is exactly what `-S` tests. Expose it as an optional batch method on the `GitHistory` port, falling back to per-key pickaxe on failure. Do not use file-level dates (`git log --name-only`): a recently edited file can hold an ancient flag.

**Also check then** whether the 5s per-pickaxe timeout silently drops age evidence on very large histories: that would be a confidence bug, not only a speed one.
