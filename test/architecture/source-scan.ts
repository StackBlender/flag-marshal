import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';

export const SRC_ROOT = resolve(import.meta.dirname, '..', '..', 'src');

/** Every .ts file under `dir`, as absolute paths. */
export function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.ts')) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out.sort();
}

export interface ImportRef {
  /** Path of the importing file, relative to src/, using forward slashes. */
  readonly from: string;
  /** The raw module specifier as written in the source. */
  readonly specifier: string;
  /**
   * For relative specifiers, the target path relative to src/ with the extension
   * stripped. Undefined for bare specifiers such as 'node:fs'.
   */
  readonly target: string | undefined;
}

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

/** Static and dynamic import specifiers found in `file`. */
export function importsOf(file: string): ImportRef[] {
  const source = readFileSync(file, 'utf8');
  const from = posix(relative(SRC_ROOT, file));
  const refs: ImportRef[] = [];

  for (const match of source.matchAll(SPECIFIER)) {
    const specifier = match[1];
    if (specifier === undefined) continue;
    const target = specifier.startsWith('.')
      ? posix(relative(SRC_ROOT, resolve(dirname(file), specifier))).replace(/\.(js|ts)$/, '')
      : undefined;
    refs.push({ from, specifier, target });
  }
  return refs;
}

function posix(p: string): string {
  return p.split(sep).join('/');
}
