# Togglz hardening and the Togglz price signal (2026-09-10)

Prompted by learning that the owner's organization uses **Togglz exclusively**.

- **Enums are identified by package-qualified name.** Two `FeatureFlags` classes in different modules merged their constants. A usage now resolves its simple name by explicit import, then the file's package, then wildcard imports; with several candidates and nothing to disambiguate, the reference is dropped. Verified on a three-module layout: `FeatureFlags.BILLING_V2` resolves through the billing import, while `FeatureFlags.RANKING_V3` (a *search* constant, in a file importing billing's enum) does not.
- **`NamedFeature("some-flag")` is supported** in Java and Kotlin; a computed argument stays unresolved.
- Probes: merging same-named enums fails 4 tests, removing `NamedFeature` fails 1.

**The commercial note.** Togglz is free, self-hosted and Apache-licensed, so the vendor-bill argument in [docs/design.md](../design.md) section 1 does not apply to a Togglz shop; what remains is incident risk and governance. See [docs/design.md](../design.md), "What the Togglz signal means". For such a buyer the pitch is "stop flag debt accumulating", not "cut your flag bill".
