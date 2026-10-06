/**
 * Source languages that commonly carry feature flags but which no wired grammar
 * parses yet.
 *
 * Seeing these during a walk is a limit on what the tool can honestly claim. If
 * a repository is half Python and only its TypeScript was read, "this flag is
 * configured but nothing references it" may simply mean the reference is in a
 * file that was never opened. Rules use this to cap confidence rather than
 * asserting something the scan could not have established.
 *
 * Entries here must be removed as grammars are wired up: Java and Kotlin left
 * this list in Milestone 6. A language listed both here and in `GRAMMARS` would
 * cap confidence for no reason.
 */
const UNPARSED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.py',
  '.go',
  '.rb',
  '.cs',
  '.php',
  '.rs',
  '.scala',
  '.swift',
]);

/** The extension of `path` when it names a flag-capable language we cannot read. */
export function unparsedLanguageOf(path: string): string | undefined {
  const dot = path.lastIndexOf('.');
  if (dot === -1) return undefined;
  const ext = path.slice(dot).toLowerCase();
  return UNPARSED_EXTENSIONS.has(ext) ? ext : undefined;
}
