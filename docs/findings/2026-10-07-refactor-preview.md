# The refactor preview (2026-10-07)

`flag-marshal preview <key> --on|--off [path]` computes the diff that resolves one flag to a fixed value, for TypeScript and JavaScript `if` and `?:` conditions, and a `const` used only that way. The core cannot write; `--format=diff | git apply` is the user's separate step, and a test applies the printed patch with real git.

- **The gate is an exact rewrite, not `HIGH` confidence** (owner, 2026-10-07): `HIGH` needs three staleness signals and a flag still read by production code can show at most two, so the original gate would have refused nearly every flag worth rewriting.
- A kept `(g = 1)` at the start of a statement must not join the previous line (`joinsPreviousLine`).
- **Corpus sweep:** 122 previews over three JS/TS SDK repositories, all refused as `unsupported-shape`, in 5 s. That shows robustness, not reach: SDK code reads flags in assertions, not in `if`s. The second shape (`const modern = await client.variation(...)` then `modern ? 9 : 12`) left the sweep unchanged and made the `checkout-v2` fixture flag preview across both files.
