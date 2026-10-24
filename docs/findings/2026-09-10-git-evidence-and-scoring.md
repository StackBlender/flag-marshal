# Git evidence, scoring and the performance budget (2026-09-10)

Milestone 5. Verified end to end against a synthetic repository with real backdated commits: a flag introduced in January 2023 is reported as `introduced 3.7 years ago; last changed 3.7 years ago` while a flag added that day is not flagged. Probes: counting age and dormancy separately fails 3 tests, removing the partial-coverage cap fails 2, recording configuration absence for remote providers fails 1. No catalog message contains the phrase "safe to delete" (a contract test enforces it).

| Workload | With git | `--no-git` |
| --- | --- | --- |
| 30,100 files, 0 flags | 0.51s | 0.44s |
| 60 files, 180 flags, 6 commits | 0.79s | 0.36s |
| One pickaxe, 38-commit repository | ~0.11s | — |

Git evidence costs one `git log -S` per flag, and pickaxe cost grows with history depth, so the total is roughly *flags x commits*. At 0.11s per call, 200 flags would cost ~20s on that repository. A 5s per-key timeout degrades to "no history evidence" rather than hanging. Later measurements: [scan performance](2026-09-11-scan-performance.md), [deep history](2026-09-22-git-evidence-deep-history.md).

- **Git is a port**; the core spawns no processes. Keys are argv entries and `--` ends option parsing, so a key with shell metacharacters or a leading dash is inert.
- **Pickaxe, not file timestamps**: a file edited yesterday can carry a flag added three years ago.
- **Age and dormancy count as one signal**; counting them twice would manufacture agreement and inflate confidence.
- **Absence from configuration is evidence only for locally configured mechanisms**: the milestone 4 mistake, found a second time in the evidence layer.
- **`debtScore` and `confidence` are separate axes.** A high-scoring flag at `low` confidence is a lead, never a conclusion. Wide reach reduces urgency rather than raising it.
- **Goldens pin detection, not scoring**, since evidence depends on history; scoring is asserted by unit tests.
- **`unreadable-languages` was added to the contract**: milestone 4 had overloaded `module-spread`, which rendered as "sources not read: 1" once real spread existed.
- Branch complexity was deferred: it needs AST context from detection, a contract field and rebuilt goldens, for a marginal scoring contribution.
