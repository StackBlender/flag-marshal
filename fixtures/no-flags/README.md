# Fixture: no-flags

Ordinary code containing no feature flags of any kind.

Expected result: **zero flags, zero findings.**

This fixture exists to prove the tool stays quiet. A flag detector that produces
findings on a codebase with no flags is worse than useless — false positives are
what get static-analysis tools uninstalled. Any change that makes this fixture
report anything is a bug, not a feature.
