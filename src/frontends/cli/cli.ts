import { resolve } from 'node:path';
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
  type ScanReport,
} from '../../core/api/index.js';
import { renderCheck, renderCheckSince, renderChanges } from './render.js';
import { renderScan } from './render.js';
import { renderChangesMarkdown, renderMarkdown } from './render-markdown.js';
import { renderSarif } from './render-sarif.js';
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
  serve --stdio  Long-running analysis server for editor frontends

Options:
  --format=<fmt>      human (default), json, markdown, or sarif
  --json              Shorthand for --format=json
  --no-git            Skip git history; output becomes fully deterministic
  --update-baseline   check: accept current violations as existing debt
  --changed-since <ref>
                      scan, check: report only what changed since the merge
                      base of <ref> and HEAD, such as origin/main
  -h, --help          Show this help
  -v, --version       Show the core version

Policy lives in .flagmarshal.yml. The first "check --update-baseline" records
existing debt so CI fails only on violations added after that point.

Analysis is local-only. Flag Marshal makes no network calls.`;

/** Exit codes are part of the CLI contract: 0 ok, 1 usage error, 2 policy breach. */
export const EXIT = { OK: 0, USAGE: 1, POLICY: 2 } as const;

export interface CliContext {
  readonly fs: FileSystem;
  /** Overrides the baseline path, for tests. */
  readonly baselineFile?: string;
  /** Runs the stdio analysis server. Supplied only by frontends that own streams. */
  readonly serve?: () => Promise<void>;
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
  if (command === 'serve') return serve(rest, ctx);

  ctx.err(`flag-marshal: unknown command '${command}'`);
  ctx.out(USAGE);
  return EXIT.USAGE;
}

export type Format = 'human' | 'json' | 'markdown' | 'sarif';
const FORMATS: readonly Format[] = ['human', 'json', 'markdown', 'sarif'];

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

async function scan(args: readonly string[], ctx: CliContext): Promise<number> {
  const parsed = parseArgs('scan', args, ctx, ['--json', '--no-git', '--changed-since']);
  if (parsed.error !== undefined) {
    ctx.err(`flag-marshal: ${parsed.error}`);
    return EXIT.USAGE;
  }

  const report = comparing(parsed) ? await analyzeChanges(parsed, ctx) : await analyze(parsed, ctx);
  if (typeof report === 'string') {
    ctx.err(`flag-marshal: ${report}`);
    return EXIT.USAGE;
  }

  // `scan` reports; it never enforces. Exit stays 0 no matter what it finds, so
  // it is safe to run anywhere without failing a pipeline. `check` is the one
  // that fails builds.
  ctx.out(format(report, parsed.format));
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
function format(report: ScanReport, as: Format): string {
  const changes = report.changes;
  switch (as) {
    case 'json':
      return JSON.stringify(report, null, 2);
    case 'sarif':
      return renderSarif(
        changes === undefined ? report : { ...report, findings: changes.introducedFindings },
      );
    case 'markdown':
      return changes === undefined ? renderMarkdown(report) : renderChangesMarkdown(changes);
    case 'human':
      return changes === undefined ? renderScan(report) : renderChanges(changes);
  }
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
  if (comparing(parsed)) {
    if (parsed.updateBaseline) {
      ctx.err('flag-marshal: --update-baseline and --changed-since cannot be combined');
      return EXIT.USAGE;
    }
    return checkSince(parsed, ctx);
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
    ctx.out(format({ ...report, findings: result.introduced }, parsed.format));
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
    ctx.out(format({ ...whole, findings: introduced }, parsed.format));
  }

  return introduced.length > 0 ? EXIT.POLICY : EXIT.OK;
}

/**
 * Runs the analysis server on stdin and stdout.
 *
 * Kept deliberately thin: framing and dispatch live in `frontends/rpc`, so this
 * only wires the streams. `--stdio` is required rather than assumed, because a
 * future transport (a socket, a named pipe) should be a new flag rather than a
 * behaviour change for anyone already scripting against this one.
 */
async function serve(args: readonly string[], ctx: CliContext): Promise<number> {
  if (!args.includes('--stdio')) {
    ctx.err('flag-marshal: serve requires --stdio');
    return EXIT.USAGE;
  }
  const unknown = args.find((a) => a !== '--stdio');
  if (unknown !== undefined) {
    ctx.err(`flag-marshal: unknown option '${unknown}'`);
    return EXIT.USAGE;
  }
  if (ctx.serve === undefined) {
    ctx.err('flag-marshal: this frontend cannot serve');
    return EXIT.USAGE;
  }

  await ctx.serve();
  return EXIT.OK;
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
