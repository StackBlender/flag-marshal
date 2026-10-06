import { createRequire } from 'node:module';
import type { FindingId } from './generated/scan-report.js';

/**
 * The message catalog is shipped as data, not compiled into the core.
 *
 * The core emits structured findings and never human-facing strings. All wording
 * lives in `catalog/messages.json`, so the CLI, VS Code, and IntelliJ render
 * identical text from one file. Without this, each frontend accumulates its own
 * copy of every message and they silently diverge.
 *
 * `test/contract/catalog.test.ts` fails if the catalog and the schema's FindingId
 * enum ever disagree in either direction.
 */
export interface MessageEntry {
  /**
   * Placeholder-free description of the rule itself, for contexts that describe
   * a rule rather than report an instance — a SARIF rule descriptor, a settings
   * UI, documentation. Never contains `{...}`.
   */
  readonly rule: string;
  /** One-line summary of one instance. `{key}`-style placeholders are filled by the frontend. */
  readonly title: string;
  /** Why this finding matters, in one or two sentences. */
  readonly explanation: string;
  /** Placeholder names this entry expects to be given. */
  readonly placeholders: readonly string[];
}

export type MessageCatalog = Readonly<Record<FindingId, MessageEntry>>;

interface CatalogFile {
  readonly version: string;
  readonly messages: MessageCatalog;
}

const require = createRequire(import.meta.url);
const file = require('../../../catalog/messages.json') as CatalogFile;

export const CATALOG_VERSION: string = file.version;

/** Wording for every finding id, keyed by id. */
export const messageCatalog: MessageCatalog = file.messages;
