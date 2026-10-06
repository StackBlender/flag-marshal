/**
 * Minifies the published build, in place, file by file.
 *
 * Deliberately **not** a bundle. The runtime resolves two paths relatively —
 * `catalog/messages.json` from `dist/core/api/`, and the tree-sitter grammar
 * `.wasm` files through `createRequire` — and collapsing the module graph would
 * break both in ways no unit test would catch, because unit tests run against
 * `src`. Per-file minification keeps the module structure and every relative
 * path exactly as the compiler emitted them.
 *
 * This is not protection. Minified JavaScript is inconvenient to read, not
 * secret, and `docs/design.md` section 7 is explicit that licensing here is not
 * copy protection. What it does buy is that the implementation is no longer
 * casually skimmable from `node_modules`.
 *
 * Usage: node scripts/minify-dist.mjs
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

async function* javascriptFiles(directory) {
  for (const entry of await readdir(directory)) {
    const full = join(directory, entry);
    if ((await stat(full)).isDirectory()) yield* javascriptFiles(full);
    else if (entry.endsWith('.js')) yield full;
  }
}

let before = 0;
let after = 0;
let count = 0;

for await (const file of javascriptFiles(DIST)) {
  const source = await readFile(file, 'utf8');
  const result = await transform(source, {
    minify: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    // esbuild preserves an existing shebang itself; adding one as a banner
    // produced two, with the real one no longer on the first line.
  });

  before += source.length;
  after += result.code.length;
  count += 1;
  await writeFile(file, result.code, 'utf8');
}

const saved = before === 0 ? 0 : Math.round((1 - after / before) * 100);
console.log(
  `Minified ${count} files: ${(before / 1024).toFixed(0)}kB -> ${(after / 1024).toFixed(0)}kB (${saved}% smaller)`,
);
