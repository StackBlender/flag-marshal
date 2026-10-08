import type { Node, Parser } from 'web-tree-sitter';
import type { Confidence, FlagReference, ScanReport } from '../api/generated/scan-report.js';
import { grammarFor } from '../detect/languages.js';
import { createParser } from '../detect/parser-pool.js';
import { scanSource, type ScanOptions } from '../detect/scan-source.js';

/** The value the flag is resolved to: truthy everywhere it is read, or falsy. */
export type FlagValue = 'on' | 'off';

/**
 * Why a preview was refused. Wording lives in `src/present`, never here.
 *
 * - `unknown-flag`: no flag with that key is in the inventory.
 * - `unresolved-keys`: the repository computes some flag keys, so a reference
 *   to this flag could be hiding behind one.
 * - `unparsed-languages`: the repository has source in a language Flag Marshal
 *   cannot read, which could reference this flag unseen.
 * - `not-code`: the flag is also named in configuration or a declaration, which
 *   a code rewrite does not remove.
 * - `unsupported-language`: a reference is outside TypeScript and JavaScript.
 * - `unsupported-shape`: a reference is not the whole condition of an `if` or
 *   a `?:`, optionally awaited, negated, or parenthesized.
 * - `shares-lines`: an `if` to rewrite shares its first or last line with
 *   other code.
 * - `unreadable-file`: a file holding a reference could not be read.
 * - `rewrite-failed`: the rewritten file did not parse cleanly, or still reads
 *   the flag. Reported instead of a diff that could be wrong.
 */
export type RefusalReason =
  | 'unknown-flag'
  | 'unresolved-keys'
  | 'unparsed-languages'
  | 'not-code'
  | 'unsupported-language'
  | 'unsupported-shape'
  | 'shares-lines'
  | 'unreadable-file'
  | 'rewrite-failed';

export interface Refusal {
  readonly reason: RefusalReason;
  /** Workspace-relative file, when the refusal is about one place. */
  readonly file?: string;
  /** 0-based line, like every position in the contract. */
  readonly line?: number;
}

export interface FileRewrite {
  /** Workspace-relative path. */
  readonly path: string;
  readonly before: string;
  readonly after: string;
  /** How many reads of the flag were rewritten in this file. */
  readonly sites: number;
}

/**
 * A dry run of resolving one flag to a fixed value. Nothing is written: the
 * core never writes to a workspace, and applying a preview is a separate step
 * that belongs to whoever reviews it.
 *
 * `confidence` and `debtScore` are the flag's own, shown beside the preview so
 * the reviewer can weigh whether to remove it. They do not gate the preview:
 * the preview claims only that the diff does exactly what the code would do
 * with that value, and it is refused whenever that claim cannot be made.
 */
export interface RefactorPreview {
  readonly key: string;
  readonly value: FlagValue;
  readonly outcome: 'preview' | 'refused';
  readonly confidence?: Confidence;
  readonly debtScore?: number;
  /** Empty when the outcome is `preview`. */
  readonly refusals: readonly Refusal[];
  /** Empty when the outcome is `refused`. */
  readonly files: readonly FileRewrite[];
}

export interface PreviewInput {
  readonly report: ScanReport;
  readonly unparsedLanguages: readonly string[];
  readonly key: string;
  readonly value: FlagValue;
  /** Reads a workspace-relative file. The core performs no I/O of its own. */
  readonly readFile: (path: string) => Promise<string>;
  /** The options the scan used, so a re-scan finds exactly what it found. */
  readonly scanOptions: ScanOptions;
}

const REWRITABLE_LANGUAGES = new Set(['typescript', 'javascript']);

/**
 * Computes the files that would result from resolving `key` to `value`.
 *
 * Narrow on purpose: one shape, two languages. Every reference to the flag must
 * be the whole condition of an `if` statement or a `?:` expression; otherwise
 * the whole preview is refused, listing every place that blocks it. A preview
 * that rewrote some reads and quietly left others would be a confident wrong
 * answer.
 */
export async function previewResolution(input: PreviewInput): Promise<RefactorPreview> {
  const { report, key, value } = input;
  const flag = report.flags.find((f) => f.key === key);
  const refused = (refusals: Refusal[]): RefactorPreview => ({
    key,
    value,
    outcome: 'refused',
    ...(flag?.confidence === undefined ? {} : { confidence: flag.confidence }),
    ...(flag?.debtScore === undefined ? {} : { debtScore: flag.debtScore }),
    refusals,
    files: [],
  });

  if (flag === undefined) return refused([{ reason: 'unknown-flag' }]);

  const refusals: Refusal[] = [];
  if (report.unresolvedReferences.length > 0) refusals.push({ reason: 'unresolved-keys' });
  if (input.unparsedLanguages.length > 0) refusals.push({ reason: 'unparsed-languages' });

  const byFile = new Map<string, FlagReference[]>();
  for (const ref of flag.references) {
    const at = { file: ref.range.file, line: ref.range.start.line };
    if (ref.kind === 'configuration' || ref.kind === 'declaration') {
      refusals.push({ reason: 'not-code', ...at });
    } else if (!REWRITABLE_LANGUAGES.has(ref.language)) {
      refusals.push({ reason: 'unsupported-language', ...at });
    } else {
      byFile.set(ref.range.file, [...(byFile.get(ref.range.file) ?? []), ref]);
    }
  }

  // Every site is checked against the original text first, so a refusal names
  // every blocking place at once and in the positions the user can find.
  const texts = new Map<string, string>();
  for (const [path, refs] of byFile) {
    let text: string;
    try {
      text = await input.readFile(path);
    } catch {
      refusals.push({ reason: 'unreadable-file', file: path });
      continue;
    }
    texts.set(path, text);
    await withParser(path, (parser) => {
      const tree = parser.parse(text);
      if (tree === null) return;
      try {
        for (const ref of refs) {
          const site = locateSite(tree.rootNode, ref);
          if ('reason' in site) {
            const line = site.at?.startPosition.row ?? ref.range.start.line;
            refusals.push({ reason: site.reason, file: path, line });
          }
        }
      } finally {
        tree.delete();
      }
    });
  }

  if (refusals.length > 0) return refused(refusals);

  const files: FileRewrite[] = [];
  for (const [path, before] of texts) {
    const rewritten = await rewriteFile(path, before, key, value, input.scanOptions);
    if (rewritten === undefined) return refused([{ reason: 'rewrite-failed', file: path }]);
    files.push({ path, before, after: rewritten.text, sites: rewritten.sites });
  }

  return {
    key,
    value,
    outcome: 'preview',
    ...(flag.confidence === undefined ? {} : { confidence: flag.confidence }),
    ...(flag.debtScore === undefined ? {} : { debtScore: flag.debtScore }),
    refusals: [],
    files: files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  };
}

async function withParser<T>(path: string, use: (parser: Parser) => T): Promise<T | undefined> {
  const spec = grammarFor(path);
  if (spec === undefined) return undefined;
  const parser = await createParser(spec);
  try {
    return use(parser);
  } finally {
    parser.delete();
  }
}

/**
 * Rewrites one site at a time, re-scanning between them, until the file no
 * longer reads the flag.
 *
 * One at a time is what makes nesting safe: `if (f) { if (f) x(); }` needs the
 * inner site rewritten inside whichever branch the outer one keeps, and the
 * positions of everything after a rewrite have moved. Each rewrite removes at
 * least one read, so this ends. The result must parse without errors and must
 * read the flag nowhere; anything else is refused rather than shown.
 */
async function rewriteFile(
  path: string,
  original: string,
  key: string,
  value: FlagValue,
  options: ScanOptions,
): Promise<{ text: string; sites: number } | undefined> {
  let text = original;
  let sites = 0;
  const limit = original.length;

  for (;;) {
    const refs = (await scanSource({ path, text }, options)).filter((ref) => ref.key === key);
    if (refs.length === 0) break;
    if (sites > limit) return undefined;

    const ref = refs[0];
    if (ref === undefined) return undefined;
    const next = await withParser(path, (parser) => {
      const tree = parser.parse(text);
      if (tree === null) return undefined;
      try {
        const site = locateSite(tree.rootNode, ref);
        return 'reason' in site ? undefined : applySite(text, site, value === 'on', parser);
      } finally {
        tree.delete();
      }
    });
    if (next === undefined) return undefined;
    text = next;
    sites++;
  }

  const clean = await withParser(path, (parser) => {
    const tree = parser.parse(text);
    if (tree === null) return false;
    try {
      return !tree.rootNode.hasError;
    } finally {
      tree.delete();
    }
  });
  return clean === true ? { text, sites } : undefined;
}

/** A read of the flag that can be rewritten, and how. */
type Site =
  | {
      readonly kind: 'if' | 'ternary';
      /** The `if` statement or `?:` expression to replace. */
      readonly node: Node;
      /** True when the read is negated an odd number of times. */
      readonly negated: boolean;
    }
  | {
      readonly kind: 'binding';
      /** The `const` declaration holding the read. */
      readonly node: Node;
      readonly name: string;
      readonly negated: boolean;
    };

/** Why a site cannot be rewritten, and the node to point at when it is not the read. */
interface Blocked {
  readonly reason: RefusalReason;
  readonly at?: Node;
}

/**
 * Walks up from a reference to the construct it decides.
 *
 * Accepted between the call and the condition: `await`, parentheses, and `!`.
 * Anything else — `&&`, a comparison, an assignment, an argument — means the
 * value flows somewhere this rewrite cannot follow, so the site is refused.
 */
function locateSite(root: Node, ref: FlagReference): Site | Blocked {
  const start = { row: ref.range.start.line, column: ref.range.start.character };
  const end = { row: ref.range.end.line, column: ref.range.end.character };
  const keyNode = root.descendantForPosition(start, end);
  const args = keyNode?.parent;
  const call = args?.parent;
  if (args?.type !== 'arguments' || call?.type !== 'call_expression') {
    return { reason: 'unsupported-shape' };
  }
  return siteFrom(call, true);
}

/**
 * The construct `start` decides. A read may also initialize a `const`, whose
 * uses are then sites of their own; a use of that name may not, since that
 * would be a second binding to follow.
 */
function siteFrom(start: Node, allowBinding: boolean): Site | Blocked {
  const blocked: Blocked = { reason: 'unsupported-shape', at: start };
  let current: Node = start;
  let negated = false;
  for (;;) {
    const parent = current.parent;
    if (parent === null) return blocked;

    if (
      parent.type === 'if_statement' &&
      sameNode(parent.childForFieldName('condition'), current)
    ) {
      return isStatementList(parent.parent) ? ifSite(parent, negated) : { ...blocked, at: parent };
    }
    if (
      parent.type === 'ternary_expression' &&
      sameNode(parent.childForFieldName('condition'), current)
    ) {
      return ternaryNeedsCareAt(parent)
        ? { ...blocked, at: parent }
        : { kind: 'ternary', node: parent, negated };
    }
    if (
      allowBinding &&
      parent.type === 'variable_declarator' &&
      sameNode(parent.childForFieldName('value'), current)
    ) {
      return bindingSite(parent, negated);
    }

    if (parent.type === 'await_expression' || parent.type === 'parenthesized_expression') {
      current = parent;
    } else if (parent.type === 'unary_expression' && parent.child(0)?.type === '!') {
      negated = !negated;
      current = parent;
    } else {
      return blocked;
    }
  }
}

function ifSite(node: Node, negated: boolean): Site | Blocked {
  if (!occupiesWholeLines(node)) return { reason: 'shares-lines', at: node };
  return joinsPreviousLine(node)
    ? { reason: 'unsupported-shape', at: node }
    : { kind: 'if', node, negated };
}

/**
 * `const on = await client.variation('k', ...)`, used only as conditions.
 *
 * Only `const`: its value cannot change, so every use sees the read, and
 * substituting it is exact even inside a closure. One declarator, a plain
 * name, on lines of its own in a statement list. Every use of the name in the
 * declaration's scope must be a supported condition, which also refuses
 * anything that redeclares the name there, since a declaration is not one.
 */
function bindingSite(declarator: Node, negated: boolean): Site | Blocked {
  const declaration = declarator.parent;
  const name = declarator.childForFieldName('name');
  const blocked: Blocked = { reason: 'unsupported-shape', at: declarator };
  if (declaration?.type !== 'lexical_declaration' || declaration.child(0)?.type !== 'const') {
    return blocked;
  }
  const declarators = declaration.namedChildren.filter((c) => c?.type === 'variable_declarator');
  if (declarators.length !== 1 || name?.type !== 'identifier') return blocked;
  if (!isStatementList(declaration.parent)) return blocked;
  if (!occupiesWholeLines(declaration)) return { reason: 'shares-lines', at: declaration };
  if (removalJoins(declaration)) return blocked;

  const uses = usesOf(declaration, name);
  if ('reason' in uses) return uses;
  for (const use of uses) {
    const site = siteFrom(use, false);
    if ('reason' in site) return site;
  }
  return { kind: 'binding', node: declaration, name: name.text, negated };
}

/**
 * Every mention of the bound name in the declaration's scope, other than the
 * declaration itself. A shorthand property, `{ on }`, passes the value along
 * rather than testing it, so it blocks.
 */
function usesOf(declaration: Node, name: Node): Node[] | Blocked {
  const scope = declaration.parent;
  if (scope === null) return { reason: 'unsupported-shape', at: declaration };
  const uses: Node[] = [];
  const mentions = scope.descendantsOfType([
    'identifier',
    'shorthand_property_identifier',
    'shorthand_property_identifier_pattern',
  ]);
  for (const node of mentions) {
    if (node === null || node.text !== name.text || sameNode(node, name)) continue;
    if (node.type !== 'identifier') return { reason: 'unsupported-shape', at: node };
    uses.push(node);
  }
  return uses;
}

/** A statement start that can continue the line before it. */
const CONTINUES_LINE = /^[([`+\-/]/;

/** Statements that end themselves with `}` and cannot be continued. */
const CLOSED_BY_BRACE = new Set([
  'if_statement',
  'for_statement',
  'for_in_statement',
  'while_statement',
  'function_declaration',
  'generator_function_declaration',
  'class_declaration',
  'statement_block',
  'try_statement',
  'switch_statement',
]);

/**
 * True when the rewrite could join two statements into one.
 *
 * `if` ends the statement before it even without a semicolon. Take the `if`
 * away and whatever now follows that statement, either the kept branch or the
 * next statement, may continue it: `x = y` then `(z)()` reads as `x = y(z)()`.
 * Both branches are checked, whichever value is chosen, so a site's
 * acceptance does not depend on the value.
 */
function joinsPreviousLine(node: Node): boolean {
  if (previousIsEnded(node)) return false;

  const followers: (Node | null)[] = [namedSibling(node, 'next')];
  for (const field of ['consequence', 'alternative']) {
    let branch = node.childForFieldName(field);
    if (branch?.type === 'else_clause') branch = firstStatement(branch);
    if (branch?.type === 'statement_block' && !declaresBlockScoped(branch)) {
      followers.push(firstStatement(branch) ?? namedSibling(node, 'next'));
    } else {
      followers.push(branch);
    }
  }
  return followers.some((f) => f !== null && CONTINUES_LINE.test(f.text));
}

/** True when deleting `node` could join the statements on either side of it. */
function removalJoins(node: Node): boolean {
  if (previousIsEnded(node)) return false;
  const next = namedSibling(node, 'next');
  return next !== null && CONTINUES_LINE.test(next.text);
}

/** True when the statement before `node`, if any, cannot be continued. */
function previousIsEnded(node: Node): boolean {
  const previous = namedSibling(node, 'previous');
  return (
    previous === null ||
    previous.text.endsWith(';') ||
    (previous.text.endsWith('}') && CLOSED_BY_BRACE.has(previous.type))
  );
}

function namedSibling(node: Node, direction: 'previous' | 'next'): Node | null {
  let sibling = direction === 'previous' ? node.previousNamedSibling : node.nextNamedSibling;
  while (sibling !== null && sibling.type === 'comment') {
    sibling = direction === 'previous' ? sibling.previousNamedSibling : sibling.nextNamedSibling;
  }
  return sibling;
}

function firstStatement(node: Node): Node | null {
  return node.namedChildren.find((c) => c !== null && c.type !== 'comment') ?? null;
}

function sameNode(a: Node | null, b: Node): boolean {
  return (
    a !== null && a.startIndex === b.startIndex && a.endIndex === b.endIndex && a.type === b.type
  );
}

/** An `if` that is a statement in a list, not the braceless body of something. */
function isStatementList(node: Node | null): boolean {
  return (
    node !== null &&
    (node.type === 'program' ||
      node.type === 'statement_block' ||
      node.type === 'switch_case' ||
      node.type === 'switch_default')
  );
}

/** True when nothing but whitespace shares the node's first and last lines. */
function occupiesWholeLines(node: Node): boolean {
  const text = node.tree.rootNode.text;
  const lineStart = text.lastIndexOf('\n', node.startIndex - 1) + 1;
  const lineEnd = text.indexOf('\n', node.endIndex);
  const before = text.slice(lineStart, node.startIndex);
  const after = text.slice(node.endIndex, lineEnd === -1 ? text.length : lineEnd);
  return before.trim() === '' && after.trim() === '';
}

/** Applies one site, given whether the read it tests is truthy. */
function applySite(text: string, site: Site, read: boolean, parser: Parser): string | undefined {
  const truthy = read !== site.negated;
  if (site.kind === 'binding') return applyBinding(text, site, truthy, parser);
  return site.kind === 'if'
    ? applyIf(text, site.node, truthy)
    : applyTernary(text, site.node, truthy);
}

/**
 * Rewrites every use of a bound read, one at a time with a re-parse between,
 * then deletes the declaration.
 *
 * The declaration's start never moves: every use is after it, and it is the
 * last thing edited. So it is found again by position after each rewrite.
 */
function applyBinding(
  text: string,
  site: Site & { kind: 'binding' },
  truthy: boolean,
  parser: Parser,
): string | undefined {
  const start = site.node.startIndex;
  let current = text;
  for (let guard = 0; guard <= text.length; guard++) {
    const tree = parser.parse(current);
    if (tree === null) return undefined;
    try {
      let declaration: Node | null = tree.rootNode.descendantForIndex(start);
      while (
        declaration !== null &&
        !(declaration.type === 'lexical_declaration' && declaration.startIndex === start)
      ) {
        declaration = declaration.parent;
      }
      const name = declaration?.namedChildren
        .find((c) => c?.type === 'variable_declarator')
        ?.childForFieldName('name');
      if (declaration === null || name === null || name === undefined) return undefined;

      const uses = usesOf(declaration, name);
      if ('reason' in uses) return undefined;
      const use = uses[0];
      if (use === undefined) return removeLines(current, declaration);

      const useSite = siteFrom(use, false);
      if ('reason' in useSite) return undefined;
      const next = applySite(current, useSite, truthy, parser);
      if (next === undefined) return undefined;
      current = next;
    } finally {
      tree.delete();
    }
  }
  return undefined;
}

/** The text without the lines `node` occupies. */
function removeLines(text: string, node: Node): string {
  const lineStart = text.lastIndexOf('\n', node.startIndex - 1) + 1;
  const newline = text.indexOf('\n', node.endIndex);
  return text.slice(0, lineStart) + text.slice(newline === -1 ? text.length : newline + 1);
}

/**
 * Replaces an `if` with the branch the value selects.
 *
 * A kept block is unwrapped into the surrounding statements unless it declares
 * something block-scoped: hoisting a `const` out of its block can collide with
 * a name outside it, so such a block keeps its braces. With no branch to keep,
 * the statement's lines are removed.
 */
function applyIf(text: string, node: Node, truthy: boolean): string | undefined {
  const consequence = node.childForFieldName('consequence');
  const alternative = node.childForFieldName('alternative');
  const kept = truthy ? consequence : alternative === null ? null : firstStatement(alternative);

  const lineStart = text.lastIndexOf('\n', node.startIndex - 1) + 1;
  const indent = text.slice(lineStart, node.startIndex);
  const newline = text.indexOf('\n', node.endIndex);
  const lineEnd = newline === -1 ? text.length : newline + 1;

  if (kept === null) return text.slice(0, lineStart) + text.slice(lineEnd);

  let body: string;
  if (kept.type === 'statement_block' && !declaresBlockScoped(kept)) {
    const inner = kept.namedChildren.filter((c): c is Node => c !== null);
    const first = inner[0];
    const last = inner[inner.length - 1];
    // An empty block keeps nothing.
    if (first === undefined || last === undefined)
      return text.slice(0, lineStart) + text.slice(lineEnd);
    body = reindent(text, kept, first, last, indent);
  } else {
    body = reindent(text, kept, kept, kept, indent);
  }
  const trailing = newline === -1 ? '' : '\n';
  return text.slice(0, lineStart) + body + trailing + text.slice(lineEnd);
}

/** Names declared directly in a block, which unwrapping would move outside it. */
function declaresBlockScoped(block: Node): boolean {
  return block.namedChildren.some(
    (c) =>
      c !== null &&
      (c.type === 'lexical_declaration' ||
        c.type === 'class_declaration' ||
        c.type === 'function_declaration' ||
        c.type === 'generator_function_declaration'),
  );
}

/**
 * The text from `first` to `last`, moved from its own line's indentation to
 * `indent`. Lines inside a multi-line template literal are left exactly as they
 * are, because their whitespace is part of a string.
 */
function reindent(text: string, scope: Node, first: Node, last: Node, indent: string): string {
  const lineStart = text.lastIndexOf('\n', first.startIndex - 1) + 1;
  const ownIndent = /^[ \t]*/.exec(text.slice(lineStart, first.startIndex))?.[0] ?? '';
  const fromLine = first.startPosition.row;

  const frozen = new Set<number>();
  for (const literal of scope.descendantsOfType('template_string')) {
    if (literal === null) continue;
    for (let row = literal.startPosition.row + 1; row <= literal.endPosition.row; row++) {
      frozen.add(row);
    }
  }

  return text
    .slice(first.startIndex, last.endIndex)
    .split('\n')
    .map((line, i) => {
      if (i === 0) return indent + line;
      if (frozen.has(fromLine + i)) return line;
      if (line.trim() === '') return '';
      return line.startsWith(ownIndent) ? indent + line.slice(ownIndent.length) : line;
    })
    .join('\n');
}

/** Expressions that can stand anywhere a `?:` stood without parentheses. */
const SELF_CONTAINED = new Set([
  'identifier',
  'number',
  'string',
  'template_string',
  'true',
  'false',
  'null',
  'undefined',
  'this',
  'call_expression',
  'member_expression',
  'subscript_expression',
  'parenthesized_expression',
  'array',
]);

/**
 * Replaces a `?:` with the branch the value selects, parenthesized unless it
 * cannot bind differently where the `?:` stood. A parenthesized branch at the
 * very start of a statement is refused: after a line with no semicolon, `(`
 * would continue the previous statement.
 */
function applyTernary(text: string, node: Node, truthy: boolean): string | undefined {
  const kept = node.childForFieldName(truthy ? 'consequence' : 'alternative');
  if (kept === null) return undefined;
  const replacement = standsBare(node, kept) ? kept.text : `(${kept.text})`;
  return text.slice(0, node.startIndex) + replacement + text.slice(node.endIndex);
}

function standsBare(ternary: Node, branch: Node): boolean {
  if (SELF_CONTAINED.has(branch.type)) return true;
  // Where a whole assignment-level expression already stands, any branch can:
  // a `?:` branch is itself at most an assignment, an arrow or a yield.
  const parent = ternary.parent;
  if (parent === null) return false;
  if (OPEN_CONTEXTS.has(parent.type)) return true;
  return (
    (parent.type === 'variable_declarator' || parent.type === 'assignment_expression') &&
    sameNode(parent.childForFieldName('value') ?? parent.childForFieldName('right'), ternary)
  );
}

/** Parents in which any assignment-level expression stands without parentheses. */
const OPEN_CONTEXTS = new Set([
  'parenthesized_expression',
  'return_statement',
  'arguments',
  'array',
  'template_substitution',
]);

/**
 * True when either branch would start a statement with a character that can
 * continue the previous line: after a line with no semicolon, `(`, `[`, a
 * template literal, `+`, `-` or `/` joins it, and the rewrite would change what
 * the code means.
 */
function ternaryNeedsCareAt(ternary: Node): boolean {
  if (ternary.parent?.type !== 'expression_statement') return false;
  return ['consequence', 'alternative'].some((field) => {
    const branch = ternary.childForFieldName(field);
    if (branch === null) return true;
    const replacement = standsBare(ternary, branch) ? branch.text : `(${branch.text})`;
    return /^[([`+\-/]/.test(replacement);
  });
}
