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

export interface Settings {
  /**
   * Methods belonging to a team's own flag helper, so a homegrown
   * `Features.isEnabled("x")` is found without a change to this codebase.
   */
  readonly customMethods: readonly string[];
  readonly policy: Policy;
  /** Flag metadata declared centrally, keyed by flag key. */
  readonly flags: Readonly<Record<string, FlagMetadata>>;
}

export const DEFAULT_SETTINGS: Settings = {
  customMethods: [],
  policy: DEFAULT_POLICY,
  flags: {},
};

/**
 * Reads `.flagmarshal.yml` from the workspace root.
 *
 * A missing file is the normal case and yields defaults. A malformed one yields
 * defaults too rather than failing the scan — but unlike a missing file it is
 * worth surfacing, which `problems` reports.
 */
export async function readSettings(
  fs: FileSystem,
  root: string,
): Promise<{ settings: Settings; problems: string[] }> {
  let text: string;
  try {
    text = await fs.readFile(`${root}/${SETTINGS_FILE}`);
  } catch {
    return { settings: DEFAULT_SETTINGS, problems: [] };
  }

  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch {
    return { settings: DEFAULT_SETTINGS, problems: [`${SETTINGS_FILE} is not valid YAML`] };
  }

  if (parsed === null || typeof parsed !== 'object') {
    return { settings: DEFAULT_SETTINGS, problems: [] };
  }

  const problems: string[] = [];
  const object = parsed as Record<string, unknown>;

  return {
    settings: {
      customMethods: readMethods(object['customPatterns'], problems),
      policy: readPolicy(object['policy'], problems),
      flags: readFlags(object['flags'], problems),
    },
    problems,
  };
}

function readPolicy(raw: unknown, problems: string[]): Policy {
  if (raw === undefined || raw === null) return DEFAULT_POLICY;
  if (typeof raw !== 'object') {
    problems.push(`${SETTINGS_FILE}: policy must be a mapping`);
    return DEFAULT_POLICY;
  }
  const o = raw as Record<string, unknown>;

  return {
    requireOwner: readBoolean(o['requireOwner'], 'policy.requireOwner', problems),
    requireExpiry: readBoolean(o['requireExpiry'], 'policy.requireExpiry', problems),
    maxAgeDays: readCount(o['maxAgeDays'], 'policy.maxAgeDays', problems),
    budget: readCount(o['budget'], 'policy.budget', problems),
    allowlist: readStringList(o['allowlist'], 'policy.allowlist', problems),
  };
}

function readFlags(raw: unknown, problems: string[]): Record<string, FlagMetadata> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object') {
    problems.push(`${SETTINGS_FILE}: flags must be a mapping of flag key to metadata`);
    return {};
  }

  const out: Record<string, FlagMetadata> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === null || typeof value !== 'object') {
      problems.push(`${SETTINGS_FILE}: flags.${key} must be a mapping`);
      continue;
    }
    const o = value as Record<string, unknown>;
    const owner = typeof o['owner'] === 'string' ? o['owner'].trim() : undefined;
    const expiry = typeof o['expiry'] === 'string' ? o['expiry'].trim() : undefined;
    if (expiry !== undefined && !isIsoDate(expiry)) {
      problems.push(`${SETTINGS_FILE}: flags.${key}.expiry must be YYYY-MM-DD`);
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

function readBoolean(value: unknown, name: string, problems: string[]): boolean {
  if (value === undefined) return false;
  if (typeof value === 'boolean') return value;
  problems.push(`${SETTINGS_FILE}: ${name} must be true or false`);
  return false;
}

function readCount(value: unknown, name: string, problems: string[]): number {
  if (value === undefined) return 0;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  problems.push(`${SETTINGS_FILE}: ${name} must be a non-negative whole number`);
  return 0;
}

function readStringList(value: unknown, name: string, problems: string[]): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    problems.push(`${SETTINGS_FILE}: ${name} must be a list`);
    return [];
  }
  return [...new Set(value.filter((v): v is string => typeof v === 'string'))].sort();
}

function readMethods(raw: unknown, problems: string[]): string[] {
  if (raw === undefined || raw === null) return [];
  if (typeof raw !== 'object') {
    problems.push(`${SETTINGS_FILE}: customPatterns must be a mapping`);
    return [];
  }

  const value = (raw as { methods?: unknown }).methods;
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    problems.push(`${SETTINGS_FILE}: customPatterns.methods must be a list`);
    return [];
  }

  const methods: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim() !== '') methods.push(entry.trim());
    else problems.push(`${SETTINGS_FILE}: ignoring non-string entry in customPatterns.methods`);
  }
  // Deduplicated and sorted so output stays deterministic regardless of file order.
  return [...new Set(methods)].sort();
}
