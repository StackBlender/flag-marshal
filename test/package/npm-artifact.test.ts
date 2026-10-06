import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const ARTIFACT = resolve(ROOT, 'artifacts', 'npm', 'package');
const packageJson = JSON.parse(readFileSync(resolve(ARTIFACT, 'package.json'), 'utf8')) as {
  version: string;
  private?: boolean;
  scripts?: object;
  devDependencies?: object;
  dependencies?: object;
  bin: Record<string, string>;
};
const sourcePackage = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
  version: string;
  dependencies: object;
};

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [relative(ARTIFACT, path)];
  });
}

describe('the public npm artifact', () => {
  it('contains only the explicit public surface', () => {
    const topLevel = readdirSync(ARTIFACT).sort();
    expect(topLevel).toEqual([
      'LICENSE',
      'README.md',
      'THIRD_PARTY_NOTICES.md',
      'catalog',
      'dist',
      'package.json',
      'schema',
    ]);

    const files = filesUnder(ARTIFACT);
    expect(files.some((file) => file.endsWith('.d.ts'))).toBe(false);
    expect(files.some((file) => file.endsWith('.map'))).toBe(false);

    // Editor frontends ship through their own marketplaces. An `npx` user should
    // not download a VS Code view model they have no way to run.
    expect(files.filter((file) => file.includes('frontends/vscode'))).toEqual([]);
    expect(
      files.some((file) => file.includes('frontends/cli')),
      'the CLI itself must still be there',
    ).toBe(true);
  });

  it('publishes runtime metadata without development metadata', () => {
    expect(packageJson.version).toBe(sourcePackage.version);
    expect(packageJson.dependencies).toEqual(sourcePackage.dependencies);
    expect(packageJson.private).toBeUndefined();
    expect(packageJson.scripts).toBeUndefined();
    expect(packageJson.devDependencies).toBeUndefined();
    expect(packageJson.bin).toEqual({
      'flag-marshal': './dist/frontends/cli/main.js',
      marshal: './dist/frontends/cli/main.js',
    });
  });

  it('uses a customer-facing README with no private-development links or promises', () => {
    const readme = readFileSync(resolve(ARTIFACT, 'README.md'), 'utf8');
    expect(readme).toContain('npx @stackblender/flag-marshal scan .');
    expect(readme).toContain('Analysis runs on your machine.');
    expect(readme).not.toMatch(/ROADMAP|AGENTS\.md|docs\/|Development|pre-release/i);
    // One free tool: nothing may suggest a tier or a paid feature.
    // Tier names are matched case-sensitively so an example owner like
    // `team-example` is not mistaken for one.
    expect(readme).not.toMatch(/\b(?:Team|Pro)\b/);
    expect(readme).not.toMatch(/GitHub Action|\bpaid\b|\bupgrade\b/i);
  });

  it('points every public link at the public source repository', () => {
    // The source and its issue tracker live in one public repository. The retired
    // support repository must never be linked: it no longer exists.
    const repository = 'https://github.com/StackBlender/flag-marshal';
    const manifest = packageJson as {
      repository?: { url?: string };
      homepage?: string;
      bugs?: { url?: string };
    };
    expect(manifest.repository?.url).toBe(`${repository}.git`);
    expect(manifest.homepage).toBe(`${repository}#readme`);
    expect(manifest.bugs?.url).toBe(`${repository}/issues`);

    const readme = readFileSync(resolve(ARTIFACT, 'README.md'), 'utf8');
    expect(readme).toContain(`${repository}/issues/new/choose`);
    expect(readme).toContain(`${repository}/security/advisories/new`);
    expect(readme).not.toContain('flag-marshal-support');
  });
});
