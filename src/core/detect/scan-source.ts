import { Query, type Node, type Parser } from 'web-tree-sitter';
import type { FlagReference, Provider, ReferenceKind } from '../api/generated/scan-report.js';
import { grammarFor, type GrammarSpec } from './languages.js';
import { createParser, loadLanguage } from './parser-pool.js';
import { extractKey } from './extract-key.js';
import { declaredWrapperOf, passThroughFunction } from './wrapper.js';
import { collectStringConstants } from './constants.js';
import { isTogglzMember, packageOf, type TogglzEnums } from './togglz-enums.js';
import { isTestPath } from './test-paths.js';
import { BUILT_IN_ADAPTERS, BUILT_IN_METHOD_NAMES } from './providers/index.js';
import {
  boundIdentifiers,
  importedModules,
  providersInScope,
  mightContainFlags,
  RECEIVERLESS_PROVIDERS,
  UNGATED_PROVIDERS,
} from './provider-identity.js';
import { unsupportedProvidersIn, type UnsupportedSighting } from './provider-identity.js';
import type { ProviderAdapter } from './provider.js';

/** Providers wired up so far. See `providers/index.ts` to add one. */
export const ADAPTERS: readonly ProviderAdapter[] = BUILT_IN_ADAPTERS;

export interface ScanOptions {
  /** Extra adapters, such as a user-configured custom helper. */
  readonly adapters?: readonly ProviderAdapter[];
  /** Togglz enums discovered across the workspace, keyed by enum type name. */
  readonly togglzEnums?: TogglzEnums;
  /**
   * Method names from a user-configured custom adapter.
   *
   * The adapter itself carries them into its query, but the prefilter has to know
   * them too: a homegrown `Features.isEnabled(...)` imports no provider and
   * matches no built-in marker, so without this its file would be skipped before
   * the adapter ever ran. Passing the adapter alone was the first version of this
   * and it silently disabled every custom pattern.
   */
  readonly customMethods?: readonly string[];
  /**
   * Filled in, when supplied: each declared helper found forwarding its key
   * parameter straight into an SDK call, and which SDKs it forwards to. Those
   * calls are not reported as unresolved — the helper's callers carry the keys.
   */
  readonly passThroughs?: Map<string, Set<Provider>>;
}

/** Unsupported platforms seen while scanning, reported so the gap is visible. */
export function unsupportedIn(file: SourceFile): UnsupportedSighting[] {
  return unsupportedProvidersIn(file.text);
}

export interface SourceFile {
  /** Path relative to the workspace root, forward slashes on every platform. */
  readonly path: string;
  readonly text: string;
}

function referenceKind(path: string): ReferenceKind {
  return isTestPath(path) ? 'test-code' : 'production-code';
}

/**
 * Skips building a syntax tree for a file that cannot contain a flag reference.
 *
 * Parsing is effectively the entire cost of a scan, and most files in a real
 * application mention no flag mechanism at all. The triggers that are not
 * statically known are supplied here: user-configured custom methods, and the
 * simple names of Togglz enums found elsewhere in the workspace — a file using
 * `Features.CHECKOUT` imports the application's own enum, so no static marker
 * would match it.
 *
 * See `mightContainFlags` for why this cannot lose a detection.
 */
function worthParsing(file: SourceFile, options: ScanOptions): boolean {
  const extra = [
    ...(options.togglzEnums?.bySimpleName.keys() ?? []),
    ...(options.customMethods ?? []),
  ];
  return mightContainFlags(file.text, extra);
}

/**
 * Finds every flag reference in one source file.
 *
 * Returns an empty array for a file no wired grammar claims, rather than
 * throwing. A repository is full of files this tool has no opinion about.
 */
export async function scanSource(
  file: SourceFile,
  options: ScanOptions = {},
): Promise<FlagReference[]> {
  const spec = grammarFor(file.path);
  if (spec === undefined) return [];

  if (!worthParsing(file, options)) return [];

  const parser = await createParser(spec);
  try {
    return sortReferences(await scanWith(parser, spec, file, adaptersOf(options), options));
  } finally {
    parser.delete();
  }
}

/**
 * Scans many files, reusing one parser per language.
 *
 * Creating a parser per file is measurably wasteful across a real repository,
 * which is the case this function exists for. `scanSource` remains the
 * single-file entry point an editor frontend wants.
 */
export async function scanSources(
  files: AsyncIterable<SourceFile>,
  options: ScanOptions = {},
): Promise<FlagReference[]> {
  const parsers = new Map<string, Parser>();
  const found: FlagReference[] = [];

  try {
    for await (const file of files) {
      const spec = grammarFor(file.path);
      if (spec === undefined) continue;
      if (!worthParsing(file, options)) continue;

      let parser = parsers.get(spec.wasmPath);
      if (parser === undefined) {
        parser = await createParser(spec);
        parsers.set(spec.wasmPath, parser);
      }
      found.push(...(await scanWith(parser, spec, file, adaptersOf(options), options)));
    }
  } finally {
    for (const parser of parsers.values()) parser.delete();
  }

  return sortReferences(found);
}

/**
 * Finds every flag reference in one already-parsed language.
 *
 * Positions come straight from tree-sitter, whose columns are UTF-16 code units
 * — the same encoding the report declares — so no conversion happens here.
 * Verified empirically against multi-byte and surrogate-pair input; see
 * `test/core/positions.test.ts`.
 */
/**
 * Composes Spring's `prefix` with a `name`, as Spring itself does.
 *
 * `@ConditionalOnProperty(prefix = "features", name = "checkout")` reads the
 * property `features.checkout`. Reading `checkout` alone put a key in the
 * inventory that no configuration file defines, so every prefixed switch looked
 * unconfigured. Spring appends the separating dot unless the prefix already ends
 * with one. A prefix that cannot be read statically makes the whole key
 * unresolved: half a key is still a guess.
 */
function withSpringPrefix(
  extracted: ReturnType<typeof extractKey>,
  node: Node,
  languageId: string,
  constants: ReturnType<typeof collectStringConstants>,
): ReturnType<typeof extractKey> {
  if (extracted.key === null) return extracted;
  const annotation = enclosingAnnotation(node);
  const prefixNode =
    annotation === undefined ? undefined : annotationArgument(annotation, 'prefix');
  if (prefixNode === undefined) return extracted;

  const prefix = extractKey(prefixNode, languageId, false, constants).key;
  if (prefix === null) {
    return { key: null, expression: `${prefixNode.text} + ${node.text}` };
  }
  const trimmed = prefix.trim();
  if (trimmed === '') return extracted;
  const separator = trimmed.endsWith('.') ? '' : '.';
  return { key: `${trimmed}${separator}${extracted.key}`, expression: undefined };
}

function enclosingAnnotation(node: Node): Node | undefined {
  let current: Node | null = node;
  for (let depth = 0; current !== null && depth < 8; depth++) {
    if (current.type === 'annotation') return current;
    current = current.parent;
  }
  return undefined;
}

/**
 * The value of a named argument on this annotation — Java `element_value_pair`,
 * Kotlin `value_argument` — ignoring any annotation nested inside it.
 */
function annotationArgument(annotation: Node, name: string): Node | undefined {
  for (const pair of annotation.descendantsOfType(['element_value_pair', 'value_argument'])) {
    if (pair === null || enclosingAnnotation(pair)?.id !== annotation.id) continue;
    const children = pair.namedChildren.filter((child): child is Node => child !== null);
    const label = pair.childForFieldName('key') ?? children[0];
    const value = pair.childForFieldName('value') ?? children[children.length - 1];
    if (label === undefined || value === undefined || label.id === value.id) continue;
    if (label.text === name) return value;
  }
  return undefined;
}

/**
 * Whether the enclosing annotation declares `matchIfMissing = true`.
 *
 * Spring then applies its own default when no property exists, so a missing
 * configuration entry is normal rather than a defect. Reporting it as one would
 * put a finding on every conditional that ships with a sensible default.
 */
function matchesIfMissing(node: Node): boolean {
  let current: Node | null = node;
  for (let depth = 0; current !== null && depth < 8; depth++) {
    if (current.type === 'annotation') {
      return /matchIfMissing\s*=\s*true/.test(current.text);
    }
    current = current.parent;
  }
  return false;
}

/**
 * Whether a call's receiver is an identifier this file binds to the provider.
 *
 * A receiver containing a call — `Builder.builder().isEnabled(x)` — is rejected
 * outright: a freshly constructed object is not the SDK client. A bare call with
 * no receiver at all is rejected for the same reason.
 */
function receiverIsBound(receiver: Node | undefined, bound: ReadonlySet<string>): boolean {
  if (receiver === undefined) return false;
  if (/call|invocation/.test(receiver.type)) return false;

  // `client`, `this.client`, `self.client` — take the final identifier.
  const text = receiver.text.trim();
  if (!/^[\w.$]+$/.test(text)) return false;
  const last = text.split('.').pop();
  return last !== undefined && bound.has(last);
}

/** True when this identifier is an enum constant's own declaration. */
function isEnumDeclaration(node: Node): boolean {
  const parent = node.parent?.type;
  return parent === 'enum_constant' || parent === 'enum_entry';
}

/** Array-literal node types whose string members are each a flag key. */
const ARRAY_LITERALS = new Set(['collection_literal', 'element_value_array_initializer', 'array']);

/**
 * Expands an annotation array into its members.
 *
 * Kotlin writes `name = ["a"]` as a `collection_literal`; Java writes
 * `name = {"a"}` as an `element_value_array_initializer`. Reporting the whole
 * array as one unresolved expression, which is what happened before, turns a
 * perfectly static key into a phantom computed one.
 */
function expandKeyNodes(node: Node): Node[] {
  if (!ARRAY_LITERALS.has(node.type)) return [node];
  const members = node.namedChildren.filter((child): child is Node => child !== null);
  return members.length > 0 ? members : [node];
}

function adaptersOf(options: ScanOptions): readonly ProviderAdapter[] {
  return options.adapters === undefined ? ADAPTERS : [...ADAPTERS, ...options.adapters];
}

async function scanWith(
  parser: Parser,
  spec: GrammarSpec,
  file: SourceFile,
  adapters: readonly ProviderAdapter[],
  options: ScanOptions,
): Promise<FlagReference[]> {
  const language = await loadLanguage(spec);
  const kind = referenceKind(file.path);
  const found: FlagReference[] = [];

  const tree = parser.parse(file.text);
  if (tree === null) return found;

  // Flag keys are very often held in a constant beside the call site. Read from
  // the tree already parsed, so a declaration inside a comment is not a node and
  // a mutable binding is never mistaken for a constant.
  const constants = collectStringConstants(tree.rootNode, language, spec.id);

  // A provider's methods are only searched for where that provider is imported.
  // See provider-identity.ts for why method names alone are not enough.
  const inScope = providersInScope(file.text);
  // Resolving `FeatureFlags.X` needs to know which FeatureFlags this file means.
  const filePackage = packageOf(file.text);
  const fileModules = importedModules(file.text);

  try {
    for (const adapter of adapters) {
      // Togglz usage files import the application's enum, not org.togglz, so the
      // import gate cannot decide for them; the discovered-enum filter below does.
      const togglzKnown = adapter.id === 'togglz' && (options.togglzEnums?.size ?? 0) > 0;
      if (!UNGATED_PROVIDERS.has(adapter.id) && !inScope.has(adapter.id) && !togglzKnown) {
        continue;
      }
      const source = adapter.queryFor(language, spec.id);
      if (source === undefined) continue;

      // Identifiers this file binds to the provider, used to check each receiver.
      // Togglz names its flags as enum constants, so there is no client receiver
      // to bind — its import gate alone establishes identity.
      const bound =
        UNGATED_PROVIDERS.has(adapter.id) || RECEIVERLESS_PROVIDERS.has(adapter.id)
          ? undefined
          : boundIdentifiers(file.text, adapter.id);

      // A query that fails to compile is a bug in this codebase, not in the
      // user's repository, and it must not cost them their whole scan. Every
      // adapter query is compiled against every grammar in
      // `test/core/queries.test.ts`, so breakage fails CI rather than silently
      // reducing what a user sees.
      let query;
      try {
        query = new Query(language, source);
      } catch {
        continue;
      }

      try {
        for (const match of query.matches(tree.rootNode)) {
          const captured = match.captures.find((c) => c.name === 'key')?.node;
          if (captured === undefined) continue;

          // An import proves the SDK is used somewhere in this file; it does not
          // prove this call belongs to it. A file can import Unleash and also
          // build a Lombok object whose setter is named isEnabled.
          if (bound !== undefined) {
            const receiver = match.captures.find((c) => c.name === 'receiver')?.node;
            if (!receiverIsBound(receiver, bound)) continue;
          }

          // `@ConditionalOnProperty(name = ["a", "b"])` names two properties in
          // one annotation. Each literal inside becomes its own reference.
          // A `Name.CONSTANT` match is a Togglz flag only when the workspace
          // actually declares that enum with that constant.
          const enumName = match.captures.find((c) => c.name === 'enum')?.node;
          if (enumName !== undefined) {
            const enums = options.togglzEnums;
            if (
              enums === undefined ||
              !isTogglzMember(enums, enumName.text, captured.text, filePackage, fileModules)
            ) {
              continue;
            }
          }

          for (const node of expandKeyNodes(captured)) {
            const extracted = extractKey(node, spec.id, adapter.keysAreIdentifiers, constants);
            const { key, expression } =
              adapter.id === 'spring-conditional'
                ? withSpringPrefix(extracted, node, spec.id, constants)
                : extracted;
            const defaultsWhenAbsent =
              adapter.id === 'spring-conditional' && matchesIfMissing(node);
            // An enum constant's own declaration proves the flag exists; it is
            // not code that reads it. Counting it as usage made every declared
            // flag look used, hiding the ones nothing references.
            const declaresHere = isEnumDeclaration(node);
            // A feature enum defined under test sources is scaffolding, not a flag
            // this repository ships. Its declaration must not create inventory —
            // it produced a phantom flag, with its own findings, in a real report.
            // Test *usages* of a production-declared flag still count, because
            // those come through the discovered-enum path instead.
            if (declaresHere && kind === 'test-code') continue;
            // A literal empty or whitespace-only key is a real string in the
            // source, but it can never name a flag — it comes from tests that
            // assert an empty name is rejected. Reporting it puts a nameless
            // entry in the inventory, which reads as a bug in the analyzer.
            if (key !== null && key.trim() === '') continue;
            // The key inside the team's own declared flag helper comes from its
            // callers, which the custom pattern already reads one by one.
            const wrapper =
              key === null ? declaredWrapperOf(node, options.customMethods) : undefined;
            if (wrapper !== undefined) {
              const wrapped = options.passThroughs?.get(wrapper) ?? new Set<Provider>();
              wrapped.add(adapter.id);
              options.passThroughs?.set(wrapper, wrapped);
              continue;
            }
            const referenceKindHere = declaresHere ? 'declaration' : kind;
            found.push({
              key,
              range: {
                file: file.path,
                start: { line: node.startPosition.row, character: node.startPosition.column },
                end: { line: node.endPosition.row, character: node.endPosition.column },
              },
              provider: adapter.id,
              language: spec.id,
              kind: referenceKindHere,
              resolution: key === null ? 'unresolved' : 'resolved',
              ...(expression === undefined ? {} : { expression }),
              ...(defaultsWhenAbsent ? { defaultsWhenAbsent: true } : {}),
              ...helperSuggestion(key, node),
            });
          }
        }
      } finally {
        query.delete();
      }
    }
  } finally {
    tree.delete();
  }

  return found;
}

/**
 * An unresolved key passed straight through a named function is usually the
 * team's own flag helper; naming it tells the user exactly what to declare.
 *
 * A helper that shares a name with an SDK method is not suggested: declared, it
 * would match that name on every receiver in the repository.
 */
function helperSuggestion(key: string | null, node: Node): { helperCandidate?: string } {
  if (key !== null) return {};
  const name = passThroughFunction(node);
  return name === undefined || BUILT_IN_METHOD_NAMES.has(name) ? {} : { helperCandidate: name };
}

/**
 * Deterministic order: by file, then position. Callers — goldens, CI diffs, and
 * PR comments — all depend on the same input producing byte-identical output.
 */
export function sortReferences(refs: readonly FlagReference[]): FlagReference[] {
  // Two query patterns can match the same node — a Togglz member access is both
  // a field access and part of an `isActive()` call — so identical references
  // are collapsed before ordering. A flag counted twice inflates every downstream
  // number: reference counts, module spread, confidence, and the debt score.
  const seen = new Set<string>();
  const unique = refs.filter((ref) => {
    const identity = [
      ref.key,
      ref.range.file,
      ref.range.start.line,
      ref.range.start.character,
      ref.provider,
      ref.kind,
    ].join('\u0000');
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });

  return unique.sort((a, b) => {
    if (a.range.file !== b.range.file) return a.range.file < b.range.file ? -1 : 1;
    if (a.range.start.line !== b.range.start.line) return a.range.start.line - b.range.start.line;
    return a.range.start.character - b.range.start.character;
  });
}
