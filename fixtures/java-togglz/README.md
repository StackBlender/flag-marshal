# Fixture: java-togglz

Togglz, which declares flags as enum constants rather than string literals.

| Flag | Declared | Used | Configured |
| --- | --- | --- | --- |
| `NEW_CHECKOUT` | `FeatureFlags.java` | `Checkout.java` | `application.yaml` |
| `LEGACY_EXPORT` | `FeatureFlags.java` | — | `application.yaml` |
| `RETIRED_BANNER` | `FeatureFlags.java` | — | `application.yaml` |

This fixture exists because a real repository declared nine Togglz flags and Flag
Marshal reported one flag for the whole codebase. A confidently small inventory is
its own kind of false claim.

It also pins the two shapes that broke a real repository and that **no public
corpus repository contains**, which is why they live here:

- Constants carry constructor arguments with commas —
  `NEW_CHECKOUT("checkout", true)`. A comma-splitting parser found nothing and
  silently erased the entire Togglz inventory.
- `ShippingOptions.java` declares an unrelated `interface Feature` and an enum
  implementing it. Matching on the simple name reported `EXPRESS` and `STANDARD`
  as feature flags. Nothing there imports Togglz, so it must stay silent.

Three further things it pins:

- An enum constant is a **resolved** key. Reporting it as computed would be wrong;
  the constant name is the key.
- `togglz.features.<KEY>.enabled` normalizes to `<KEY>`, so the configuration
  entry and the enum constant are one flag rather than two.
- `.isActive()` is only Togglz where Togglz is imported. Elsewhere it is an
  ordinary method.
