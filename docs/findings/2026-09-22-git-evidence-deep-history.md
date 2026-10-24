# Git evidence on deep history (2026-09-22)

Full `togglz` history (1,764 commits): git adds 0.6s to a scan (2.53s -> 3.12s), about 0.1s per pickaxe. A synthetic 5,000-commit, 200-flag repository: about 1s. The earlier "minutes on a deep history" was an estimate, and nothing measured reproduces it.

The previously recorded fix (one `git log --name-only` pass with file-level dates) is also a correctness risk: file-level dates are what the "pickaxe, not file timestamps" decision rejects. The sound design, if a repository shows the cost, is in the [single-pass git evidence proposal](../roadmap/proposals/2026-09-22-single-pass-git-evidence.md).
