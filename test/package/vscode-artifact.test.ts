import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const EXTENSION = resolve(ROOT, 'artifacts', 'vscode');
const BUNDLE = resolve(EXTENSION, 'dist', 'frontends', 'vscode', 'extension.cjs');

const manifest = () =>
  JSON.parse(readFileSync(resolve(EXTENSION, 'package.json'), 'utf8')) as Record<string, unknown>;

/**
 * The extension is the one artifact assembled by a different route than the npm
 * package: its entry point is bundled from ESM to CommonJS, because the VS Code
 * extension host loads a main module with `require`. That conversion has two ways
 * to fail silently, and both are checked here rather than discovered in a
 * Development Host window.
 *
 * `npm run check` assembles it, so these always run.
 */
describe('the assembled VS Code extension', () => {
  it('is assembled (run `npm run check` or `npm run extension:dev`)', () => {
    expect(existsSync(BUNDLE), `missing ${BUNDLE}`).toBe(true);
  });

  it('points its manifest at the bundle that exists', () => {
    // A `main` that names a file the assembly did not produce fails at activation
    // with a message that says nothing useful.
    const main = manifest().main as string;
    expect(existsSync(resolve(EXTENSION, main)), `main names ${main}`).toBe(true);
  });

  it('keeps import.meta out of a CommonJS bundle', () => {
    // esbuild replaces a surviving `import.meta` with an empty object rather than
    // failing, which would take the grammar loader's createRequire with it and
    // leave the extension unable to parse anything.
    const code = readFileSync(BUNDLE, 'utf8');
    expect(code).toContain('__import_meta_url');
    expect(code).not.toMatch(/\bimport\.meta\b/);
  });

  it('leaves the editor API and the grammars to be required at runtime', () => {
    const code = readFileSync(BUNDLE, 'utf8');
    // `vscode` is supplied by the host and cannot be bundled. The grammars must
    // stay external so their .wasm files are still resolved from node_modules.
    expect(code).toContain('require("vscode")');
    expect(code).toContain('web-tree-sitter');
  });

  it('ships the catalog and schema the engine reads at runtime', () => {
    for (const file of ['catalog/messages.json', 'schema', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
      expect(existsSync(resolve(EXTENSION, file)), `missing ${file}`).toBe(true);
    }
  });

  it('declares the commands its code registers', () => {
    // A command registered but not contributed is invisible; a command contributed
    // but not registered throws when a user runs it.
    const contributes = manifest().contributes as { commands: { command: string }[] };
    const declared = contributes.commands.map((entry) => entry.command).sort();
    const source = readFileSync(
      resolve(ROOT, 'src', 'frontends', 'vscode', 'extension.ts'),
      'utf8',
    );
    const registered = [...source.matchAll(/registerCommand\('([^']+)'/g)]
      .map((match) => match[1] as string)
      .sort();

    expect(declared).toEqual(registered);
  });

  it('takes its version from the source package', () => {
    const source = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(manifest().version).toBe(source.version);
  });
});
