import { Query, type Language as TSLanguage, type Node } from 'web-tree-sitter';

/**
 * Immutable string constants declared in one file.
 *
 * A flag key held in a constant is the most common real shape there is:
 *
 *     private static final String CHECKOUT_V2 = "checkout-v2";
 *     client.boolVariation(CHECKOUT_V2, user, false);
 *
 * Reading that is not guessing; the value is written right there. But the reading
 * has to be done by a parser. An earlier regular-expression version got two
 * things badly wrong:
 *
 *   - It accepted **mutable** bindings. `let FLAG = 'first'; FLAG = 'second';`
 *     resolved to `first` while the runtime saw `second` — a confidently wrong
 *     key, which is worse than no key.
 *   - It could not tell code from **comments**. A line reading
 *     `// const FLAG = 'invented-key'` invented that key outright, violating the
 *     one guarantee this product cannot break.
 *
 * Only structurally immutable bindings count: Java `final`, TypeScript and
 * JavaScript `const`, Kotlin `val`. Anything reassignable would need assignment
 * and scope analysis to resolve honestly, so it stays unresolved.
 */
const JAVA_QUERY = `
  (field_declaration
    (modifiers)? @modifiers
    type: (type_identifier) @type
    declarator: (variable_declarator name: (identifier) @name value: (string_literal) @value)) @field

  (local_variable_declaration
    type: (type_identifier) @type
    declarator: (variable_declarator name: (identifier) @name value: (string_literal) @value)) @local
`;

const TS_QUERY = `
  (lexical_declaration
    (variable_declarator name: (identifier) @name value: (string) @value)) @declaration
`;

const KOTLIN_QUERY = `
  (property_declaration
    (variable_declaration (identifier) @name)
    (string_literal) @value) @declaration
`;

/**
 * Names assigned to after declaration, anywhere in the file.
 *
 * Java calls a local that is never reassigned *effectively final*, and the same
 * idea rescues real detections without giving up soundness: a binding nothing
 * writes to cannot change under us. `String FLAG = "first"; FLAG = "second";` is
 * caught here and stays unresolved; `String key = "checkout-v2";` used once is
 * resolved as it should be.
 *
 * Same-file only, and deliberately blunt: a name reassigned in *any* scope
 * disqualifies it everywhere in the file. Erring toward unresolved is the whole
 * point.
 *
 * Writes through a receiver count too. `this.FLAG = "second"` is an assignment to
 * `FLAG` that an identifier-only pattern does not see, and missing it produced
 * exactly the failure this module exists to prevent: a confidently reported key
 * the runtime never uses.
 */
const ASSIGNMENT_QUERIES: Record<string, string> = {
  java: `
    (assignment_expression left: (identifier) @assigned)
    (assignment_expression left: (field_access field: (identifier) @assigned))
  `,
  typescript: `
    (assignment_expression left: (identifier) @assigned)
    (assignment_expression left: (member_expression property: (property_identifier) @assigned))
  `,
  javascript: `
    (assignment_expression left: (identifier) @assigned)
    (assignment_expression left: (member_expression property: (property_identifier) @assigned))
  `,
};

/**
 * Returns undefined when the writes could not be analysed at all.
 *
 * This used to return an empty set on a query that failed to compile, which reads
 * as "nothing is reassigned" and made every mutable binding look constant. It is
 * not hypothetical: widening this query with a node type one grammar does not
 * have silently disabled reassignment tracking for that language, and two tests
 * that existed precisely to catch confidently-wrong keys went green. A pass that
 * cannot see the writes must say so, not answer "none".
 */
function reassignedNames(
  root: Node,
  language: TSLanguage,
  languageId: string,
): ReadonlySet<string> | undefined {
  const names = new Set<string>();
  if (languageId === 'kotlin') return names; // `val` versus `var` is explicit.

  const source = ASSIGNMENT_QUERIES[languageId];
  if (source === undefined) return undefined;

  let query: Query;
  try {
    query = new Query(language, source);
  } catch {
    return undefined;
  }
  try {
    for (const match of query.matches(root)) {
      const name = match.captures.find((c) => c.name === 'assigned')?.node.text;
      if (name !== undefined) names.add(name);
    }
  } finally {
    query.delete();
  }
  return names;
}

/** Sentinel for a name declared more than once with conflicting values. */
const AMBIGUOUS = 'flag-marshal:ambiguous-constant';

function queryFor(language: string): string | undefined {
  switch (language) {
    case 'java':
      return JAVA_QUERY;
    case 'typescript':
    case 'javascript':
      return TS_QUERY;
    case 'kotlin':
      return KOTLIN_QUERY;
    default:
      return undefined;
  }
}

/** Whether this declaration cannot be reassigned. */
function isImmutable(
  language: string,
  captures: Map<string, Node>,
  reassigned: ReadonlySet<string> | undefined,
): boolean {
  // The writes could not be analysed, so nothing here can be called constant.
  if (reassigned === undefined) return false;

  const name = captures.get('name')?.text ?? '';
  // Whatever the keyword says, a name something writes to is not a constant.
  if (reassigned.has(name)) return false;

  switch (language) {
    case 'java': {
      const type = captures.get('type')?.text ?? '';
      if (type !== 'String') return false;

      // A field must say `final`. "Effectively final" is a claim about every
      // write in a program, and a field can be written from any method, any
      // constructor, any other class holding a reference — none of which this
      // file-local pass can see. For a local variable or parameter the writes
      // are all in view, so never being reassigned really does mean constant.
      if (captures.has('field')) {
        return (captures.get('modifiers')?.text ?? '').split(/\s+/).includes('final');
      }
      return true;
    }
    case 'typescript':
    case 'javascript': {
      // `const` is immutable outright; a `let` never written to is effectively so.
      return true;
    }
    case 'kotlin': {
      const declaration = captures.get('declaration');
      return declaration?.children.some((child) => child?.type === 'val') ?? false;
    }
    default:
      return false;
  }
}

function unquote(text: string): string {
  if (text.length < 2) return text;
  const first = text[0];
  if ((first === "'" || first === '"' || first === '`') && text.endsWith(first)) {
    return text.slice(1, -1);
  }
  return text;
}

/**
 * Constant name to string value, read from the parse tree.
 *
 * Working from the tree rather than the text means a declaration inside a
 * comment or a string simply is not there — it never becomes a node.
 */
export function collectStringConstants(
  root: Node,
  language: TSLanguage,
  languageId: string,
): ReadonlyMap<string, string> {
  const constants = new Map<string, string>();
  const source = queryFor(languageId);
  if (source === undefined) return constants;

  const reassigned = reassignedNames(root, language, languageId);

  let query: Query;
  try {
    query = new Query(language, source);
  } catch {
    return constants;
  }

  try {
    for (const match of query.matches(root)) {
      const captures = new Map(match.captures.map((c) => [c.name, c.node]));
      if (!isImmutable(languageId, captures, reassigned)) continue;

      const name = captures.get('name')?.text;
      const raw = captures.get('value')?.text;
      if (name === undefined || raw === undefined) continue;

      // A Kotlin or TypeScript template with an interpolation is not a literal.
      const value = unquote(raw);
      if (value.includes('${')) continue;

      // A name declared twice with different values cannot be resolved from this
      // file alone. Dropping it is honest; picking one would be a guess.
      if (constants.has(name) && constants.get(name) !== value) {
        constants.set(name, AMBIGUOUS);
        continue;
      }
      constants.set(name, value);
    }
  } finally {
    query.delete();
  }

  for (const [name, value] of [...constants]) {
    if (value === AMBIGUOUS) constants.delete(name);
  }
  return constants;
}
