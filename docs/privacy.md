# Privacy

Flag Marshal analysis is local. Source code, flag keys, configuration, findings, and
repository metadata are processed on your machine and are not uploaded by Flag
Marshal. The analysis core is tested to reject network dependencies, and the product
has no hosted backend, account, or telemetry.

An Unleash export you pass with `--unleash-export` is read from your disk like any
other file. Flag Marshal never contacts Unleash or any provider. A report built with
it names the export file, relative to the repository (or only its file name when it
lies outside), and the flag keys the export contains. Treat that report as you would
the export itself.

This statement covers Flag Marshal's analysis. It does not describe the behavior of
npm, your package manager, CI provider, or other tools you run alongside it. Review
their policies separately.

Flag keys often name unreleased features. Before posting an issue or pull request in
this public repository, replace real flag keys with placeholders and remove secrets,
credentials, personal or customer data, proprietary source code, and sensitive logs.

This page summarizes the current behavior. It is not legal advice.
