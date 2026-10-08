import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RefactorPreview } from '../../src/core/api/index.js';
import { EXIT, run } from '../../src/frontends/cli/cli.js';
import { nodeFileSystem } from '../../src/frontends/node/index.js';
import { memoryFs } from '../fakes/memory-fs.js';

const UNLEASH = "import { initialize } from 'unleash-client';\nconst u = initialize({});\n";
const SOURCE = `${UNLEASH}export function f() {\n  if (u.isEnabled('new-nav')) {\n    modern();\n  } else {\n    legacy();\n  }\n}\n`;

async function capture(
  argv: readonly string[],
  files: Record<string, string> = { '/w/a.ts': SOURCE },
) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, {
    fs: memoryFs(files),
    cwd: '/w',
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('flag-marshal preview', () => {
  it('prints the diff with what it does and does not claim, and exits 0', async () => {
    const { code, out } = await capture(['preview', 'new-nav', '--on']);
    expect(code).toBe(EXIT.OK);
    expect(out).toContain(
      'Resolving new-nav to on rewrites 1 read in 1 file. Nothing was written.',
    );
    expect(out).toContain('it does not say the flag can be removed');
    expect(out).not.toMatch(/safe to (delete|remove)/i);
    expect(out).toContain("-  if (u.isEnabled('new-nav')) {");
    expect(out).toContain('+  modern();');
  });

  it('prints only the patch for --format=diff', async () => {
    const { out } = await capture(['preview', 'new-nav', '--off', '--format=diff']);
    expect(out.startsWith('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ ')).toBe(true);
  });

  it('emits the preview as JSON', async () => {
    const { out } = await capture(['preview', 'new-nav', '--off', '--json']);
    const result = JSON.parse(out) as RefactorPreview;
    expect(result).toMatchObject({
      key: 'new-nav',
      value: 'off',
      outcome: 'preview',
      refusals: [],
    });
    expect(result.files[0]?.after).toContain('  legacy();');
  });

  it('exits 3 on a refusal, naming the place and never echoing an unknown key', async () => {
    const blocked = await capture(['preview', 'new-nav', '--on'], {
      '/w/a.ts': `${UNLEASH}let v = u.isEnabled('new-nav');\n`,
    });
    expect(blocked.code).toBe(EXIT.REFUSED);
    expect(blocked.out).toContain('Cannot preview new-nav resolved to on exactly:');
    expect(blocked.out).toContain('a.ts:3  This read is not the whole condition');

    const unknown = await capture(['preview', 'secret-launch', '--on']);
    expect(unknown.code).toBe(EXIT.REFUSED);
    expect(unknown.out).toContain('Cannot preview that flag exactly:');
    expect(unknown.out).not.toContain('secret-launch');

    // With --format=diff the refusal goes to stderr, so nothing reaches git apply.
    const piped = await capture(['preview', 'secret-launch', '--on', '--format=diff']);
    expect(piped.out).toBe('');
    expect(piped.err).toContain('Cannot preview that flag exactly:');
  });

  it('rejects malformed invocations as usage errors', async () => {
    for (const argv of [
      ['preview'],
      ['preview', 'new-nav'],
      ['preview', 'new-nav', '--on', '--off'],
      ['preview', 'new-nav', '--on', '--format=sarif'],
      ['preview', 'new-nav', '--on', '--write'],
      ['preview', 'new-nav', '--on', '/w', 'extra'],
    ]) {
      expect((await capture(argv)).code, argv.join(' ')).toBe(EXIT.USAGE);
    }
  });
});

describe('flag-marshal preview against a real repository', () => {
  const made: string[] = [];
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('produces a patch git applies, giving exactly the previewed files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flag-marshal-preview-'));
    made.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/a.ts'), SOURCE);
    const other = `${UNLEASH}${'// padding\n'.repeat(30)}export const g = u.isEnabled('new-nav') ? 1 : 2;\nexport const h = !u.isEnabled('new-nav') ? 3 : 4;\n`;
    writeFileSync(join(dir, 'src/b.ts'), other);
    execFileSync('git', ['init', '-q'], { cwd: dir });

    const output: string[] = [];
    const json: string[] = [];
    const ctx = (sink: string[]) => ({
      fs: nodeFileSystem,
      cwd: dir,
      out: (line: string) => sink.push(line),
      err: () => undefined,
    });
    expect(await run(['preview', 'new-nav', '--on', '--format=diff'], ctx(output))).toBe(EXIT.OK);
    expect(await run(['preview', 'new-nav', '--on', '--json'], ctx(json))).toBe(EXIT.OK);

    execFileSync('git', ['apply', '-'], { cwd: dir, input: `${output.join('\n')}\n` });
    const preview = JSON.parse(json.join('\n')) as RefactorPreview;
    for (const file of preview.files) {
      expect(readFileSync(join(dir, file.path), 'utf8')).toBe(file.after);
    }
    expect(preview.files.map((f) => [f.path, f.sites])).toEqual([
      ['src/a.ts', 1],
      ['src/b.ts', 2],
    ]);
  });
});
