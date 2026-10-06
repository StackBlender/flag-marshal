import type { Language } from '../api/generated/scan-report.js';

/**
 * Builds the tree-sitter query that finds "a call to one of these methods, with
 * its first argument captured as `@key`".
 *
 * Every SDK Flag Marshal supports has the same shape — the flag key is the first
 * argument to a named method — so the per-language work is expressed once here
 * rather than once per provider. Adding a provider is then a list of method
 * names, not a new query.
 */
export function methodCallQuery(
  language: Language,
  methods: readonly string[],
): string | undefined {
  if (methods.length === 0) return undefined;
  const alternation = methods.map((m) => `"${m}"`).join(' ');

  switch (language) {
    case 'typescript':
    case 'javascript':
      return `
        (call_expression
          function: (member_expression
            object: (_) @receiver
            property: (property_identifier) @method)
          arguments: (arguments . (_) @key)
          (#any-of? @method ${alternation}))
      `;

    case 'java':
      return `
        (method_invocation
          object: (_) @receiver
          name: (identifier) @method
          arguments: (argument_list . (_) @key)
          (#any-of? @method ${alternation}))
      `;

    case 'kotlin':
      return `
        (call_expression
          (navigation_expression (_) @receiver (identifier) @method)
          (value_arguments . (value_argument (_) @key))
          (#any-of? @method ${alternation}))
      `;

    default:
      return undefined;
  }
}

/**
 * A call with no receiver — `isOn('checkout-v2')` after `import { isOn }`.
 *
 * Only for user-declared helpers. A built-in SDK method called bare proves
 * nothing about which library it belongs to, which is why `methodCallQuery`
 * demands a receiver. A name the team listed under `customPatterns.methods` is
 * their own assertion, and a plain function is the most common shape a
 * TypeScript flag helper takes.
 */
export function bareCallQuery(language: Language, methods: readonly string[]): string | undefined {
  if (methods.length === 0) return undefined;
  const alternation = methods.map((m) => `"${m}"`).join(' ');

  switch (language) {
    case 'typescript':
    case 'javascript':
      return `
        (call_expression
          function: (identifier) @method
          arguments: (arguments . (_) @key)
          (#any-of? @method ${alternation}))
      `;

    case 'java':
      return `
        (method_invocation
          !object
          name: (identifier) @method
          arguments: (argument_list . (_) @key)
          (#any-of? @method ${alternation}))
      `;

    case 'kotlin':
      return `
        (call_expression
          (identifier) @method
          (value_arguments . (value_argument (_) @key))
          (#any-of? @method ${alternation}))
      `;

    default:
      return undefined;
  }
}

/**
 * Spring's `@ConditionalOnProperty`, which names its flag in an annotation rather
 * than a method call.
 *
 * Both supported forms are matched: `@ConditionalOnProperty(name = "features.x")`
 * and the shorthand `@ConditionalOnProperty("features.x")`. The `value` alias is
 * accepted alongside `name` because Spring treats them interchangeably.
 */
export function springConditionalQuery(language: Language): string | undefined {
  if (language !== 'java' && language !== 'kotlin') return undefined;

  if (language === 'java') {
    return `
      (annotation
        name: (identifier) @annotation
        arguments: (annotation_argument_list
          (element_value_pair
            key: (identifier) @param
            value: (_) @key))
        (#eq? @annotation "ConditionalOnProperty")
        (#any-of? @param "name" "value"))

      (annotation
        name: (identifier) @annotation
        arguments: (annotation_argument_list . (string_literal) @key)
        (#eq? @annotation "ConditionalOnProperty"))
    `;
  }

  // Kotlin wraps the annotation in a constructor_invocation, and a named
  // argument appears as `identifier` followed by its value inside value_argument.
  return `
    (annotation
      (constructor_invocation
        (user_type (identifier) @annotation)
        (value_arguments
          (value_argument (identifier) @param (_) @key)))
      (#eq? @annotation "ConditionalOnProperty")
      (#any-of? @param "name" "value"))

    (annotation
      (constructor_invocation
        (user_type (identifier) @annotation)
        (value_arguments . (value_argument (string_literal) @key)))
      (#eq? @annotation "ConditionalOnProperty"))
  `;
}

/**
 * Togglz, which names its flags as enum constants rather than string literals.
 *
 * A Togglz flag is declared once as a constant in an enum implementing `Feature`,
 * then read as `MyFeatures.NEW_CHECKOUT.isActive()` or
 * `manager.isActive(MyFeatures.NEW_CHECKOUT)`. The constant name *is* the key, so
 * no cross-file resolution is needed: the declaration supplies the inventory and
 * each usage supplies a reference.
 *
 * Both the declaration and the usage queries capture the enum name, and both are
 * filtered against the enums the discovery pass actually verified as Togglz. The
 * queries themselves cannot tell whether `implements Feature` means Togglz's
 * `Feature` or somebody's own interface of that name — only the file's imports
 * can, and discovery is where that is checked.
 *
 * `NamedFeature("some-flag")` is Togglz's escape hatch for code that does not use
 * an enum — custom feature managers and dynamically registered flags reach for it,
 * and its key is a plain literal. It needs no enum filter because there is no enum
 * involved; the Togglz import is what identifies it.
 *
 * The declaration query supplies the inventory. Usages are matched as plain member
 * access — `FeatureFlags.SOME_FLAG` — and filtered at runtime against the enums
 * actually discovered in the workspace, because usage files import the
 * application's enum rather than `org.togglz`. Matching `.isActive()` alone missed
 * every wrapper, and every call that passes the constant somewhere else.
 *
 * Missing this entirely is what produced a one-flag inventory for a repository
 * running nine.
 */
export function togglzQuery(language: Language): string | undefined {
  if (language !== 'java' && language !== 'kotlin') return undefined;

  if (language === 'java') {
    return `
      (enum_declaration
        name: (identifier) @enum
        interfaces: (super_interfaces (type_list (_) @iface))
        body: (enum_body (enum_constant name: (identifier) @key)))

      (field_access object: (identifier) @enum field: (identifier) @key)

      (object_creation_expression
        type: (type_identifier) @named
        arguments: (argument_list . (string_literal) @key)
        (#eq? @named "NamedFeature"))
    `;
  }

  // The enum must declare `: Feature`. Without that check every enum in a file
  // that happens to import Togglz would become a set of feature flags.
  return `
    (class_declaration
      (identifier) @enum
      (delegation_specifiers (delegation_specifier (user_type) @iface))
      (enum_class_body (enum_entry (identifier) @key)))

    (navigation_expression (identifier) @enum (identifier) @key)

    (call_expression
      (identifier) @named
      (value_arguments . (value_argument (string_literal) @key))
      (#eq? @named "NamedFeature"))
  `;
}
