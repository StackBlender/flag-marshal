# Flag Marshal

Feature-flag technical debt, found in your workspace and shown where the flags are.

Flag Marshal reads your source with real parsers and builds an inventory of every
feature flag it can see: where each one is referenced, whether any configuration
defines it, and which ones look like debt — referenced only from tests, absent
from code, past a declared expiry.

**Analysis runs on your machine.** No source leaves your computer, no account is
required, and the extension makes no network calls.

## What it reads

TypeScript, JavaScript, Java and Kotlin, plus `yml`, `yaml` and `.properties`
configuration. LaunchDarkly, OpenFeature, Unleash, Togglz, Spring
`@ConditionalOnProperty`, and environment-variable switches.

A key that cannot be read from the source — built from a variable, or joined at
runtime — is reported as computed and **never guessed**. If a flag platform is in
use that this version cannot read, the inventory says so rather than quietly
leaving it out.

## Using it

The Feature Flags view appears in the Explorer. Selecting a reference opens it.
Flags with evidence of debt are listed first, highest debt score first, with the
reasons in the hover; the sort button in the view's title switches to name order.
A score is a lead to review, not a verdict that a flag can be removed.
Findings appear as diagnostics in the Problems panel and inline where the flag is
used. The workspace is rescanned when you save.

Run **Flag Marshal: Scan workspace for feature flags** from the command palette to
rescan on demand.
