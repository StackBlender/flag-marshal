import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import type { Baseline } from '../../src/core/api/index.js';
import { EXIT, run, type Snapshot } from '../../src/frontends/cli/cli.js';
import { memoryFs } from '../fakes/memory-fs.js';

/**
 * The CI recipes are copied into real pipelines, so a recipe that stops working
 * fails someone else's build. These tests keep every YAML block parseable and
 * every Flag Marshal command in them valid for the CLI as it is now.
 */
const DOC = readFileSync(resolve(import.meta.dirname, '../../docs/ci.md'), 'utf8');

const blocks = [...DOC.matchAll(/```(\w+)\n([\s\S]*?)```/g)].map((m) => ({
  lang: m[1] ?? '',
  body: m[2] ?? '',
}));

/** Every `flag-marshal` invocation, with shell redirection and chaining cut off. */
const commands = blocks
  .filter((b) => b.lang === 'yaml' || b.lang === 'sh')
  .flatMap((b) => [...b.body.matchAll(/@stackblender\/flag-marshal(?:@[\w.]+)? ([^\n]+)/g)])
  .map((m) => (m[1] ?? '').split(/ (?:>>?|\||&&) /)[0]?.trim() ?? '');

describe('docs/ci.md', () => {
  it('has YAML and shell recipes to check', () => {
    expect(blocks.filter((b) => b.lang === 'yaml').length).toBeGreaterThanOrEqual(4);
    expect(commands.length).toBeGreaterThanOrEqual(6);
  });

  it('has YAML that parses', () => {
    for (const block of blocks.filter((b) => b.lang === 'yaml')) {
      const doc = parseDocument(block.body);
      expect(
        doc.errors.map((e) => e.message),
        block.body,
      ).toEqual([]);
    }
  });

  it('pins the published package by name', () => {
    const named = [...DOC.matchAll(/npx --yes (\S+)/g)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(0);
    expect(named.every((name) => name?.startsWith('@stackblender/flag-marshal@'))).toBe(true);
  });

  it('uses only commands and options the CLI accepts', async () => {
    for (const command of commands) {
      let stored: Baseline | undefined;
      const err: string[] = [];
      const code = await run(command.split(/\s+/), {
        fs: memoryFs({ '/w/src/a.ts': 'export const a = 1;\n' }),
        cwd: '/w',
        env: { GITHUB_BASE_REF: 'main' },
        out: () => undefined,
        err: (line) => err.push(line),
        snapshot: (): Promise<Snapshot> =>
          Promise.resolve({
            commit: 'abc',
            fs: memoryFs({ '/w/src/a.ts': '' }),
            close: () => undefined,
          }),
        baselines: {
          read: () => Promise.resolve(stored),
          write: (_root, baseline) => {
            stored = baseline;
            return Promise.resolve();
          },
        },
      });
      expect(code, `${command}\n${err.join('\n')}`).not.toBe(EXIT.USAGE);
    }
  });
});
