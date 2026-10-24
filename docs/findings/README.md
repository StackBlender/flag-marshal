# Flag Marshal findings

Measurements, experiment results, design findings and superseded decisions, one file each, newest first. The plan is in [ROADMAP.md](../../ROADMAP.md). Work from 2026-09-09 to 2026-09-11 was not dated slice by slice; it carries the date of the release (0.1.1, 2026-09-10) or pause (2026-09-11) that closed it.

- 2026-10-14 [The GitHub recipe on hosted runners](2026-10-14-github-ci-recipe-hosted.md): the `docs/ci.md` GitHub recipe passed a clean PR, failed a violating one with exit 2 and a line annotation, and needed `if: ${{ !cancelled() }}` on its summary step.
- 2026-10-07 [CI formats, CI-aware defaults and recipes](2026-10-07-ci-support.md): GitHub and GitLab annotation formats, `--changed-since=auto`, and a shallow clone treated as no history because its ages were confidently wrong.
- 2026-10-07 [The refactor preview](2026-10-07-refactor-preview.md): the preview is gated on an exact rewrite, not `HIGH` confidence (superseded gate); 122 corpus previews were all refused as `unsupported-shape`.
- 2026-10-07 [Editor frontends dropped](2026-10-07-editor-frontends-removed.md): the VS Code extension, `serve --stdio` and the IntelliJ and marketplace plans were removed (superseded decisions).
- 2026-09-22 [Open-sourcing as a fresh repository](2026-09-22-open-source-fresh-repository.md): customer pseudonyms in code and history meant a new public repository from one tree, folding in the support repository.
- 2026-09-22 [Git evidence on deep history](2026-09-22-git-evidence-deep-history.md): git adds 0.6s on 1,764 commits and about 1s for 200 flags over 5,000 commits; the "minutes" estimate is not reproduced.
- 2026-09-22 [Helper suggestions, Spring prefix and init](2026-09-22-helper-suggestion-spring-prefix-init.md): helper names are suggested but never SDK method names; Spring prefixes compose as Spring does; `init` never overwrites.
- 2026-09-22 [Scan summary, debt ranking and helper coverage](2026-09-22-scan-summary-and-helpers.md): reports lead with a debt headline and ranking; declared helpers match bare calls, pass keys through and attribute to the wrapped SDK.
- 2026-09-11 [Scan performance](2026-09-11-scan-performance.md): parsing, not git, was the cost; Spring Boot went from 55s to 6.4s and the two application repositories scan in 1.29s and 1.89s.
- 2026-09-11 [Detector credibility, round 7](2026-09-11-detector-round-7.md): the extension dropped the evidence, a mutable Java field resolved to a wrong key, and an explanation offered an impossible cause.
- 2026-09-11 [The VS Code extension](2026-09-11-vscode-extension.md): bundling, pruning 73 MB to 14 MB, why a fake editor is not enough, and `spring-boot` scanning in 55 seconds (removed 2026-10-07).
- 2026-09-11 [The JSON-RPC server for editors](2026-09-11-rpc-server.md): byte-counted framing and the self-await shutdown deadlock (removed 2026-10-07).
- 2026-09-10 [The npm publication boundary](2026-09-10-npm-publication-boundary.md): source comments carried the pricing strategy and 0.1.0 exposed internal material, so the package is an allowlisted generated artifact.
- 2026-09-10 [Togglz hardening and the Togglz price signal](2026-09-10-togglz-hardening.md): enums are identified by package-qualified name, `NamedFeature` is read, and the vendor-bill argument does not hold for a Togglz shop.
- 2026-09-10 [Detector credibility, round 6](2026-09-10-detector-round-6.md): mutable bindings and comments produced wrong keys until constants were read from the parse tree, with effectively-final keeping recall.
- 2026-09-10 [Detector credibility, round 5](2026-09-10-detector-round-5.md): regex-based Togglz discovery turned unrelated `Feature` enums into flags and erased inventories; it is now a tree-sitter query.
- 2026-09-10 [The corpus regression suite](2026-09-10-corpus-regression-suite.md): twelve public repositories, two per provider plus two that must stay silent; it immediately found constructor bindings missing (Unleash 0 to 20 flags).
- 2026-09-10 [Detector credibility, round 4](2026-09-10-detector-round-4.md): Togglz usages were missed and declarations counted as usage; `declaration` became its own reference kind.
- 2026-09-10 [Detector credibility, round 3](2026-09-10-detector-round-3.md): import gating lost no remote-provider calls, and reading same-file constants cut `java-sdk-contrib` from 170 unresolved keys to 2.
- 2026-09-10 [Detector credibility, round 2](2026-09-10-detector-round-2.md): unsupported platforms are disclosed, Spring switches get no age rules, and a call needs a receiver bound to the provider.
- 2026-09-10 [Detector credibility, round 1](2026-09-10-detector-round-1.md): method-name matching reported Lombok setters as flags; provider identity now comes from imports (superseded decision).
- 2026-09-10 [Tiers, the entitlement seam and licensing](2026-09-10-tiers-and-licensing.md): Free/Team/Pro by capability, never by provider, with offline keys designed and unbuilt (superseded 2026-09-22).
- 2026-09-10 [Reporting, SARIF and trend](2026-09-10-reporting-and-trend.md): trend comes from the committed baseline's own history; SARIF positions are 1-based; rule text carries no placeholders.
- 2026-09-10 [Policy engine, baseline and ratchet](2026-09-10-policy-and-ratchet.md): `check` enforces policy facts only, against a baseline whose identity ignores file position.
- 2026-09-10 [Validation gate waived](2026-09-10-validation-gate-waived.md): the owner proceeded to the paid tier without the gate's evidence (superseded 2026-09-22).
- 2026-09-10 [Second language and second provider](2026-09-10-second-language.md): providers became data; Kotlin's brace-less interpolation had produced the invented key `prefix-$name`.
- 2026-09-10 [Git evidence, scoring and the performance budget](2026-09-10-git-evidence-and-scoring.md): one pickaxe per flag costs about 0.11s each; age and dormancy are one signal; score and confidence are separate axes.
- 2026-09-10 [Configuration sources and gap rules](2026-09-10-configuration-gap-rules.md): remote providers never raise missing-configuration, and a config entry is a flag only under a flag namespace with a boolean value.
- 2026-09-10 [The first CLI scan](2026-09-10-cli-scan.md): a 30,100-file repository scanned in 0.44s; nested `.gitignore` patterns must be scoped to their directory.
- 2026-09-10 [The detection seam: grammars and literals](2026-09-10-detection-seam.md): WebAssembly grammars from `@vscode/tree-sitter-wasm`; tree-sitter columns are UTF-16 code units.
- 2026-09-10 [Boundary guards, the contract and the fixtures](2026-09-10-contract-and-fixtures.md): every guard was seen to fail on a real violation; the contract is one schema file with `$defs`.
