# Detector credibility, round 7: live repositories (2026-09-11)

External review ran the CLI against AcmeNav (17 flags) and AcmeCo (10 flags); every probe from rounds 1 to 6 passed.

- **A mutable Java field could still resolve to the wrong key:** `this.FLAG = "second"` was invisible to effectively-final analysis. A Java **field** must now say `final` (it can be written from anywhere); locals and parameters keep effectively-final treatment, and the reassignment query sees writes through a receiver in Java and TypeScript.
- **A pass that cannot see the writes must say so.** Widening the assignment query with a node type one grammar lacks made `new Query` throw, which was caught as an empty set, "nothing is reassigned", and two tests written to catch wrong keys went green. `reassignedNames` now returns `undefined` when it cannot analyse.
- **Round 7b: an impossible explanation.** `flag.missing-in-configuration` offered "served entirely by a remote provider" as a cause, though the rule never fires for remote providers, and claimed a missing Spring property makes the flag default on every request. Rewritten; gate and wording are cross-referenced in `provider-traits.ts` and `apply-rules.ts`. Counts held at 17/38 and 10/23 with zero unresolved.
