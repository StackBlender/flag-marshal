/**
 * Builds the VS Code extension from an explicit allowlist, mirroring
 * `assemble-npm-package.mjs`.
 *
 * The extension is a second distribution of the same engine, so it takes the same
 * `dist/`, `catalog/` and `schema/` the CLI takes, plus the runtime dependencies
 * — grammars are resolved from `node_modules` at load time, so they have to be
 * inside the extension rather than borrowed from the repository.
 *
 * Pass `--link` for development: instead of copying dependencies it symlinks the
 * repository's `node_modules`, which makes `code --extensionDevelopmentPath` pick
 * up a rebuild without a reinstall.
 */
import { build } from 'esbuild';
import { chmod, cp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'artifacts', 'vscode');
const link = process.argv.includes('--link');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const sourcePackage = await readJson(resolve(root, 'package.json'));
const template = await readJson(resolve(root, 'vscode-extension', 'package.template.json'));
const manifest = {
  ...template,
  version: sourcePackage.version,
  dependencies: sourcePackage.dependencies,
};

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const directory of ['dist', 'catalog', 'schema']) {
  await cp(resolve(root, directory), resolve(target, directory), { recursive: true });
}
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  await cp(resolve(root, file), resolve(target, file));
}
await cp(resolve(root, 'vscode-extension', 'README.md'), resolve(target, 'README.md'));
await writeFile(resolve(target, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

if (link) {
  await symlink(resolve(root, 'node_modules'), resolve(target, 'node_modules'), 'dir');
} else {
  // Only the runtime dependencies. Copying node_modules wholesale would drag the
  // entire toolchain into a marketplace upload.
  for (const name of Object.keys(manifest.dependencies)) {
    await cp(resolve(root, 'node_modules', name), resolve(target, 'node_modules', name), {
      recursive: true,
    });
  }
  await prune(resolve(target, 'node_modules'));
}

/**
 * Removes what the extension will never load.
 *
 * The grammar packages are built for every consumer at once: native prebuilds for
 * a dozen platforms, the original C sources, and a wasm file per language. Flag
 * Marshal reads four languages and loads them through WebAssembly, never native
 * bindings, so all of that is dead weight a user would download. It takes the
 * extension from roughly 73 MB to under 10.
 *
 * This is an allowlist on purpose. A new grammar added to `GRAMMARS` without a
 * matching entry here would be pruned out and fail to load, which is loud; the
 * inverse — silently shipping 60 MB again — is not.
 */
async function prune(modules) {
  const kept = new Set(
    ['java', 'javascript', 'typescript', 'tsx'].map((id) => `tree-sitter-${id}.wasm`),
  );
  // web-tree-sitter's own runtime lives here too and is not a grammar.
  const wasmDirectory = resolve(modules, '@vscode', 'tree-sitter-wasm', 'wasm');
  for (const entry of await readdir(wasmDirectory)) {
    if (!entry.startsWith('tree-sitter-') || !entry.endsWith('.wasm')) continue;
    if (kept.has(entry)) continue;
    await rm(resolve(wasmDirectory, entry), { force: true });
  }

  // Native prebuilds and C sources: this project loads WebAssembly only.
  const kotlin = resolve(modules, '@tree-sitter-grammars', 'tree-sitter-kotlin');
  for (const directory of ['prebuilds', 'src', 'bindings']) {
    await rm(resolve(kotlin, directory), { recursive: true, force: true });
  }
}

/**
 * The extension entry point is bundled to CommonJS, because the VS Code extension
 * host loads a main module with `require`. Everything else in this repository is
 * ESM, so this is the one place the two module systems meet.
 *
 * Two details make it work rather than nearly work:
 *
 * The bundle is written at the same depth as the source file it replaces
 * (`dist/frontends/vscode/`). Grammar and catalog paths are resolved relative to
 * the module doing the resolving, so flattening the output would silently point
 * `../../../catalog` at the wrong directory.
 *
 * `import.meta.url` does not exist in CommonJS, and esbuild would quietly replace
 * it with an empty object — taking the grammar loader's `createRequire` with it.
 * The banner reconstructs it from `__filename`.
 */
await build({
  entryPoints: [resolve(root, 'dist', 'frontends', 'vscode', 'extension.js')],
  outfile: resolve(target, 'dist', 'frontends', 'vscode', 'extension.cjs'),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  minify: true,
  // `vscode` is supplied by the host, never installed. The runtime dependencies
  // stay external so grammar `.wasm` files keep being resolved from node_modules
  // rather than inlined into a bundle that cannot load them.
  external: ['vscode', ...Object.keys(manifest.dependencies)],
  banner: {
    js: "const __import_meta_url = require('node:url').pathToFileURL(__filename).href;",
  },
  define: { 'import.meta.url': '__import_meta_url' },
});
await rm(resolve(target, 'dist', 'frontends', 'vscode', 'extension.js'), { force: true });

// The CLI ships in the same dist tree and stays executable, so the extension can
// hand a user a working `flag-marshal` without a second install.
await chmod(resolve(target, 'dist', 'frontends', 'cli', 'main.js'), 0o755);

console.log(
  `Assembled ${manifest.name}@${manifest.version} in ${target}${link ? ' (linked)' : ''}`,
);
