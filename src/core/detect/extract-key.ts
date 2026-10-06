import type { Node } from 'web-tree-sitter';

export interface ExtractedKey {
  /** The literal flag key, or null when it could not be read statically. */
  readonly key: string | null;
  /** Source text of the expression, present only when the key is unresolved. */
  readonly expression: string | undefined;
}

/**
 * Reads a flag key from the argument node a provider query captured.
 *
 * This function is where the product's central credibility rule lives: a key
 * that cannot be read from the source is reported as unresolved and **never
 * guessed**. Inferring `experiment-` + a variable would produce confident
 * nonsense, and confident nonsense is what gets an analyzer uninstalled.
 */
export function extractKey(
  node: Node,
  language: string,
  keysAreIdentifiers = false,
  constants: ReadonlyMap<string, string> = new Map(),
): ExtractedKey {
  // Togglz names its flags as enum constants, so the identifier's own text is
  // the key. There is nothing computed about it.
  if (keysAreIdentifiers && /identifier/.test(node.type)) {
    return { key: node.text, expression: undefined };
  }
  const literal = literalValue(node, language);
  if (literal !== undefined) return { key: literal, expression: undefined };

  // A key held in a same-file constant, or built by joining known pieces, is
  // written down in the source. Reading it is not guessing.
  const folded = fold(node, language, constants);
  if (folded !== undefined) return { key: folded, expression: undefined };

  return { key: null, expression: node.text };
}

/** Node types that can join strings with `+`. */
const CONCATENATION = /binary_expression|additive_expression/;

/**
 * Resolves an expression when every part of it is statically known.
 *
 * Handles a bare constant reference and `PREFIX + "suffix"` chains. Anything with
 * an unknown part — a variable, a call, a constant from another file — returns
 * undefined and stays unresolved.
 */
function fold(
  node: Node,
  language: string,
  constants: ReadonlyMap<string, string>,
): string | undefined {
  const literal = literalValue(node, language);
  if (literal !== undefined) return literal;

  if (/identifier/.test(node.type)) return constants.get(node.text);

  if (CONCATENATION.test(node.type)) {
    // Only `+` joins strings; any other operator is arithmetic or comparison.
    const joinsWithPlus = node.children.some((child) => child !== null && child.type === '+');
    if (!joinsWithPlus) return undefined;

    const parts = node.namedChildren.filter((child): child is Node => child !== null);
    if (parts.length === 0) return undefined;

    let joined = '';
    for (const part of parts) {
      const value = fold(part, language, constants);
      if (value === undefined) return undefined;
      joined += value;
    }
    return joined;
  }

  return undefined;
}

/**
 * Node types that mean "a value was spliced in here". A literal containing one is
 * not knowable statically, in any language.
 */
const INTERPOLATION = /interpolat|substitution|template_expression/i;

function literalValue(node: Node, language: string): string | undefined {
  switch (node.type) {
    // TypeScript and JavaScript: 'key' and "key".
    case 'string':
      return unquote(node.text);

    // TypeScript/JavaScript `key`, and Java/Kotlin "key". All three are genuine
    // literals only when nothing is interpolated into them.
    case 'template_string':
      return hasInterpolation(node) ? undefined : unquote(node.text);

    case 'string_literal':
      if (hasInterpolation(node)) return undefined;
      // Kotlin's `$name` form produces no interpolation node at all — the parse
      // tree is indistinguishable from a plain string, so the text has to be
      // checked directly. Without this the extractor would happily report a flag
      // key of `prefix-$name`, which is exactly the confident nonsense this
      // function exists to prevent. Only `${...}` yields an `interpolation` node.
      if (language === 'kotlin' && hasKotlinTemplate(node.text)) return undefined;
      return unquote(node.text);

    default:
      return undefined;
  }
}

function hasInterpolation(node: Node): boolean {
  return node.namedChildren.some((child) => child !== null && INTERPOLATION.test(child.type));
}

/** An unescaped `$` in a Kotlin string means a value is spliced in. */
function hasKotlinTemplate(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') {
      i += 1;
      continue;
    }
    if (text[i] === '$') return true;
  }
  return false;
}

function unquote(text: string): string {
  if (text.length < 2) return text;
  const first = text[0];
  const last = text[text.length - 1];
  if ((first === "'" || first === '"' || first === '`') && first === last) {
    return text.slice(1, -1);
  }
  return text;
}
