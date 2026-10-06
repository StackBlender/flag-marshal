import { Query } from 'web-tree-sitter';
import { grammarFor } from './languages.js';
import { createParser, loadLanguage } from './parser-pool.js';
import { importedModules } from './provider-identity.js';

/**
 * Workspace-level knowledge of Togglz feature enums.
 *
 * Togglz declares its flags once, in an enum implementing `Feature`, and reads
 * them everywhere else as `FeatureFlags.SOME_FLAG`. Those usage files import the
 * *application's* enum, not `org.togglz`, so gating on the Togglz package alone
 * misses nearly every real usage. Discovering the enums first makes those usages
 * recognizable.
 *
 * Discovery parses. An earlier version matched enum bodies with a regular
 * expression and got two things wrong that mattered: it split constants on every
 * comma, so `A("x", true), B("y", false)` yielded nothing and silently erased the
 * entire Togglz inventory; and it matched any interface whose *simple name* was
 * `Feature`, so an unrelated `ShippingOptions implements Feature` became a set of
 * feature flags. Source text is not a parser.
 */
export interface TogglzEnum {
  /** The enum type name, e.g. `FeatureFlags`. */
  readonly name: string;
  /** Package-qualified name, e.g. `com.example.config.FeatureFlags`. */
  readonly qualifiedName: string;
  readonly constants: ReadonlySet<string>;
}

/**
 * Every Togglz enum in the workspace, indexed two ways.
 *
 * Keying by simple name alone merges two `FeatureFlags` classes from different
 * modules, so a reference to one can match a constant belonging to the other —
 * producing a *wrong* inventory rather than an incomplete one, which is the more
 * damaging failure. Identity is the qualified name; the simple-name index exists
 * only to resolve a usage back to it.
 */
export interface TogglzEnums {
  /** Qualified enum name to its constants. */
  readonly byQualifiedName: ReadonlyMap<string, ReadonlySet<string>>;
  /** Simple name to every qualified name declaring it. */
  readonly bySimpleName: ReadonlyMap<string, readonly string[]>;
  readonly size: number;
}

export const NO_TOGGLZ_ENUMS: TogglzEnums = {
  byQualifiedName: new Map(),
  bySimpleName: new Map(),
  size: 0,
};

/** Builds the index from discovered enums. */
export function indexTogglzEnums(found: readonly TogglzEnum[]): TogglzEnums {
  const byQualifiedName = new Map<string, Set<string>>();
  const bySimpleName = new Map<string, string[]>();

  for (const item of found) {
    const constants = byQualifiedName.get(item.qualifiedName) ?? new Set<string>();
    for (const constant of item.constants) constants.add(constant);
    byQualifiedName.set(item.qualifiedName, constants);

    const qualified = bySimpleName.get(item.name) ?? [];
    if (!qualified.includes(item.qualifiedName)) qualified.push(item.qualifiedName);
    bySimpleName.set(item.name, qualified);
  }

  return { byQualifiedName, bySimpleName, size: byQualifiedName.size };
}

/** The `package` a file declares, or '' for the default package. */
export function packageOf(text: string): string {
  return /^\s*package\s+([\w.]+)/m.exec(text)?.[1] ?? '';
}

/**
 * Which declared enum a usage's `SimpleName.CONSTANT` refers to.
 *
 * Java and Kotlin resolve a simple type name through explicit imports, then the
 * file's own package, then wildcard imports. When that fails and exactly one enum
 * in the workspace carries the name, it is unambiguous anyway. When several do and
 * nothing disambiguates them, the answer is unknown — and an unknown flag is
 * dropped rather than guessed at.
 */
export function resolveTogglzEnum(
  enums: TogglzEnums,
  simpleName: string,
  filePackage: string,
  modules: readonly string[],
): ReadonlySet<string> | undefined {
  const candidates = enums.bySimpleName.get(simpleName);
  if (candidates === undefined || candidates.length === 0) return undefined;

  const explicit = modules.find(
    (module) => module === `${filePackage}.${simpleName}` || module.endsWith(`.${simpleName}`),
  );
  if (explicit !== undefined && candidates.includes(explicit)) {
    return enums.byQualifiedName.get(explicit);
  }

  const samePackage = filePackage === '' ? simpleName : `${filePackage}.${simpleName}`;
  if (candidates.includes(samePackage)) return enums.byQualifiedName.get(samePackage);

  for (const module of modules) {
    if (!module.endsWith('.*')) continue;
    const viaWildcard = `${module.slice(0, -2)}.${simpleName}`;
    if (candidates.includes(viaWildcard)) return enums.byQualifiedName.get(viaWildcard);
  }

  // Unambiguous by construction: only one enum in the workspace has this name.
  if (candidates.length === 1) return enums.byQualifiedName.get(candidates[0] ?? '');

  return undefined;
}

const TOGGLZ_FEATURE = 'org.togglz.core.Feature';
const TOGGLZ_PACKAGE = 'org.togglz.core';

const JAVA_QUERY = `
  (enum_declaration
    name: (identifier) @enum
    interfaces: (super_interfaces (type_list (_) @iface))
    body: (enum_body (enum_constant name: (identifier) @constant)))
`;

const KOTLIN_QUERY = `
  (class_declaration
    (identifier) @enum
    (delegation_specifiers (delegation_specifier (user_type) @iface))
    (enum_class_body (enum_entry (identifier) @constant)))
`;

/**
 * Whether `Feature` in this file can be trusted to mean Togglz's `Feature`.
 *
 * A bare `implements Feature` proves nothing on its own — the name is generic
 * enough that ordinary domain code uses it. Either the file imports Togglz's
 * type, or the annotation names it in full.
 */
function togglzFeatureInScope(text: string): boolean {
  // Importing `org.togglz.core.manager.FeatureManager` says nothing about what a
  // bare `Feature` in this file refers to. Only the type itself, or a wildcard
  // that would actually bring it into scope, qualifies it.
  return importedModules(text).some(
    (module) => module === TOGGLZ_FEATURE || module === `${TOGGLZ_PACKAGE}.*`,
  );
}

/** True when this interface reference denotes Togglz's `Feature`. */
function isTogglzFeature(reference: string, importedInFile: boolean): boolean {
  const trimmed = reference.trim();
  if (trimmed === TOGGLZ_FEATURE) return true;

  // A *qualified* name says exactly which Feature it means, so `com.other.Feature`
  // is somebody else's interface no matter what this file imports.
  if (trimmed.includes('.')) return false;

  // A bare `Feature` counts only when the file established what Feature means.
  return importedInFile && trimmed === 'Feature';
}

/**
 * Togglz enums declared in one file.
 *
 * Files under test sources are skipped: a feature enum defined only for a test is
 * scaffolding, not a flag this repository ships. Counting one produced a phantom
 * flag, with findings of its own, in a real inventory.
 */
export async function findTogglzEnums(
  path: string,
  text: string,
  isTest: boolean,
): Promise<TogglzEnum[]> {
  if (isTest) return [];
  // Cheap rejections first: discovery reads every JVM file in the workspace.
  if (!text.includes('enum') || !text.includes('Feature')) return [];

  const spec = grammarFor(path);
  if (spec === undefined || (spec.id !== 'java' && spec.id !== 'kotlin')) return [];

  const importedInFile = togglzFeatureInScope(text);
  // Without an import, only a fully qualified `org.togglz.core.Feature` can
  // establish intent — so a file with neither cannot declare a Togglz enum.
  if (!importedInFile && !text.includes(TOGGLZ_FEATURE)) return [];

  const language = await loadLanguage(spec);
  const parser = await createParser(spec);

  try {
    const tree = parser.parse(text);
    if (tree === null) return [];

    try {
      let query: Query;
      try {
        query = new Query(language, spec.id === 'java' ? JAVA_QUERY : KOTLIN_QUERY);
      } catch {
        return [];
      }

      const packageName = packageOf(text);
      const byEnum = new Map<string, Set<string>>();
      try {
        for (const match of query.matches(tree.rootNode)) {
          const name = match.captures.find((c) => c.name === 'enum')?.node.text;
          const iface = match.captures.find((c) => c.name === 'iface')?.node.text;
          const constant = match.captures.find((c) => c.name === 'constant')?.node.text;
          if (name === undefined || iface === undefined || constant === undefined) continue;
          if (!isTogglzFeature(iface, importedInFile)) continue;

          const constants = byEnum.get(name) ?? new Set<string>();
          constants.add(constant);
          byEnum.set(name, constants);
        }
      } finally {
        query.delete();
      }

      return [...byEnum].map(([name, constants]) => ({
        name,
        qualifiedName: packageName === '' ? name : `${packageName}.${name}`,
        constants,
      }));
    } finally {
      tree.delete();
    }
  } finally {
    parser.delete();
  }
}

/** True when `name.constant` names a known Togglz flag, as seen from this file. */
export function isTogglzMember(
  enums: TogglzEnums,
  name: string,
  constant: string,
  filePackage: string,
  modules: readonly string[],
): boolean {
  return resolveTogglzEnum(enums, name, filePackage, modules)?.has(constant) ?? false;
}
