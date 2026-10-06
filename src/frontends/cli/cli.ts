import { resolve } from 'node:path';
import {
  applyRatchet,
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
import { renderCheck } from './render.js';
import { renderScan } from './render.js';
import { renderMarkdown } from './render-markdown.js';
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
  /** Unix seconds treated as "now". Defaults to the wall clock. */
  readonly now?: number;
  /** Resolves a user-supplied path to an absolute one. */
  readonly cwd: string;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
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
  readonly error?: string;
}

function parseArgs(
  command: string,
  args: readonly string[],
  ctx: CliContext,
  allowed: string[],
): Parsed {
  const positional = args.filter((a) => !a.startsWith('-'));
  const base: Parsed = { format: 'human', useGit: true, updateBaseline: false, root: '' };

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

async function scan(args: readonly string[], ctx: CliContext): Promise<number> {
  const parsed = parseArgs('scan', args, ctx, ['--json', '--no-git']);
  if (parsed.error !== undefined) {
    ctx.err(`flag-marshal: ${parsed.error}`);
    return EXIT.USAGE;
  }

  const report = await analyze(parsed, ctx);

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

function format(report: ScanReport, as: Format): string {
  switch (as) {
    case 'json':
      return JSON.stringify(report, null, 2);
    case 'sarif':
      return renderSarif(report);
    case 'markdown':
      return renderMarkdown(report);
    case 'human':
      return renderScan(report);
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
  const parsed = parseArgs('check', args, ctx, ['--json', '--no-git', '--update-baseline']);
  if (parsed.error !== undefined) {
    ctx.err(`flag-marshal: ${parsed.error}`);
    return EXIT.USAGE;
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
