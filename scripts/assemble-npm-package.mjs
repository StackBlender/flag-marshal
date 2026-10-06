/** Builds the public npm artifact from an explicit allowlist. */
import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'artifacts', 'npm', 'package');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const sourcePackage = await readJson(resolve(root, 'package.json'));
const template = await readJson(resolve(root, 'npm-package', 'package.template.json'));
const publicPackage = {
  ...template,
  version: sourcePackage.version,
  dependencies: sourcePackage.dependencies,
};

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const directory of ['dist', 'catalog', 'schema']) {
  await cp(resolve(root, directory), resolve(target, directory), { recursive: true });
}

// Editor frontends are distributed through their own marketplaces, never through
// the CLI tarball. Shipping them here would make every `npx` user download a
// VS Code view model they can never run.
for (const editorOnly of ['vscode']) {
  await rm(resolve(target, 'dist', 'frontends', editorOnly), { recursive: true, force: true });
}
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  await cp(resolve(root, file), resolve(target, file));
}
await cp(resolve(root, 'npm-package', 'README.md'), resolve(target, 'README.md'));
await writeFile(resolve(target, 'package.json'), `${JSON.stringify(publicPackage, null, 2)}\n`);
await chmod(resolve(target, 'dist', 'frontends', 'cli', 'main.js'), 0o755);

console.log(`Assembled ${publicPackage.name}@${publicPackage.version} in ${target}`);
