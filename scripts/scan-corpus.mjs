/**
 * Regression harness for the public corpus.
 *
 * Fixtures are written by whoever wrote the detector, so they cannot catch the
 * defects that matter — every significant credibility bug in this project came
 * from running against code nobody here wrote. This locks in what those
 * repositories currently produce, so a change that silently loses detections
 * fails loudly.
 *
 * The corpus is deliberately **not** checked in: it lives outside every
 * StackBlender repository. Only the baseline is committed, and the harness skips
 * cleanly when the corpus is absent, so CI never depends on cloning it.
 *
 *   node scripts/scan-corpus.mjs            report current counts
 *   node scripts/scan-corpus.mjs --check    fail if counts drift from the baseline
 *   node scripts/scan-corpus.mjs --update   rewrite the baseline
 *
 * Corpus location: $FLAG_MARSHAL_CORPUS, else ~/flag-marshal-corpus.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = resolve(root, 'corpus-baseline.json');
const CORPUS = process.env.FLAG_MARSHAL_CORPUS ?? resolve(homedir(), 'flag-marshal-corpus');
const ENTRY = resolve(root, 'dist/frontends/cli/main.js');

const mode = process.argv.includes('--check')
  ? 'check'
  : process.argv.includes('--update')
    ? 'update'
    : 'report';

if (!existsSync(CORPUS)) {
  console.log(`No corpus at ${CORPUS}. See its README for setup; skipping.`);
  process.exit(0);
}
if (!existsSync(ENTRY)) {
  console.error('Build first: npm run build');
  process.exit(1);
}

const repositories = readdirSync(CORPUS)
  .filter((name) => statSync(resolve(CORPUS, name)).isDirectory())
  .sort();

/** Counts, not full reports: a report changes on every upstream commit. */
function measure(name) {
  // --no-git because these are shallow clones; history evidence is meaningless.
  const stdout = execFileSync(
    'node',
    [ENTRY, 'scan', resolve(CORPUS, name), '--json', '--no-git'],
    {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  const report = JSON.parse(stdout);

  const providers = new Set();
  for (const flag of report.flags) {
    for (const reference of flag.references) providers.add(reference.provider);
  }

  return {
    flags: report.flags.length,
    unresolved: report.unresolvedReferences.length,
    providers: [...providers].sort(),
    unsupported: (report.unsupportedProviders ?? []).map((p) => p.name).sort(),
  };
}

const current = {};
for (const name of repositories) {
  process.stdout.write(`${name.padEnd(22)} `);
  try {
    current[name] = measure(name);
    const m = current[name];
    console.log(
      `flags ${String(m.flags).padStart(4)}  unresolved ${String(m.unresolved).padStart(4)}  [${m.providers.join(',') || 'none'}]`,
    );
  } catch (error) {
    console.log(`FAILED: ${String(error).slice(0, 80)}`);
    if (mode === 'check') process.exitCode = 1;
  }
}

if (mode === 'update') {
  writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  // The baseline is committed and `npm run check` checks formatting, so an
  // update that leaves it unformatted fails the very next check for a reason
  // that has nothing to do with the corpus.
  execFileSync('npx', ['prettier', '--write', BASELINE], { stdio: 'ignore' });
  console.log(`\nBaseline written: ${BASELINE}`);
  process.exit(0);
}

if (mode !== 'check') process.exit(0);

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const problems = [];

for (const [name, expected] of Object.entries(baseline)) {
  const actual = current[name];
  if (actual === undefined) {
    console.log(`\n  ${name}: in the baseline but not cloned — skipped, not failed.`);
    continue;
  }
  // Detections may rise as support improves; losing them is the regression.
  if (actual.flags < expected.flags) {
    problems.push(`${name}: flags fell ${expected.flags} -> ${actual.flags}`);
  }
  const lost = expected.providers.filter((p) => !actual.providers.includes(p));
  if (lost.length > 0) problems.push(`${name}: providers no longer detected: ${lost.join(', ')}`);
  if (actual.unresolved > expected.unresolved) {
    problems.push(`${name}: unresolved rose ${expected.unresolved} -> ${actual.unresolved}`);
  }
}

if (problems.length > 0) {
  console.error('\nCorpus regression:');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('\nIf the change is intended, review it and run: npm run corpus:update');
  process.exit(1);
}

console.log('\nNo corpus regression.');
