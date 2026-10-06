import type { Language, Node } from 'web-tree-sitter';
import type { Provider } from '../api/generated/scan-report.js';

/**
 * A flag mechanism Flag Marshal can recognize.
 *
 * Adapters are the seam: adding a provider must not require changes to the
 * index, evidence, or scoring layers. An adapter contributes a tree-sitter query
 * per language and says which captured node holds the flag key.
 */
export interface ProviderAdapter {
  readonly id: Provider;
  /**
   * True when the captured key node is an identifier whose text is the key —
   * Togglz enum constants — rather than a string literal.
   */
  readonly keysAreIdentifiers?: boolean;
  /**
   * The tree-sitter query for `language`, or undefined when this provider has no
   * presence in that language. The query must capture the flag-key argument as
   * `@key`.
   */
  queryFor(language: Language, languageId: string): string | undefined;
}

/** A flag-key argument located by a provider query, before key extraction. */
export interface KeySite {
  readonly provider: Provider;
  readonly node: Node;
}
