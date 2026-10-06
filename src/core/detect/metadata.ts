import type { FlagMetadata } from '../config/settings.js';
import { isIsoDate } from '../config/settings.js';

/**
 * Inline flag metadata, declared in a comment beside the flag.
 *
 *     // flag-marshal: checkout-v2 owner=team-checkout expiry=2026-12-01
 *
 * The flag key is named explicitly rather than inferred from proximity. Proximity
 * rules break the moment someone reformats a file or wraps a long call, and a
 * metadata system that silently detaches from its flag is worse than none.
 *
 * The directive is comment-syntax-agnostic on purpose: `//`, `#`, `--`, and block
 * comments all work, because only the text after `flag-marshal:` is read. Teams
 * disagree about manifest versus inline, and losing a customer over that would be
 * absurd, so both are supported and the manifest wins on conflict.
 */
const DIRECTIVE = /flag-marshal:\s*(\S+)((?:\s+\w+=\S+)*)/g;
const ATTRIBUTE = /(\w+)=(\S+)/g;

export interface InlineMetadata {
  readonly metadata: Record<string, FlagMetadata>;
  readonly problems: string[];
}

/** Reads every `flag-marshal:` directive in one file. */
export function readInlineMetadata(path: string, text: string): InlineMetadata {
  const metadata: Record<string, FlagMetadata> = {};
  const problems: string[] = [];

  // Cheap rejection: most files contain no directive at all.
  if (!text.includes('flag-marshal:')) return { metadata, problems };

  for (const match of text.matchAll(DIRECTIVE)) {
    const key = match[1];
    const rest = match[2] ?? '';
    if (key === undefined) continue;

    let owner: string | undefined;
    let expiry: string | undefined;

    for (const attribute of rest.matchAll(ATTRIBUTE)) {
      const name = attribute[1];
      const value = attribute[2];
      if (name === undefined || value === undefined) continue;

      if (name === 'owner') owner = value;
      else if (name === 'expiry') {
        if (isIsoDate(value)) expiry = value;
        else problems.push(`${path}: expiry for '${key}' must be YYYY-MM-DD, got '${value}'`);
      } else {
        problems.push(`${path}: unknown attribute '${name}' for '${key}'`);
      }
    }

    metadata[key] = {
      ...metadata[key],
      ...(owner === undefined ? {} : { owner }),
      ...(expiry === undefined ? {} : { expiry }),
    };
  }

  return { metadata, problems };
}
