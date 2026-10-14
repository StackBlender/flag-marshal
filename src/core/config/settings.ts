import { parse } from 'yaml';
import type { FileSystem } from '../api/filesystem.js';

/** Repository-root configuration file. Policy settings join it in Milestone 7. */
export const SETTINGS_FILE = '.flagmarshal.yml';

/** Declared metadata for one flag, from the manifest or an inline directive. */
export interface FlagMetadata {
  readonly owner?: string;
  /** ISO date (YYYY-MM-DD) by which the flag is expected to be gone. */
  readonly expiry?: string;
}

export interface Policy {
  readonly requireOwner: boolean;
  readonly requireExpiry: boolean;
  /** Flags older than this raise a violation. Zero disables the check. */
  readonly maxAgeDays: number;
  /** Maximum flags this repository may carry. Zero disables the check. */
  readonly budget: number;
  /**
   * Flags exempt from policy. Kill switches and licensing gates legitimately
   * live forever, and a tool that cannot express that gets switched off.
   */
  readonly allowlist: readonly string[];
}

export const DEFAULT_POLICY: Policy = {
  requireOwner: false,
  requireExpiry: false,
  maxAgeDays: 0,
  budget: 0,
  allowlist: [],
};

/** A local Unleash export to reconcile against. Read from disk, never fetched. */
export interface UnleashExportSettings {
  /** Path of the export, relative to the workspace root and inside it. */
  readonly file: string;
  /** The environment to compare against. Omitted, no environment is assumed. */
  readonly environment?: string;
  /**
   * True only when the user states the export holds every flag the provider
   * serves to this code. The default is partial: an export is usually a project
   * or a selection, and a flag missing from it then proves nothing.
   */
  readonly complete: boolean;
}

export interface ProviderStateSettings {
  readonly unleash?: UnleashExportSettings;
}

export interface Settings {
  /**
   * Methods belonging to a team's own flag helper, so a homegrown
   * `Features.isEnabled("x")` is found without a change to this codebase.
   */
  readonly customMethods: readonly string[];
  readonly policy: Policy;
  /** Flag metadata declared centrally, keyed by flag key. */
  readonly flags: Readonly<Record<string, FlagMetadata>>;
  /** Offline provider snapshots, when the repository points at any. */
  readonly providerState: ProviderStateSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  customMethods: [],
  policy: DEFAULT_POLICY,
  flags: {},
  providerState: {},
};

/**
 * One thing wrong with the settings file. Never carries a flag key's value
 * beyond the path the user wrote, and never file contents.
 */
export interface SettingsDiagnostic {
  /** Settings file the problem is in. */
  readonly file: string;
  /** Dotted path of the offending setting, or empty for the whole file. */
  readonly path: string;
  /** What is wrong, without the file name prefix. */
  readonly message: string;
}

/**
 * Reads `.flagmarshal.yml` from the workspace root.
 *
 * A missing file is the normal case and yields defaults. A malformed one yields
 * defaults for what could not be read rather than failing the read — but unlike
 * a missing file it is worth surfacing. `diagnostics` is the structured list and
 * `problems` the same list as printable lines. A caller that enforces policy must
 * refuse to proceed when either is non-empty: the settings it got are not the
 * settings the user wrote.
 */
export async function readSettings(
  fs: FileSystem,
  root: string,
): Promise<{ settings: Settings; problems: string[]; diagnostics: SettingsDiagnostic[] }> {
  const diagnostics: SettingsDiagnostic[] = [];
  const result = (settings: Settings) => ({
    settings,
    diagnostics,
    problems: diagnostics.map(describe),
  });

  let text: string;
  try {
    text = await fs.readFile(`${root}/${SETTINGS_FILE}`);
  } catch {
    return result(DEFAULT_SETTINGS);
  }

  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch {
    report(diagnostics, '', 'is not valid YAML');
    return result(DEFAULT_SETTINGS);
  }

  // An empty file parses to null and is simply no configuration.
  if (parsed === null || parsed === undefined) return result(DEFAULT_SETTINGS);
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    report(diagnostics, '', 'must be a mapping at the top level');
    return result(DEFAULT_SETTINGS);
  }

  const object = parsed as Record<string, unknown>;
  return result({
    customMethods: readMethods(object['customPatterns'], diagnostics),
    policy: readPolicy(object['policy'], diagnostics),
    flags: readFlags(object['flags'], diagnostics),
    providerState: readProviderState(object['providerState'], diagnostics),
  });
}

function report(diagnostics: SettingsDiagnostic[], path: string, message: string): void {
  diagnostics.push({ file: SETTINGS_FILE, path, message });
}

const isMapping = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The printable form of a diagnostic. */
export function describe(diagnostic: SettingsDiagnostic): string {
  return diagnostic.path === ''
    ? `${diagnostic.file} ${diagnostic.message}`
    : `${diagnostic.file}: ${diagnostic.path} ${diagnostic.message}`;
}

// Derived from the defaults so a new policy field cannot be rejected as unknown.
const POLICY_KEYS: readonly string[] = Object.keys(DEFAULT_POLICY);

function readPolicy(raw: unknown, problems: SettingsDiagnostic[]): Policy {
  if (raw === undefined || raw === null) return DEFAULT_POLICY;
  if (!isMapping(raw)) {
    report(problems, 'policy', 'must be a mapping');
    return DEFAULT_POLICY;
  }
  const o = raw;
  for (const name of Object.keys(o)) {
    if (!POLICY_KEYS.includes(name))
      report(problems, `policy.${name}`, 'is not a known policy setting');
  }

  return {
    requireOwner: readBoolean(o['requireOwner'], 'policy.requireOwner', problems),
    requireExpiry: readBoolean(o['requireExpiry'], 'policy.requireExpiry', problems),
    maxAgeDays: readCount(o['maxAgeDays'], 'policy.maxAgeDays', problems),
    budget: readCount(o['budget'], 'policy.budget', problems),
    allowlist: readStringList(o['allowlist'], 'policy.allowlist', problems),
  };
}

function readProviderState(raw: unknown, problems: SettingsDiagnostic[]): ProviderStateSettings {
  if (raw === undefined || raw === null) return {};
  if (!isMapping(raw)) {
    report(problems, 'providerState', 'must be a mapping');
    return {};
  }
  const unleash = raw['unleash'];
  if (unleash === undefined || unleash === null) return {};
  if (!isMapping(unleash)) {
    report(problems, 'providerState.unleash', 'must be a mapping');
    return {};
  }
  const o = unleash;

  const file = typeof o['export'] === 'string' ? o['export'].trim() : '';
  // The export is a file in the repository. An absolute or parent-relative path
  // would let a checked-in settings file make the tool read elsewhere.
  if (
    file === '' ||
    file.startsWith('/') ||
    /^[A-Za-z]:/.test(file) ||
    /(^|[\\/])\.\.([\\/]|$)/.test(file)
  ) {
    report(problems, 'providerState.unleash.export', 'must be a path inside the repository');
    return {};
  }
  const environment = typeof o['environment'] === 'string' ? o['environment'].trim() : '';
  if (o['environment'] !== undefined && environment === '') {
    report(problems, 'providerState.unleash.environment', 'must be a name');
  }
  return {
    unleash: {
      file,
      ...(environment === '' ? {} : { environment }),
      complete: readBoolean(o['complete'], 'providerState.unleash.complete', problems),
    },
  };
}

function readFlags(raw: unknown, problems: SettingsDiagnostic[]): Record<string, FlagMetadata> {
  if (raw === undefined || raw === null) return {};
  if (!isMapping(raw)) {
    report(problems, 'flags', 'must be a mapping of flag key to metadata');
    return {};
  }

  const out: Record<string, FlagMetadata> = {};
  let position = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    position += 1;
    // Flag keys are confidential, so diagnostics name the entry by position.
    const where = `flags[entry ${position}]`;
    if (!isMapping(value)) {
      report(problems, where, 'must be a mapping');
      continue;
    }
    const o = value;
    const owner = typeof o['owner'] === 'string' ? o['owner'].trim() : undefined;
    // An unquoted YAML date parses as a string here (core schema), so anything
    // else present is a mistake worth naming rather than silently ignoring.
    if (o['owner'] !== undefined && o['owner'] !== null && owner === undefined) {
      report(problems, `${where}.owner`, 'must be text');
    }
    const expiry = typeof o['expiry'] === 'string' ? o['expiry'].trim() : undefined;
    if (o['expiry'] !== undefined && o['expiry'] !== null && expiry === undefined) {
      report(problems, `${where}.expiry`, 'must be YYYY-MM-DD');
    }
    if (expiry !== undefined && !isIsoDate(expiry)) {
      report(problems, `${where}.expiry`, 'must be YYYY-MM-DD');
      out[key] = owner === undefined ? {} : { owner };
      continue;
    }
    out[key] = {
      ...(owner === undefined ? {} : { owner }),
      ...(expiry === undefined ? {} : { expiry }),
    };
  }
  return out;
}

/** Strict YYYY-MM-DD, and a date that actually exists. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function readBoolean(value: unknown, name: string, problems: SettingsDiagnostic[]): boolean {
  if (value === undefined) return false;
  if (typeof value === 'boolean') return value;
  report(problems, name, 'must be true or false');
  return false;
}

function readCount(value: unknown, name: string, problems: SettingsDiagnostic[]): number {
  if (value === undefined) return 0;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  report(problems, name, 'must be a non-negative whole number');
  return 0;
}

function readStringList(value: unknown, name: string, problems: SettingsDiagnostic[]): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    report(problems, name, 'must be a list');
    return [];
  }
  const strings = value.filter((v): v is string => typeof v === 'string');
  if (strings.length !== value.length) report(problems, name, 'must contain only text entries');
  return [...new Set(strings)].sort();
}

function readMethods(raw: unknown, problems: SettingsDiagnostic[]): string[] {
  if (raw === undefined || raw === null) return [];
  if (!isMapping(raw)) {
    report(problems, 'customPatterns', 'must be a mapping');
    return [];
  }

  const value = raw['methods'];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    report(problems, 'customPatterns.methods', 'must be a list');
    return [];
  }

  const methods: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim() !== '') methods.push(entry.trim());
    else report(problems, 'customPatterns.methods', 'must contain only non-empty text entries');
  }
  // Deduplicated and sorted so output stays deterministic regardless of file order.
  return [...new Set(methods)].sort();
}
