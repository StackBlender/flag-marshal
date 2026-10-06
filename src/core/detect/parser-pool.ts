import { Parser, Language } from 'web-tree-sitter';
import type { GrammarSpec } from './languages.js';

/**
 * Loads and caches tree-sitter grammars.
 *
 * Grammar loading is expensive and the runtime must be initialized exactly once
 * per process, so both are memoized. This is the only place in the core that
 * touches the filesystem, and it reads only Flag Marshal's own bundled grammar
 * assets — never workspace content, which callers supply as text.
 */
let runtime: Promise<void> | undefined;
const languages = new Map<string, Promise<Language>>();

function initRuntime(): Promise<void> {
  runtime ??= Parser.init();
  return runtime;
}

/** The loaded grammar for `spec`, initializing the runtime on first use. */
export async function loadLanguage(spec: GrammarSpec): Promise<Language> {
  await initRuntime();
  let loading = languages.get(spec.wasmPath);
  if (loading === undefined) {
    loading = Language.load(spec.wasmPath);
    languages.set(spec.wasmPath, loading);
  }
  return loading;
}

/** A parser bound to `spec`'s grammar. Callers must `delete()` it when done. */
export async function createParser(spec: GrammarSpec): Promise<Parser> {
  const language = await loadLanguage(spec);
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}
