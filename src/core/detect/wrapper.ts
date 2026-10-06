import type { Node } from 'web-tree-sitter';
import type { Provider } from '../api/generated/scan-report.js';

/** Node types that open a function body, across every wired grammar. */
const FUNCTION_TYPES = new Set([
  'function_declaration',
  'function_expression',
  'generator_function_declaration',
  'arrow_function',
  'method_definition',
  'method_declaration',
  'anonymous_function',
  'lambda_literal',
]);

/** Functions that take the name of whatever they are assigned to. */
const ANONYMOUS = new Set([
  'arrow_function',
  'function_expression',
  'anonymous_function',
  'lambda_literal',
]);

/** Where an anonymous function acquires the name its callers use. */
const HOLDERS = new Set([
  'variable_declarator',
  'pair',
  'public_field_definition',
  'field_definition',
]);

/** Node types whose children name the enclosing function's parameters. */
const PARAMETER_LIST = /parameters$/;

/** Plain identifiers, which differ by grammar. */
const IDENTIFIER = new Set(['identifier', 'simple_identifier']);

/**
 * The declared helper an unresolved key passes through, or undefined when the
 * key is not simply a parameter of the team's own flag helper.
 *
 * A wrapper such as `isEnabled(key) { return ld.variation(key, ...) }` holds the
 * one SDK call in the codebase whose key can never be literal, because the key
 * arrives from the caller. When the team has declared that helper under
 * `customPatterns.methods`, each call to it is already read as its own
 * reference, so the call inside is a pass-through rather than a flag the scan
 * could not see. Leaving it unresolved made one helper lower the confidence of
 * every flag in the repository.
 */
export function declaredWrapperOf(
  keyNode: Node,
  customMethods: readonly string[] | undefined,
): string | undefined {
  if (customMethods === undefined || customMethods.length === 0) return undefined;
  const name = passThroughFunction(keyNode);
  return name !== undefined && customMethods.includes(name) ? name : undefined;
}

/**
 * The enclosing function's name when a key is passed straight through it, so
 * the helper can be suggested to the user. Declared or not — this names a
 * candidate and attributes nothing.
 *
 * Deliberately narrow, so a suggestion is never wrong about the shape:
 * - the key must be a bare identifier, not an expression built from one;
 * - the nearest enclosing function must have a name a caller would use;
 * - the identifier must be one of that function's own parameters;
 * - and nothing in the function may assign to it, so `key = prefix + key` is
 *   not a pass-through.
 */
export function passThroughFunction(keyNode: Node): string | undefined {
  if (!IDENTIFIER.has(keyNode.type)) return undefined;

  const fn = enclosingFunction(keyNode);
  if (fn === undefined) return undefined;

  const name = functionName(fn);
  if (name === undefined) return undefined;

  const parameters = fn.children.find((child) => child !== null && PARAMETER_LIST.test(child.type));
  if (parameters === undefined || parameters === null) return undefined;
  const isParameter = parameters
    .descendantsOfType([...IDENTIFIER])
    .some((node) => node !== null && node.text === keyNode.text);
  if (!isParameter) return undefined;

  return reassigns(fn, keyNode.text) ? undefined : name;
}

function enclosingFunction(node: Node): Node | undefined {
  for (let current = node.parent; current !== null; current = current.parent) {
    if (FUNCTION_TYPES.has(current.type)) return current;
  }
  return undefined;
}

/**
 * The name a caller would use. An arrow function or function expression takes
 * the name of the variable or property it is assigned to.
 */
function functionName(fn: Node): string | undefined {
  if (!ANONYMOUS.has(fn.type)) {
    const own =
      fn.childForFieldName('name') ??
      fn.children.find((child) => child !== null && IDENTIFIER.has(child.type)) ??
      null;
    return own?.text;
  }
  const holder = fn.parent;
  if (holder === null) return undefined;
  const named =
    holder.childForFieldName('name') ??
    holder.childForFieldName('key') ??
    holder.childForFieldName('property');
  return HOLDERS.has(holder.type) ? named?.text : undefined;
}

function reassigns(fn: Node, name: string): boolean {
  return fn
    .descendantsOfType([
      'assignment_expression',
      'augmented_assignment_expression',
      'assignment',
      'update_expression',
    ])
    .some((node) => {
      if (node === null) return false;
      const target = node.childForFieldName('left') ?? node.children[0] ?? null;
      return target !== null && target.text === name;
    });
}

/**
 * The one SDK every declared helper forwards to, when that is proven.
 *
 * Callers of a custom helper are labelled `custom`, and a custom mechanism is
 * assumed to be locally configured — so a helper wrapping LaunchDarkly raised
 * "absent from configuration" on every flag read through it. When every declared
 * helper was found forwarding its parameter straight into the same SDK, those
 * callers are that SDK's calls and are attributed to it. Anything less — a helper
 * whose body was never seen, or helpers wrapping different SDKs — attributes
 * nothing, because which backend a given call reaches would then be a guess.
 */
export function wrappedProvider(
  customMethods: readonly string[],
  passThroughs: ReadonlyMap<string, ReadonlySet<Provider>>,
): Provider | undefined {
  if (customMethods.length === 0) return undefined;
  const providers = new Set<Provider>();
  for (const method of customMethods) {
    const wrapped = passThroughs.get(method);
    if (wrapped === undefined || wrapped.size === 0) return undefined;
    for (const provider of wrapped) providers.add(provider);
  }
  return providers.size === 1 ? [...providers][0] : undefined;
}
