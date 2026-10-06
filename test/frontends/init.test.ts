import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { readSettings, type DirectoryEntry, type FileSystem } from '../../src/core/api/index.js';
import { EXIT, run } from '../../src/frontends/cli/cli.js';
import { starterSettings } from '../../src/frontends/cli/init.js';
import { createSettingsFile } from '../../src/frontends/node/node-settings.js';

const LD = "import { init } from 'launchdarkly-node-server-sdk';\nconst client = init('k');\n";
const HELPER = `${LD}export function isOn(key: string) {\n  return client.variation(key, {}, false);\n}\n`;

/** A flat in-memory workspace that `createSettings` writes back into. */
function workspace(initial: Record<string, string>) {
  const files = { ...initial };
  const fs: FileSystem = {
    async readDirectory(path: string): Promise<DirectoryEntry[]> {
      const prefix = path.endsWith('/') ? path : `${path}/`;
      const entries = new Map<string, boolean>();
      for (const full of Object.keys(files)) {
        if (!full.startsWith(prefix)) continue;
        const rest = full.slice(prefix.length);
        const slash = rest.indexOf('/');
        entries.set(slash === -1 ? rest : rest.slice(0, slash), slash !== -1);
      }
      if (entries.size === 0) throw new Error(`ENOENT: ${path}`);
      return [...entries].map(([name, isDirectory]) => ({
        name,
        isDirectory,
        isFile: !isDirectory,
        isSymbolicLink: false,
      }));
    },
    async readFile(path: string): Promise<string> {
      const text = files[path];
      if (text === undefined) throw new Error(`ENOENT: ${path}`);
      return text;
    },
  };
  return { files, fs };
}

async function init(initial: Record<string, string>) {
  const { files, fs } = workspace(initial);
  const out: string[] = [];
  const err: string[] = [];
  let writes = 0;
  const code = await run(['init'], {
    fs,
    cwd: '/w',
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    createSettings: (root, text) => {
      writes += 1;
      files[`${root}/.flagmarshal.yml`] = text;
      return Promise.resolve();
    },
  });
  return { code, out: out.join('\n'), err: err.join('\n'), files, fs, writes };
}

describe('flag-marshal init', () => {
  it('declares a helper the scan found, in a file the settings reader accepts', async () => {
    const result = await init({ '/w/src/flags.ts': HELPER });
    expect(result.code).toBe(EXIT.OK);
    expect(result.out).toContain('Declared a flag helper: isOn.');

    const { settings, problems } = await readSettings(result.fs, '/w');
    expect(problems).toEqual([]);
    expect(settings.customMethods).toEqual(['isOn']);
    // Policy is offered, never switched on by a template.
    expect(settings.policy.requireOwner).toBe(false);
    expect(settings.policy.budget).toBe(0);
  });

  it('writes a fully commented file when there is no helper to declare', async () => {
    const result = await init({ '/w/src/a.ts': 'export const a = 1;\n' });
    expect(result.code).toBe(EXIT.OK);
    expect(result.out).not.toContain('Declared');
    const { settings, problems } = await readSettings(result.fs, '/w');
    expect(problems).toEqual([]);
    expect(settings.customMethods).toEqual([]);
  });

  it('never replaces an existing file', async () => {
    const result = await init({ '/w/.flagmarshal.yml': 'policy:\n  budget: 3\n' });
    expect(result.code).toBe(EXIT.USAGE);
    expect(result.err).toContain('already exists');
    expect(result.writes).toBe(0);
    expect(result.files['/w/.flagmarshal.yml']).toBe('policy:\n  budget: 3\n');
  });

  it.each([[['isOn']], [[]]])(
    'keeps every commented option valid once uncommented (helpers %j)',
    async (helpers: string[]) => {
      // A template whose examples fail validation teaches the wrong format.
      // Commented configuration is a `# key:` or an indented `#   key:`/`#   - item`;
      // prose comments never have a colon straight after their first word.
      const config = /^# ?(?:[A-Za-z]\w*:|\s+[\w-]+:|\s+- )/;
      const uncommented = starterSettings(helpers)
        .split('\n')
        .map((line) =>
          config.test(line) && !line.includes('//') ? line.replace(/^# ?/, '') : line,
        )
        .join('\n');
      const parsed = parse(uncommented) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toEqual(['customPatterns', 'flags', 'policy']);

      const { settings, problems } = await readSettings(
        workspace({ '/w/.flagmarshal.yml': uncommented }).fs,
        '/w',
      );
      expect(problems).toEqual([]);
      expect(settings.policy).toEqual({
        requireOwner: true,
        requireExpiry: true,
        maxAgeDays: 180,
        budget: 50,
        allowlist: ['example-kill-switch'],
      });
      expect(settings.flags['example-flag']).toEqual({
        owner: 'team-example',
        expiry: '2027-01-31',
      });
    },
  );

  it('contains no real flag key', () => {
    // Flag keys leak unreleased product names; the examples are invented.
    expect(starterSettings(['isOn'])).not.toMatch(/checkout|payments/);
  });
});

describe('the Node settings writer', () => {
  it('refuses to overwrite, even without a prior check', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flag-marshal-init-'));
    writeFileSync(join(dir, '.flagmarshal.yml'), 'keep: me\n');
    await expect(createSettingsFile(dir, 'replaced\n')).rejects.toThrow();
    expect(readFileSync(join(dir, '.flagmarshal.yml'), 'utf8')).toBe('keep: me\n');
  });
});
