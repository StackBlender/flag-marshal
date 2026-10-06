import { createRequire } from 'node:module';
import type { Language as LanguageId } from '../api/generated/scan-report.js';

/**
 * Language grammars are WebAssembly, never native bindings.
 *
 * Native tree-sitter bindings would require node-gyp builds or per-platform
 * prebuilds, and they cannot be embedded in the standalone executable the
 * IntelliJ frontend is meant to bundle. WASM is portable and embeddable, which
 * keeps the distribution plan in `docs/design.md` intact.
 */
export interface GrammarSpec {
  readonly id: LanguageId;
  /** Absolute path to the compiled grammar. */
  readonly wasmPath: string;
  /** File extensions this grammar claims, lowercase and dot-prefixed. */
  readonly extensions: readonly string[];
}

const require = createRequire(import.meta.url);

const grammar = (name: string): string =>
  require.resolve(`@vscode/tree-sitter-wasm/wasm/tree-sitter-${name}.wasm`);

/**
 * Kotlin comes from a different package because `@vscode/tree-sitter-wasm` ships
 * no Kotlin grammar. Both are built against the same tree-sitter ABI (14), which
 * was verified before adopting it.
 */
const kotlinGrammar = (): string =>
  require.resolve('@tree-sitter-grammars/tree-sitter-kotlin/tree-sitter-kotlin.wasm');

/**
 * Grammars wired up so far. Adding a language must not require changes to the
 * index, evidence, or scoring layers — only an entry here and, if the language
 * writes string literals differently, a case in `extract-key.ts`.
 */
export const GRAMMARS: readonly GrammarSpec[] = [
  { id: 'typescript', wasmPath: grammar('typescript'), extensions: ['.ts', '.mts', '.cts'] },
  { id: 'javascript', wasmPath: grammar('javascript'), extensions: ['.js', '.mjs', '.cjs'] },
  { id: 'java', wasmPath: grammar('java'), extensions: ['.java'] },
  { id: 'kotlin', wasmPath: kotlinGrammar(), extensions: ['.kt', '.kts'] },
];

const byExtension = new Map<string, GrammarSpec>();
for (const spec of GRAMMARS) {
  for (const ext of spec.extensions) byExtension.set(ext, spec);
}

/** The grammar claiming `path`, or undefined when no wired grammar handles it. */
export function grammarFor(path: string): GrammarSpec | undefined {
  const dot = path.lastIndexOf('.');
  if (dot === -1) return undefined;
  return byExtension.get(path.slice(dot).toLowerCase());
}
