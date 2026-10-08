import type { FileSystem } from '../api/filesystem.js';
import type { Provider, ScanReport } from '../api/generated/scan-report.js';
import { scanSources, unsupportedIn, type SourceFile } from '../detect/scan-source.js';
import {
  findTogglzEnums,
  indexTogglzEnums,
  type TogglzEnum,
  type TogglzEnums,
} from '../detect/togglz-enums.js';
import { isTestPath } from '../detect/test-paths.js';
import { configKindFor, parseConfig, type ConfigEntry } from '../config/parse-config.js';
import { readSettings, SETTINGS_FILE, type FlagMetadata } from '../config/settings.js';
import { readInlineMetadata } from '../detect/metadata.js';
import { evaluatePolicy } from '../policy/evaluate.js';
import { customAdapter } from '../detect/providers/index.js';
import { wrappedProvider } from '../detect/wrapper.js';
import { buildIndex } from '../refindex/build-index.js';
import { applyRules } from '../rules/apply-rules.js';
import { walk } from './walk.js';
import { grammarFor } from '../detect/languages.js';
import { mightContainFlags } from '../detect/provider-identity.js';
import { unparsedLanguageOf } from '../detect/unparsed.js';
import { collectEvidence } from '../evidence/collect.js';
import { scoreFlag } from '../score/score.js';
import { noGitHistory, type GitHistory } from '../api/git.js';
import type { ScanOptions } from '../detect/scan-source.js';
import { previewResolution, type FlagValue, type RefactorPreview } from '../refactor/preview.js';

export interface OpenWorkspaceOptions {
  /** Absolute path of the workspace root. */
  readonly root: string;
  /** How the frontend supplies files. The core performs no workspace I/O itself. */
  readonly fs: FileSystem;
  /**
   * How the frontend supplies commit history. Omitted, the scan runs without git
   * evidence and says so through lowered confidence rather than by guessing.
   */
  readonly git?: GitHistory;
  /** Unix seconds treated as "now". Defaults to the wall clock. */
  readonly now?: number;
}

/**
 * A workspace opened for analysis.
 *
 * This is the whole public capability surface. The CLI, the RPC server, and the
 * editor frontends all drive analysis through it, which is what keeps four
 * frontends from growing four subtly different engines.
 */
export interface AnalysisSession {
  /** Absolute path to the workspace root under analysis. */
  readonly root: string;
  /** Inventories every flag in the workspace. */
  scan(): Promise<ScanReport>;
  /**
   * A dry run of resolving one flag to a fixed value: the files as they would
   * be, or why that cannot be shown exactly. Writes nothing.
   */
  previewResolution(key: string, value: FlagValue): Promise<RefactorPreview>;
}

/** A scan, plus what it took to produce it, for capabilities built on a scan. */
interface Analysis {
  readonly report: ScanReport;
  readonly unparsedLanguages: readonly string[];
  readonly scanOptions: ScanOptions;
}

/**
 * Core version, surfaced in every report so a consumer can attribute output.
 *
 * Kept in step with `package.json` by `test/contract/version.test.ts`. A report
 * claiming a version the package does not have makes every archived report
 * untraceable.
 */
export const CORE_VERSION = '0.2.0';

/** Contract version this build emits. Consumers reject majors they do not know. */
export const SCHEMA_VERSION = '1.0';

export function openWorkspace(options: OpenWorkspaceOptions): AnalysisSession {
  const { root, fs } = options;
  const git = options.git ?? noGitHistory;

  const session: AnalysisSession = {
    root,

    async scan(): Promise<ScanReport> {
      return (await analyze()).report;
    },

    async previewResolution(key: string, value: FlagValue): Promise<RefactorPreview> {
      const { report, unparsedLanguages, scanOptions } = await analyze();
      return previewResolution({
        report,
        unparsedLanguages,
        key,
        value,
        scanOptions,
        readFile: (path) => fs.readFile(`${root}/${path}`),
      });
    },
  };
  return session;

  async function analyze(): Promise<Analysis> {
    const { settings } = await readSettings(fs, root);
    const custom = customAdapter(settings.customMethods);

    const candidates: ConfigEntry[] = [];
    const unparsed = new Set<string>();
    const inline: Record<string, FlagMetadata> = {};
    const unsupported = new Map<string, { evidence: string; files: Set<string> }>();
    const customMethods = custom === undefined ? [] : settings.customMethods;

    const walked = await readWorkspace(fs, root, {
      candidates,
      unparsed,
      inline,
      unsupported,
      customMethods,
    });

    // Togglz is declared once and read everywhere, and the reading files import
    // the application's enum rather than org.togglz. Discovering the enums
    // before scanning is what makes those usages recognizable at all.
    const togglzEnums = await discoverTogglzEnums(walked.interesting);

    // Only a workspace that actually declares a Togglz enum pays a second read.
    // Those usage files match no static marker — `Features.CHECKOUT` names the
    // application's own type — so the only way to find them is to look again,
    // now knowing what to look for.
    const files = [...walked.interesting];
    if (togglzEnums.size > 0) {
      const extra = [...togglzEnums.bySimpleName.keys()];
      for (const path of walked.deferred) {
        let text: string;
        try {
          text = await fs.readFile(`${root}/${path}`);
        } catch {
          continue;
        }
        if (mightContainFlags(text, extra)) files.push({ path, text });
      }
    }

    const passThroughs = new Map<string, Set<Provider>>();
    const scanOptions: ScanOptions = {
      togglzEnums,
      // The adapter carries the methods into its query; the prefilter needs
      // them separately or it skips the file before the adapter can run.
      ...(custom === undefined ? {} : { adapters: [custom], customMethods }),
    };
    const scanned = await scanSources(iterate(files), { ...scanOptions, passThroughs });
    // A declared helper proven to forward straight into one SDK makes its
    // callers that SDK's calls. See wrapper.ts for when this is withheld.
    const wrapped = wrappedProvider(customMethods, passThroughs);
    const code =
      wrapped === undefined
        ? scanned
        : scanned.map((ref) => (ref.provider === 'custom' ? { ...ref, provider: wrapped } : ref));
    // A configuration entry under a recognized flag namespace stands on its
    // own. One under any other namespace — `acmeco.allow-override-user-expiration`
    // — counts only when code actually reads it. Without this, real Spring
    // flags are reported as unconfigured; with the namespace rule dropped
    // entirely, every boolean setting becomes a feature flag.
    const codeKeys = new Set(
      code.filter((ref) => ref.key !== null).map((ref) => ref.key as string),
    );
    const configuration = candidates
      .filter((entry) => entry.inFlagNamespace || codeKeys.has(entry.reference.key ?? ''))
      .map((entry) => entry.reference);

    const index = buildIndex([...code, ...configuration]);

    const unparsedLanguages = [...unparsed].sort();
    const anyUnresolvedKeys = index.unresolvedReferences.length > 0;
    const gitUnavailable = !(await git.isAvailable());
    const now = options.now ?? Math.floor(Date.now() / 1000);

    // Evidence and scoring are per flag, so a record arrives at the rules
    // already carrying what is known about it.
    // Evidence for one flag costs a `git log` pickaxe, and they are independent
    // of each other. Awaiting them one at a time made git the dominant cost of
    // scanning a repository with many flags — ten seconds of a fourteen-second
    // Spring Boot scan, spent waiting rather than working. Order is preserved
    // because the results come back as an ordered array.
    const scored = await inBatches(index.flags, EVIDENCE_CONCURRENCY, async (flag) => {
      const evidence = await collectEvidence(flag, { git, now });
      const { debtScore, confidence } = scoreFlag({
        evidence,
        unparsedLanguages,
        anyUnresolvedKeys,
        gitUnavailable,
      });
      return { ...flag, evidence, debtScore, confidence };
    });
    const flags = scored;

    const drift = applyRules({
      flags,
      unresolvedReferences: index.unresolvedReferences,
      unparsedLanguages,
    });

    // The manifest wins over an inline directive: a central declaration is the
    // one a reviewer is most likely to be looking at.
    const metadata: Record<string, FlagMetadata> = { ...inline, ...settings.flags };
    const policy = evaluatePolicy({ flags, policy: settings.policy, metadata, now });

    const findings = [...drift, ...policy];

    const report: ScanReport = {
      schemaVersion: SCHEMA_VERSION,
      tool: { name: 'flag-marshal', coreVersion: CORE_VERSION },
      root,
      positionEncoding: 'utf-16',
      flags,
      unresolvedReferences: index.unresolvedReferences,
      unsupportedProviders: [...unsupported.entries()]
        .map(([name, seen]) => ({
          name,
          evidence: seen.evidence,
          files: [...seen.files].sort(),
        }))
        .sort((a, b) => (a.name < b.name ? -1 : 1)),
      findings,
    };
    return { report, unparsedLanguages, scanOptions };
  }
}

/**
 * First pass: find every Togglz feature enum in the workspace.
 *
 * Only JVM sources are read, and only by regular expression — no parsing — so the
 * extra traversal is cheap next to the scan that follows. Test sources are
 * skipped: an enum defined for a test is scaffolding, not a flag this repository
 * ships.
 */
async function discoverTogglzEnums(files: readonly SourceFile[]): Promise<TogglzEnums> {
  const found: TogglzEnum[] = [];

  for (const file of files) {
    if (!/\.(java|kt|kts)$/i.test(file.path)) continue;
    // A Togglz feature enum implements org.togglz's Feature interface, so a file
    // that never mentions togglz cannot declare one. This skips the parse, which
    // is the whole cost.
    if (!file.text.includes('togglz') && !file.text.includes('Togglz')) continue;

    found.push(...(await findTogglzEnums(file.path, file.text, isTestPath(file.path))));
  }
  return indexTogglzEnums(found);
}

async function* iterate(files: readonly SourceFile[]): AsyncGenerator<SourceFile> {
  for (const file of files) yield file;
}

/**
 * Reads the workspace once, sorting what it finds.
 *
 * One walk and **one read per file** serves every input: configuration is parsed
 * inline, unsupported platforms and inline metadata are recorded, and source
 * files are split into those that could contain a flag and those that could not.
 *
 * The split is what makes a large repository scannable. Building a syntax tree is
 * effectively the entire cost of a scan, and in a real application almost no file
 * mentions a flag mechanism at all. `deferred` keeps only the paths of the rest,
 * so a Togglz workspace can come back for them knowing the enum names to look for
 * — and a workspace without Togglz, which is most of them, never reads them twice.
 *
 * A file that cannot be read is skipped rather than failing the scan. Real
 * repositories contain broken symlinks, permission-denied paths, and files that
 * vanish mid-walk; none of those should cost a user their whole inventory.
 */
interface WalkResult {
  /** Source files that passed the prefilter, with their text. */
  readonly interesting: SourceFile[];
  /** Paths of source files that did not. Text is deliberately not retained. */
  readonly deferred: string[];
}

async function readWorkspace(
  fs: FileSystem,
  root: string,
  sink: {
    candidates: ConfigEntry[];
    unparsed: Set<string>;
    inline: Record<string, FlagMetadata>;
    unsupported: Map<string, { evidence: string; files: Set<string> }>;
    customMethods: readonly string[];
  },
): Promise<WalkResult> {
  const interesting: SourceFile[] = [];
  const deferred: string[] = [];

  for await (const batch of batches(walk({ fs, root }), READ_CONCURRENCY)) {
    // Reads are issued together and consumed in walk order. Awaiting one file at
    // a time left the process idle for nearly half of a large scan, waiting on a
    // filesystem that is perfectly happy to answer several questions at once.
    // Order is preserved because the results are processed as an ordered array,
    // not as they arrive — a report whose contents depend on disk scheduling
    // would be a report that cannot be diffed between runs.
    const read = await Promise.all(
      batch.map(async (path) => {
        try {
          return { path, text: await fs.readFile(`${root}/${path}`) };
        } catch {
          return undefined;
        }
      }),
    );

    for (const entry of read) {
      if (entry === undefined) continue;
      const { path, text } = entry;

      const unreadable = unparsedLanguageOf(path);
      if (unreadable !== undefined) sink.unparsed.add(unreadable);

      // The settings file is read separately and is not itself flag configuration.
      if (path === SETTINGS_FILE) continue;

      const configKind = configKindFor(path);
      if (configKind !== undefined) {
        sink.candidates.push(...parseConfig(path, text, configKind));
        continue;
      }

      // A flag platform this build cannot analyze is recorded, not ignored. A
      // small inventory presented as complete is its own kind of false claim.
      for (const sighting of unsupportedIn({ path, text })) {
        const seen = sink.unsupported.get(sighting.name) ?? {
          evidence: sighting.evidence,
          files: new Set<string>(),
        };
        seen.files.add(path);
        sink.unsupported.set(sighting.name, seen);
      }

      // Directives live in comments, so any file can carry them.
      for (const [key, declared] of Object.entries(readInlineMetadata(path, text).metadata)) {
        sink.inline[key] = { ...sink.inline[key], ...declared };
      }

      if (grammarFor(path) === undefined) continue;

      if (mightContainFlags(text, sink.customMethods)) interesting.push({ path, text });
      else deferred.push(path);
    }
  }

  return { interesting, deferred };
}

/**
 * How many files to read at once.
 *
 * High enough to keep the filesystem busy, low enough not to exhaust file
 * descriptors on a repository with tens of thousands of files.
 */
const READ_CONCURRENCY = 32;

/**
 * How many `git log` invocations to have in flight at once.
 *
 * Each spawns a process, so this is bounded well below the read concurrency: the
 * limit here is the machine's patience for subprocesses, not its filesystem.
 */
const EVIDENCE_CONCURRENCY = 8;

/** Maps over a list with bounded concurrency, returning results in input order. */
async function inBatches<T, R>(
  items: readonly T[],
  size: number,
  map: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(map))));
  }
  return results;
}

/** Groups an async stream into fixed-size arrays, preserving order. */
async function* batches<T>(source: AsyncIterable<T>, size: number): AsyncGenerator<T[]> {
  let batch: T[] = [];
  for await (const item of source) {
    batch.push(item);
    if (batch.length >= size) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length > 0) yield batch;
}
