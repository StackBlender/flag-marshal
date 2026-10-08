import { relative, resolve, sep } from 'node:path';
import {
  applyRatchet,
  compareReports,
  CORE_VERSION,
  makeBaseline,
  openWorkspace,
  readTrend,
  POLICY_FINDING_IDS,
  BASELINE_PATH,
  SETTINGS_FILE,
  type Baselines,
  type FileSystem,
  type Finding,
  type GitHistory,
  type RefactorPreview,
  type ScanReport,
} from '../../core/api/index.js';
import { unifiedDiff } from './render-diff.js';
import { refusalText } from '../../present/refactor.js';
import { renderCheck, renderCheckSince, renderChanges } from './render.js';
import { renderScan } from './render.js';
import { renderChangesMarkdown, renderMarkdown } from './render-markdown.js';
import { renderSarif } from './render-sarif.js';
import { renderCodeQuality, renderGithub } from './render-ci.js';
import { starterSettings } from './init.js';
import { helperCandidates } from '../../present/summary.js';

const USAGE = `flag-marshal — local-first feature-flag technical-debt analysis

Usage:
  flag-marshal <command> [options]

Commands:
  scan [path]    Inventory feature flags in a repository (default: .)
  init [path]    Write a starter .flagmarshal.yml, declaring helpers it finds
  check [path]   Enforce flag policy; exits 2 on a new violation
  trend [path]   Show how accepted flag debt has moved over time
  preview <key> --on|--off [path]
                 Show the diff that resolves one flag to a fixed value.
                 Writes nothing; --format=diff output pipes into git apply

Options:
  --format=<fmt>      human (default), json, markdown, sarif, github
                      (Actions annotations), or codequality (GitLab)
  --json              Shorthand for --format=json
  --no-git            Skip git history; output becomes fully deterministic
  --update-baseline   check: accept current violations as existing debt
  --changed-since <ref>
                      scan, check: report only what changed since the merge
                      base of <ref> and HEAD, such as origin/main. "auto"
                      reads the pull request's base from the CI environment
  -h, --help          Show this help
  -v, --version       Show the core version

Policy lives in .flagmarshal.yml. The first "check --update-baseline" records
existing debt so CI fails only on violations added after that point.

Analysis is local-only. Flag Marshal makes no network calls.`;

/**
 * Exit codes are part of the CLI contract: 0 ok, 1 usage error, 2 policy breach,
 * 3 a refactor preview refused because it could not be shown exactly.
 */
export const EXIT = { OK: 0, USAGE: 1, POLICY: 2, REFUSED: 3 } as const;

export interface CliContext {
  readonly fs: FileSystem;
  /** Overrides the baseline path, for tests. */
  readonly baselineFile?: string;
  /** Baseline persistence. The core never writes files. */
  readonly baselines?: Baselines;
  /**
   * Creates the settings file for `init`, failing if one already exists. The
   * core never writes files, so this is the frontend's to supply.
   */
  readonly createSettings?: (root: string, text: string) => Promise<void>;
  /** Supplies commit history. Omitted, the scan runs without git evidence. */
  readonly git?: (root: string) => GitHistory;
  /**
   * Opens the workspace as it was at the merge base of `ref` and `HEAD`, for
   * `--changed-since`. Rejects with a message that is safe to print: it never
   * carries file contents or flag keys.
   */
  readonly snapshot?: (root: string, ref: string) => Promise<Snapshot>;
  /** True when `root` is a shallow clone, so the CLI can say why ages are missing. */
  readonly shallow?: (root: string) => Promise<boolean>;
  /** The process environment, read only to find a pull request's base in CI. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Unix seconds treated as "now". Defaults to the wall clock. */
  readonly now?: number;
  /** Resolves a user-supplied path to an absolute one. */
  readonly cwd: string;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

/** A workspace at an earlier commit, readable through the filesystem port. */
export interface Snapshot {
  readonly commit: string;
  readonly fs: FileSystem;
  close(): void;
}

export async function run(argv: readonly string[], ctx: CliContext): Promise<number> {
  const [command, ...rest] = argv;

  if (command === undefined || command === '-h' || command === '--help') {
    ctx.out(USAGE);
    return EXIT.OK;
  }

  if (command === '-v' || command === '--version') {
    ctx.out(CORE_VERSION);
    return EXIT.OK;
  }

  if (command === 'scan') return scan(rest, ctx);
  if (command === 'init') return init(rest, ctx);

  if (command === 'check') return check(rest, ctx);
  if (command === 'trend') return trend(rest, ctx);
  if (command === 'preview') return preview(rest, ctx);

  ctx.err(`flag-marshal: unknown command '${command}'`);
  ctx.out(USAGE);
  return EXIT.USAGE;
}

export type Format = 'human' | 'json' | 'markdown' | 'sarif' | 'github' | 'codequality';
const FORMATS: readonly Format[] = ['human', 'json', 'markdown', 'sarif', 'github', 'codequality'];

interface Parsed {
  readonly root: string;
  readonly format: Format;
  readonly useGit: boolean;
  readonly updateBaseline: boolean;
  /** The ref given to `--changed-since`, when comparing. */
  readonly changedSince?: string;
  readonly error?: string;
}

function parseArgs(
  command: string,
  argv: readonly string[],
  ctx: CliContext,
  allowed: string[],
): Parsed {
  const base: Parsed = { format: 'human', useGit: true, updateBaseline: false, root: '' };

  // `--changed-since <ref>` takes a value, so it is lifted out before the ref
  // could be mistaken for the path. Git users write it both ways.
  let changedSince: string | undefined;
  const args: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--changed-since' || arg.startsWith('--changed-since=')) {
      if (!allowed.includes('--changed-since'))
        return { ...base, error: `unknown option '--changed-since'` };
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
      if (value === undefined || value === '') {
        return { ...base, error: '--changed-since needs a ref, such as origin/main' };
      }
      changedSince = value;
      continue;
    }
    args.push(arg);
  }

  const positional = args.filter((a) => !a.startsWith('-'));

  if (positional.length > 1) {
    return { ...base, error: `${command} takes at most one path, got ${positional.length}` };
  }

  const unknown = args.find(
    (a) => a.startsWith('-') && !allowed.includes(a) && !a.startsWith('--format='),
  );
  if (unknown !== undefined) return { ...base, error: `unknown option '${unknown}'` };

  let format: Format = args.includes('--json') ? 'json' : 'human';
  const explicit = args.find((a) => a.startsWith('--format='));
  if (explicit !== undefined) {
    const value = explicit.slice('--format='.length);
    if (!(FORMATS as readonly string[]).includes(value)) {
      return { ...base, error: `unknown format '${value}'. Use ${FORMATS.join(', ')}` };
    }
    format = value as Format;
  }

  return {
    root: resolve(ctx.cwd, positional[0] ?? '.'),
    format,
    useGit: !args.includes('--no-git'),
    updateBaseline: args.includes('--update-baseline'),
    ...(changedSince === undefined ? {} : { changedSince }),
  };
}

async function analyze(parsed: Parsed, ctx: CliContext): Promise<ScanReport> {
  return openWorkspace({
    root: parsed.root,
    fs: ctx.fs,
    ...(ctx.git === undefined || !parsed.useGit ? {} : { git: ctx.git(parsed.root) }),
    ...(ctx.now === undefined ? {} : { now: ctx.now }),
  }).scan();
}

/**
 * Scans the workspace now and at the comparison base, and reports the
 * difference in `changes`.
 *
 * Both scans share one git history and one "now". Age-based findings then agree
 * on both sides, so every change reported comes from code, not from the clock,
 * and each key's history is looked up once rather than twice.
 *
 * Returns a message instead of a report when the comparison cannot be made.
 */
async function analyzeChanges(
  parsed: Parsed & { changedSince: string },
  ctx: CliContext,
): Promise<ScanReport | string> {
  if (ctx.snapshot === undefined) return 'this frontend cannot read git history';

  let snapshot: Snapshot;
  try {
    snapshot = await ctx.snapshot(parsed.root, parsed.changedSince);
  } catch (error) {
    return `cannot compare: ${error instanceof Error ? error.message : 'git failed'}`;
  }

  try {
    const git = ctx.git === undefined || !parsed.useGit ? undefined : ctx.git(parsed.root);
    const now = ctx.now ?? Math.floor(Date.now() / 1000);
    const scanOf = (fs: FileSystem): Promise<ScanReport> =>
      openWorkspace({ root: parsed.root, fs, now, ...(git === undefined ? {} : { git }) }).scan();

    const head = await scanOf(ctx.fs);
    const base = await scanOf(snapshot.fs);
    const changes = compareReports(base, head, {
      ref: parsed.changedSince,
      commit: snapshot.commit,
    });
    return { ...head, changes };
  } finally {
    snapshot.close();
  }
}

const comparing = (parsed: Parsed): parsed is Parsed & { changedSince: string } =>
  parsed.changedSince !== undefined;

/**
 * Where each CI system names a pull request's base, most exact first. GitLab
 * gives the merge base itself; the others give a branch name, which a full
 * checkout has as `origin/<branch>`.
 */
const PULL_REQUEST_BASES: readonly {
  readonly variable: string;
  readonly ref: (value: string) => string;
}[] = [
  { variable: 'CI_MERGE_REQUEST_DIFF_BASE_SHA', ref: (sha) => sha },
  { variable: 'GITHUB_BASE_REF', ref: (branch) => `origin/${branch}` },
  { variable: 'CI_MERGE_REQUEST_TARGET_BRANCH_NAME', ref: (branch) => `origin/${branch}` },
  { variable: 'BITBUCKET_PR_DESTINATION_BRANCH', ref: (branch) => `origin/${branch}` },
  {
    variable: 'SYSTEM_PULLREQUEST_TARGETBRANCH',
    ref: (branch) => `origin/${branch.replace(/^refs\/heads\//, '')}`,
  },
];

/** The pull request's base from the CI environment, or undefined outside one. */
export function pullRequestBase(
  env: Readonly<Record<string, string | undefined>>,
): { readonly ref: string; readonly variable: string } | undefined {
  for (const { variable, ref } of PULL_REQUEST_BASES) {
    const value = env[variable]?.trim();
    if (value !== undefined && value !== '') return { ref: ref(value), variable };
  }
  return undefined;
}

/**
 * Replaces `--changed-since=auto` with the pull request's base. Outside a pull
 * request there is no base to find, and comparing against a guess would report
 * someone else's changes as this one's, so that is a usage error.
 */
function withBase(parsed: Parsed, ctx: CliContext): Parsed | string {
  if (parsed.changedSince !== 'auto') return parsed;
  const base = pullRequestBase(ctx.env ?? {});
  if (base === undefined) {
    return `--changed-since=auto found no pull request base in the environment; name a ref instead, such as origin/main`;
  }
  ctx.err(`flag-marshal: comparing with ${base.ref} (from ${base.variable})`);
  return { ...parsed, changedSince: base.ref };
}

/**
 * Says why flag ages are missing in a shallow clone, the default checkout in
 * most CI systems. The scan already treats such a clone as having no history;
 * this tells the reader how to give it one.
 */
async function warnIfShallow(
  parsed: Parsed,
  ctx: CliContext,
  missing = 'flag age and staleness are not measured',
): Promise<void> {
  if (!parsed.useGit || ctx.git === undefined || ctx.shallow === undefined) return;
  if (!(await ctx.shallow(parsed.root))) return;
  ctx.err(
    `flag-marshal: this is a shallow clone, so ${missing}. ` +
      'Fetch full history (fetch-depth: 0 with actions/checkout, GIT_DEPTH: 0 on GitLab).',
  );
}

async function scan(args: readonly string[], ctx: CliContext): Promise<number> {
  const parsed = parseArgs('scan', args, ctx, ['--json', '--no-git', '--changed-since']);
  if (parsed.error !== undefined) {
    ctx.err(`flag-marshal: ${parsed.error}`);
    return EXIT.USAGE;
  }

  const based = withBase(parsed, ctx);
  if (typeof based === 'string') {
    ctx.err(`flag-marshal: ${based}`);
    return EXIT.USAGE;
  }
  await warnIfShallow(based, ctx);

  const report = comparing(based) ? await analyzeChanges(based, ctx) : await analyze(based, ctx);
  if (typeof report === 'string') {
    ctx.err(`flag-marshal: ${report}`);
    return EXIT.USAGE;
  }

  // `scan` reports; it never enforces. Exit stays 0 no matter what it finds, so
  // it is safe to run anywhere without failing a pipeline. `check` is the one
  // that fails builds.
  ctx.out(format(report, parsed.format, checkoutPrefix(parsed, ctx)));
  return EXIT.OK;
}

/**
 * Writes a starter `.flagmarshal.yml`.
 *
 * It never overwrites: a team's existing policy is exactly the file that must not
 * be replaced by a template. The scan that finds helpers skips git history,
 * because init needs only the shape of the code and should answer quickly.
 */
async function init(args: readonly string[], ctx: CliContext): Promise<number> {
  const parsed = parseArgs('init', args, ctx, []);
  if (parsed.error !== undefined) {
    ctx.err(`flag-marshal: ${parsed.error}`);
    return EXIT.USAGE;
  }
  if (ctx.createSettings === undefined) {
    ctx.err('flag-marshal: this frontend cannot write files');
    return EXIT.USAGE;
  }
  if (await exists(ctx, `${parsed.root}/${SETTINGS_FILE}`)) {
    ctx.err(`flag-marshal: ${SETTINGS_FILE} already exists; it was not changed.`);
    return EXIT.USAGE;
  }

  const helpers = helperCandidates(await analyze({ ...parsed, useGit: false }, ctx));
  try {
    await ctx.createSettings(parsed.root, starterSettings(helpers));
  } catch {
    ctx.err(`flag-marshal: could not write ${SETTINGS_FILE}; it may already exist.`);
    return EXIT.USAGE;
  }

  ctx.out(`Wrote ${SETTINGS_FILE}.`);
  if (helpers.length > 0) {
    ctx.out(
      `Declared ${helpers.length === 1 ? 'a flag helper' : 'flag helpers'}: ${helpers.join(', ')}.`,
    );
  }
  ctx.out('Policy options are included, commented out. Run "flag-marshal scan" to see the result.');
  return EXIT.OK;
}

async function exists(ctx: CliContext, path: string): Promise<boolean> {
  try {
    await ctx.fs.readFile(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * A report carrying `changes` is about the change, so the human and Markdown
 * views show only that, and SARIF carries only the findings it introduced. JSON
 * keeps everything: the whole inventory plus the change set.
 */
function format(report: ScanReport, as: Format, prefix: string): string {
  const changes = report.changes;
  // SARIF and CI annotations describe what a change introduced when asked
  // about one, so a pull request is annotated only with its own findings.
  const annotated =
    changes === undefined ? report : { ...report, findings: changes.introducedFindings };
  switch (as) {
    case 'github':
      return renderGithub(annotated, prefix);
    case 'codequality':
      return renderCodeQuality(annotated, prefix);
    case 'json':
      return JSON.stringify(report, null, 2);
    case 'sarif':
      return renderSarif(annotated);
    case 'markdown':
      return changes === undefined ? renderMarkdown(report) : renderChangesMarkdown(changes);
    case 'human':
      return changes === undefined ? renderScan(report) : renderChanges(changes);
  }
}

/**
 * The scanned root relative to the working directory, with forward slashes.
 * CI systems resolve annotation paths against the checkout, which is where a
 * pipeline runs from, not against the directory that was scanned.
 */
function checkoutPrefix(parsed: Parsed, ctx: CliContext): string {
  return relative(ctx.cwd, parsed.root).split(sep).join('/');
}

const isPolicyFinding = (finding: Finding): boolean =>
  (POLICY_FINDING_IDS as readonly string[]).includes(finding.id);

/**
 * Enforces policy, with the baseline ratchet.
 *
 * `check` deliberately enforces **policy** findings only — missing owners,
 * missing or passed expiry dates, and the flag budget. Those are facts about the
 * repository. Drift findings like `flag.stale` are inferences with a confidence,
 * and failing a build on an inference is how a tool loses a team's trust in one
 * afternoon.
 */
async function check(args: readonly string[], ctx: CliContext): Promise<number> {
  const parsed = parseArgs('check', args, ctx, [
    '--json',
    '--no-git',
    '--update-baseline',
    '--changed-since',
  ]);
  if (parsed.error !== undefined) {
    ctx.err(`flag-marshal: ${parsed.error}`);
    return EXIT.USAGE;
  }
  const based = withBase(parsed, ctx);
  if (typeof based === 'string') {
    ctx.err(`flag-marshal: ${based}`);
    return EXIT.USAGE;
  }
  await warnIfShallow(based, ctx);
  if (comparing(based)) {
    if (based.updateBaseline) {
      ctx.err('flag-marshal: --update-baseline and --changed-since cannot be combined');
      return EXIT.USAGE;
    }
    return checkSince(based, ctx);
  }

  const report = await analyze(parsed, ctx);
  const violations = report.findings.filter(isPolicyFinding);

  if (parsed.updateBaseline) {
    if (ctx.baselines === undefined) {
      ctx.err('flag-marshal: this frontend cannot write a baseline');
      return EXIT.USAGE;
    }
    const baseline = makeBaseline(violations);
    await ctx.baselines.write(parsed.root, baseline);
    ctx.out(`Baseline written: ${baseline.accepted.length} existing violations accepted.`);
    ctx.out('CI will now fail only on violations added after this point.');
    return EXIT.OK;
  }

  const baseline = await ctx.baselines?.read(parsed.root);
  const result = applyRatchet(violations, baseline);

  if (parsed.format === 'human') {
    ctx.out(renderCheck(result, baseline !== undefined));
  } else if (parsed.format === 'json') {
    ctx.out(JSON.stringify({ ...report, findings: violations, ratchet: result }, null, 2));
  } else {
    // Markdown and SARIF describe what CI would fail on, so they carry the
    // introduced violations rather than everything the baseline already accepts.
    ctx.out(
      format(
        { ...report, findings: result.introduced },
        parsed.format,
        checkoutPrefix(parsed, ctx),
      ),
    );
  }

  return result.introduced.length > 0 ? EXIT.POLICY : EXIT.OK;
}

/**
 * Enforces policy on what one change introduced, with no baseline at all.
 *
 * The comparison is the ratchet: violations already present at the merge base
 * are someone else's, and only the ones this change adds fail. That makes
 * `check --changed-since origin/main` usable on a branch without a committed
 * baseline, and it ignores one if there is.
 */
async function checkSince(
  parsed: Parsed & { changedSince: string },
  ctx: CliContext,
): Promise<number> {
  const report = await analyzeChanges(parsed, ctx);
  if (typeof report === 'string') {
    ctx.err(`flag-marshal: ${report}`);
    return EXIT.USAGE;
  }
  const changes = report.changes;
  const introduced = (changes?.introducedFindings ?? []).filter(isPolicyFinding);
  const resolved = (changes?.resolvedFindings ?? []).filter(isPolicyFinding);

  if (parsed.format === 'human') {
    ctx.out(renderCheckSince(parsed.changedSince, introduced, resolved));
  } else if (parsed.format === 'json') {
    ctx.out(JSON.stringify({ ...report, findings: introduced }, null, 2));
  } else {
    // As in a baseline check, Markdown and SARIF carry what would fail.
    const { changes: _changes, ...whole } = report;
    ctx.out(format({ ...whole, findings: introduced }, parsed.format, checkoutPrefix(parsed, ctx)));
  }

  return introduced.length > 0 ? EXIT.POLICY : EXIT.OK;
}

const PREVIEW_FORMATS = ['human', 'json', 'diff'] as const;
type PreviewFormat = (typeof PREVIEW_FORMATS)[number];

/**
 * Shows what resolving one flag to a fixed value does to the code. Writes
 * nothing: the diff is for review, and applying it is a separate step that
 * belongs to the person reviewing it (`--format=diff | git apply`).
 */
async function preview(args: readonly string[], ctx: CliContext): Promise<number> {
  const usage = (message: string): number => {
    ctx.err(`flag-marshal: ${message}`);
    return EXIT.USAGE;
  };
  const positional = args.filter((a) => !a.startsWith('-'));
  const [key, path, ...extra] = positional;
  if (key === undefined) return usage('preview needs a flag key');
  if (extra.length > 0) return usage('preview takes a flag key and at most one path');

  const on = args.includes('--on');
  const off = args.includes('--off');
  if (on === off) return usage('preview needs exactly one of --on or --off');

  let format: PreviewFormat = args.includes('--json') ? 'json' : 'human';
  for (const arg of args.filter((a) => a.startsWith('-'))) {
    if (arg.startsWith('--format=')) {
      const value = arg.slice('--format='.length);
      if (!(PREVIEW_FORMATS as readonly string[]).includes(value)) {
        return usage(`unknown format '${value}'. Use ${PREVIEW_FORMATS.join(', ')}`);
      }
      format = value as PreviewFormat;
    } else if (!['--on', '--off', '--json', '--no-git'].includes(arg)) {
      return usage(`unknown option '${arg}'`);
    }
  }

  const root = resolve(ctx.cwd, path ?? '.');
  const useGit = !args.includes('--no-git') && ctx.git !== undefined;
  const result = await openWorkspace({
    root,
    fs: ctx.fs,
    ...(useGit && ctx.git !== undefined ? { git: ctx.git(root) } : {}),
    ...(ctx.now === undefined ? {} : { now: ctx.now }),
  }).previewResolution(key, on ? 'on' : 'off');

  if (format === 'json') ctx.out(JSON.stringify(result, null, 2));
  else if (format === 'diff') {
    if (result.outcome === 'preview') ctx.out(diffOf(result));
    else ctx.err(renderRefusal(result));
  } else {
    ctx.out(result.outcome === 'preview' ? renderPreview(result) : renderRefusal(result));
  }
  return result.outcome === 'preview' ? EXIT.OK : EXIT.REFUSED;
}

function diffOf(result: RefactorPreview): string {
  return result.files.map((file) => unifiedDiff(file.path, file.before, file.after)).join('\n');
}

function renderPreview(result: RefactorPreview): string {
  const sites = result.files.reduce((n, file) => n + file.sites, 0);
  const files = result.files.length;
  const reads = sites === 1 ? '1 read' : `${sites} reads`;
  const where = files === 1 ? '1 file' : `${files} files`;
  const lines = [
    `Resolving ${result.key} to ${result.value} rewrites ${reads} in ${where}. Nothing was written.`,
    `Its staleness confidence is ${result.confidence ?? 'unknown'}. This shows what the code does with`,
    `the flag ${result.value}; it does not say the flag can be removed. Imports and clients are left as they are.`,
    `To apply it: flag-marshal preview ${result.key} --${result.value} --format=diff | git apply`,
    '',
    diffOf(result),
  ];
  return lines.join('\n');
}

function renderRefusal(result: RefactorPreview): string {
  // An unknown key is not echoed: flag keys stay out of error output.
  const subject = result.refusals.some((r) => r.reason === 'unknown-flag')
    ? 'that flag'
    : `${result.key} resolved to ${result.value}`;
  const lines = [`Cannot preview ${subject} exactly:`, ''];
  for (const refusal of result.refusals) {
    const where =
      refusal.file === undefined
        ? ''
        : refusal.line === undefined
          ? `${refusal.file}  `
          : `${refusal.file}:${refusal.line + 1}  `;
    lines.push(`  ${where}${refusalText(refusal.reason)}`);
  }
  return lines.join('\n');
}

/**
 * Flag-debt history, read from the baseline file's own git log.
 *
 * No hosted database, no telemetry: the baseline is committed alongside the code,
 * so the record of how much debt a team carried already exists in their history.
 */
async function trend(args: readonly string[], ctx: CliContext): Promise<number> {
  const parsed = parseArgs('trend', args, ctx, ['--json', '--no-git']);
  if (parsed.error !== undefined) {
    ctx.err(`flag-marshal: ${parsed.error}`);
    return EXIT.USAGE;
  }
  if (ctx.git === undefined || !parsed.useGit) {
    ctx.err('flag-marshal: trend needs git history');
    return EXIT.USAGE;
  }

  await warnIfShallow(parsed, ctx, 'the trend covers only the history it fetched');
  const history = await readTrend(ctx.git(parsed.root), ctx.baselineFile ?? BASELINE_PATH);

  if (parsed.format === 'json') {
    ctx.out(JSON.stringify(history, null, 2));
    return EXIT.OK;
  }

  if (history.points.length === 0) {
    ctx.out('No baseline history yet. Commit a baseline to start recording the trend.');
    return EXIT.OK;
  }

  ctx.out('Accepted flag debt over time:');
  ctx.out('');
  for (const point of history.points) {
    const date = new Date(point.timestamp * 1000).toISOString().slice(0, 10);
    ctx.out(`  ${date}  ${String(point.accepted).padStart(4)}  ${point.commit.slice(0, 8)}`);
  }
  ctx.out('');
  const direction = history.change < 0 ? 'down' : history.change > 0 ? 'up' : 'unchanged';
  ctx.out(`  ${direction} ${Math.abs(history.change)} since the first recorded baseline.`);
  return EXIT.OK;
}
