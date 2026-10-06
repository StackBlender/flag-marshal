import { SETTINGS_FILE } from '../../core/api/index.js';

/**
 * The starter `.flagmarshal.yml` that `flag-marshal init` writes.
 *
 * Nothing in the tool taught the configuration format: a user had to find the
 * README, and the helper declaration that makes a wrapped codebase readable at
 * all was the part most likely to be missed. So the file declares any helper the
 * scan found passing a key straight to an SDK, and carries every other option
 * commented out, with the reason for each beside it.
 *
 * Flag keys are confidential — they leak unreleased product names — so the
 * template never contains a real one. The examples are invented.
 */
export function starterSettings(helpers: readonly string[]): string {
  const custom =
    helpers.length > 0
      ? [
          '# Your own flag helpers. Each call to one is read as a flag reference, and a',
          '# helper that forwards its key straight to an SDK stops counting as unresolved.',
          '# Found by this scan: each passes its key parameter straight to an SDK call.',
          'customPatterns:',
          `  methods: [${helpers.join(', ')}]`,
        ]
      : [
          '# Your own flag helpers. Each call to one is read as a flag reference, and a',
          '# helper that forwards its key straight to an SDK stops counting as unresolved.',
          '# customPatterns:',
          '#   methods: [isFeatureOn]',
        ];

  return [
    `# ${SETTINGS_FILE} — Flag Marshal configuration.`,
    '# Everything here is optional. Analysis runs locally and nothing is uploaded.',
    '',
    ...custom,
    '',
    '# Policy, enforced by "flag-marshal check". Adopt it with',
    '# "flag-marshal check --update-baseline" so CI fails only on new violations.',
    '# policy:',
    '#   requireOwner: true      # every flag names a team',
    '#   requireExpiry: true     # every flag names a removal date',
    '#   maxAgeDays: 180         # flags older than this are violations; 0 disables',
    '#   budget: 50              # most flags this repository may carry; 0 disables',
    '#   allowlist:              # permanent by design, such as kill switches',
    '#     - example-kill-switch',
    '',
    '# Owner and expiry, declared here or beside the flag in any comment syntax:',
    '#   // flag-marshal: example-flag owner=team-example expiry=2027-01-31',
    '# flags:',
    '#   example-flag:',
    '#     owner: team-example',
    '#     expiry: 2027-01-31',
    '',
  ].join('\n');
}
