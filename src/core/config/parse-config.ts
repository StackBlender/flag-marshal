import { parseDocument, isMap, isScalar, isPair, type Node as YamlNode } from 'yaml';
import type { FlagReference } from '../api/generated/scan-report.js';
import { isBooleanLike, isFlagEnvName, isFlagNamespace } from './flag-keys.js';

/** Configuration filenames this milestone understands. */
const PROPERTIES = /(^|\/)application[^/]*\.properties$/i;
const YAML_CONFIG = /(^|\/)application[^/]*\.(ya?ml)$/i;
const DOTENV = /(^|\/)\.env(\.[\w-]+)?$/i;

export type ConfigKind = 'properties' | 'yaml' | 'env';

/** The configuration kind claiming `path`, or undefined. */
export function configKindFor(path: string): ConfigKind | undefined {
  if (PROPERTIES.test(path)) return 'properties';
  if (YAML_CONFIG.test(path)) return 'yaml';
  if (DOTENV.test(path)) return 'env';
  return undefined;
}

/**
 * One configuration entry that might be a feature flag.
 *
 * Whether it *is* one depends on evidence the parser cannot see. An entry under
 * a recognized flag namespace stands on its own. An entry under any other
 * namespace — `acmeco.allow-override-user-expiration`,
 * `scheduledJobs.aiAppointment.enabled` — is only a flag if code actually reads
 * it, which the caller resolves after scanning source.
 *
 * Emitting every boolean property unconditionally would fill an inventory with
 * ordinary settings; ignoring them entirely misses real Spring flags. Carrying
 * both and letting source evidence decide is the model that gets both right.
 */
export interface ConfigEntry {
  readonly reference: FlagReference;
  /** True when the key sits under a recognized flag namespace. */
  readonly inFlagNamespace: boolean;
}

/**
 * Extracts candidate flag entries from a configuration file.
 *
 * Ranges cover the key, not the whole line, so an editor frontend can underline
 * the thing a user would click. Positions are UTF-16 code units, matching every
 * other range in the report.
 */
export function parseConfig(path: string, text: string, kind: ConfigKind): ConfigEntry[] {
  switch (kind) {
    case 'properties':
      return parseProperties(path, text);
    case 'env':
      return parseEnv(path, text);
    case 'yaml':
      return parseYaml(path, text);
  }
}

/**
 * `span` is the text actually present at that position, which for nested YAML is
 * the leaf name rather than the dotted key. Using the dotted length would
 * overshoot the line and underline text that is not there.
 */
/**
 * Togglz writes its configuration as `togglz.features.<KEY>.enabled`, but the
 * flag key is the constant itself. Without this, the config entry and the enum
 * constant look like two different flags.
 */
const TOGGLZ_PROPERTY = /^togglz\.features\.([^.]+)\.enabled$/;

export function normalizeConfigKey(key: string): string {
  return TOGGLZ_PROPERTY.exec(key)?.[1] ?? key;
}

/** True for `togglz.features.<KEY>.enabled`, which is a flag by construction. */
export function isTogglzProperty(key: string): boolean {
  return TOGGLZ_PROPERTY.test(key);
}

function reference(
  path: string,
  key: string,
  line: number,
  column: number,
  span: string = key,
): FlagReference {
  return {
    key: normalizeConfigKey(key),
    range: {
      file: path,
      start: { line, character: column },
      end: { line, character: column + span.length },
    },
    provider: 'properties',
    language: 'properties',
    kind: 'configuration',
    resolution: 'resolved',
  };
}

/** `key=value` and `key:value`, with `#` and `!` comments, per the Java format. */
function parseProperties(path: string, text: string): ConfigEntry[] {
  const found: ConfigEntry[] = [];

  text.split('\n').forEach((raw, line) => {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('!')) return;

    const separator = firstIndexOf(raw, ['=', ':']);
    if (separator === -1) return;

    const key = raw.slice(0, separator).trim();
    const value = raw.slice(separator + 1);
    if (key === '' || !isBooleanLike(value)) return;

    found.push({
      reference: reference(path, key, line, raw.indexOf(key)),
      inFlagNamespace: isFlagNamespace(key) || isTogglzProperty(key),
    });
  });

  return found;
}

/** `NAME=value`, ignoring `export` prefixes and quoted values. */
function parseEnv(path: string, text: string): ConfigEntry[] {
  const found: ConfigEntry[] = [];

  text.split('\n').forEach((raw, line) => {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;

    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice('export '.length) : trimmed;
    const equals = withoutExport.indexOf('=');
    if (equals === -1) return;

    const name = withoutExport.slice(0, equals).trim();
    const value = unquote(withoutExport.slice(equals + 1).trim());
    if (name === '' || !isBooleanLike(value)) return;

    const reference_ = reference(path, name, line, raw.indexOf(name));
    found.push({
      reference: { ...reference_, provider: 'environment', language: 'shell' },
      inFlagNamespace: isFlagEnvName(name),
    });
  });

  return found;
}

/**
 * Nested YAML keys, flattened to the dotted form Spring uses, so
 * `features: {nightly-reports: true}` and `features.nightly-reports=true` become
 * the same flag key rather than two.
 */
function parseYaml(path: string, text: string): ConfigEntry[] {
  const found: ConfigEntry[] = [];

  let document;
  try {
    document = parseDocument(text, { keepSourceTokens: false });
  } catch {
    // Malformed configuration is not a reason to fail the scan.
    return found;
  }
  if (document.errors.length > 0 || document.contents === null) return found;

  const lineStarts = computeLineStarts(text);

  interface Ancestor {
    readonly name: string;
    readonly line: number;
    readonly character: number;
  }

  const visit = (
    node: unknown,
    prefix: readonly string[],
    ancestors: readonly Ancestor[],
  ): void => {
    if (!isMap(node)) return;

    for (const item of node.items) {
      if (!isPair(item) || !isScalar(item.key)) continue;
      const name = String(item.key.value);
      const path_ = [...prefix, name];

      const keyRange = (item.key as YamlNode).range;
      const here =
        keyRange === undefined || keyRange === null
          ? undefined
          : { name, ...positionAt(lineStarts, keyRange[0]) };

      if (isMap(item.value)) {
        visit(item.value, path_, here === undefined ? ancestors : [...ancestors, here]);
        continue;
      }

      if (!isScalar(item.value)) continue;
      const dotted = path_.join('.');
      if (!isBooleanLike(String(item.value.value))) continue;

      if (here === undefined) continue;

      // For `togglz.features.<KEY>.enabled` the flag is <KEY>, so the range must
      // point there rather than at the `enabled` leaf an editor would otherwise
      // underline.
      const anchor = isTogglzProperty(dotted) ? (ancestors[ancestors.length - 1] ?? here) : here;
      const { line, character } = anchor;
      found.push({
        // The range covers the key as written, not the flattened path.
        reference: reference(path, dotted, line, character, anchor.name),
        // A `togglz.features.*` entry names a Togglz flag by construction, so it
        // stands on its own without needing a matching source reference.
        inFlagNamespace: isFlagNamespace(dotted) || isTogglzProperty(dotted),
      });
    }
  };

  visit(document.contents, [], []);
  return found;
}

function firstIndexOf(text: string, needles: readonly string[]): number {
  let best = -1;
  for (const needle of needles) {
    const at = text.indexOf(needle);
    if (at !== -1 && (best === -1 || at < best)) best = at;
  }
  return best;
}

function unquote(value: string): string {
  const first = value[0];
  if ((first === '"' || first === "'") && value.endsWith(first) && value.length > 1) {
    return value.slice(1, -1);
  }
  return value;
}

function computeLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function positionAt(
  lineStarts: readonly number[],
  offset: number,
): {
  line: number;
  character: number;
} {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if ((lineStarts[mid] ?? 0) <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low, character: offset - (lineStarts[low] ?? 0) };
}
