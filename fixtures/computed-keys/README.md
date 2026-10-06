# Fixture: computed-keys

Flag call sites whose keys cannot be read statically.

| Call site | Expected |
| --- | --- |
| `PREFIX + name` | `resolution: "unresolved"`, `key: null` |
| `process.env.ROLLOUT_FLAG ?? 'fallback'` | `resolution: "unresolved"`, `key: null` |
| `'audit-log'` | `resolution: "resolved"`, `key: "audit-log"` |

Expected result: **one flag record (`audit-log`) and two unresolved references.**

This fixture guards the product's central credibility rule: computed keys are
reported as unresolved and never guessed. A detector that infers `experiment-*`
from a concatenation would produce confident nonsense. It also proves resolvable
and unresolvable references coexist in one file without contaminating each other.
