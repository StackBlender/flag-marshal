import { describe, expect, it } from 'vitest';
import {
  openWorkspace,
  type FlagValue,
  type RefactorPreview,
  type ScanReport,
} from '../../src/core/api/index.js';
import { previewResolution } from '../../src/core/refactor/preview.js';
import { memoryFs } from '../fakes/memory-fs.js';

const UNLEASH = "import { initialize } from 'unleash-client';\nconst u = initialize({});\n";
const LD = "import { init } from 'launchdarkly-node-server-sdk';\nconst c = init('');\n";

async function preview(
  files: Record<string, string>,
  value: FlagValue,
  key = 'k',
): Promise<RefactorPreview> {
  const prefixed = Object.fromEntries(Object.entries(files).map(([p, t]) => [`/w/${p}`, t]));
  return openWorkspace({ root: '/w', fs: memoryFs(prefixed) }).previewResolution(key, value);
}

/** The rewritten body of `a.ts`, without the shared import lines. */
async function body(source: string, value: FlagValue, header = UNLEASH): Promise<string> {
  const result = await preview({ 'a.ts': header + source }, value);
  expect(result.refusals).toEqual([]);
  expect(result.outcome).toBe('preview');
  return (result.files[0]?.after ?? '').slice(header.length);
}

describe('previewResolution: if statements', () => {
  const source = [
    'function f() {',
    "  if (u.isEnabled('k')) {",
    '    yes();',
    '    more();',
    '  } else {',
    '    no();',
    '  }',
    '  after();',
    '}',
    '',
  ].join('\n');

  it('keeps the branch the value selects, unwrapped and reindented', async () => {
    expect(await body(source, 'on')).toBe('function f() {\n  yes();\n  more();\n  after();\n}\n');
    expect(await body(source, 'off')).toBe('function f() {\n  no();\n  after();\n}\n');
  });

  it('removes the statement when there is no branch to keep', async () => {
    const lone = "function f() {\n  if (u.isEnabled('k')) {\n    yes();\n  }\n  after();\n}\n";
    expect(await body(lone, 'off')).toBe('function f() {\n  after();\n}\n');
  });

  it('follows await, parentheses and negation', async () => {
    const negated =
      "async function f() {\n  if (!(await c.variation('k', {}, false))) {\n    off();\n  } else on();\n}\n";
    expect(await body(negated, 'on', LD)).toBe('async function f() {\n  on();\n}\n');
    expect(await body(negated, 'off', LD)).toBe('async function f() {\n  off();\n}\n');
  });

  it('keeps the braces when the block declares something block-scoped', async () => {
    const scoped = "if (u.isEnabled('k')) {\n  const x = 1;\n  use(x);\n}\nconst x = 2;\n";
    expect(await body(scoped, 'on')).toBe('{\n  const x = 1;\n  use(x);\n}\nconst x = 2;\n');
  });

  it('leaves the inside of a multi-line template literal exactly as it was', async () => {
    const literal = "function f() {\n  if (u.isEnabled('k')) {\n    say(`one\n    two`);\n  }\n}\n";
    expect(await body(literal, 'on')).toBe('function f() {\n  say(`one\n    two`);\n}\n');
  });

  it('rewrites reads nested inside the branch it keeps', async () => {
    const nested = "if (u.isEnabled('k')) {\n  if (!u.isEnabled('k')) never();\n  always();\n}\n";
    const result = await preview({ 'a.ts': UNLEASH + nested }, 'on');
    expect(result.files[0]?.after.slice(UNLEASH.length)).toBe('always();\n');
    expect(result.files[0]?.sites).toBe(2);
  });

  it('keeps an else-if chain as the statement that replaces the if', async () => {
    const chain = "if (u.isEnabled('k')) {\n  a();\n} else if (other) {\n  b();\n}\n";
    expect(await body(chain, 'off')).toBe('if (other) {\n  b();\n}\n');
  });
});

describe('previewResolution: conditional expressions', () => {
  it('keeps the selected branch, parenthesized only where it could bind differently', async () => {
    expect(await body("const a = u.isEnabled('k') ? 'x' : y + 1;\n", 'on')).toBe(
      "const a = 'x';\n",
    );
    expect(await body("const a = u.isEnabled('k') ? 'x' : y + 1;\n", 'off')).toBe(
      'const a = y + 1;\n',
    );
    expect(await body("const a = 2 * (u.isEnabled('k') ? 3 : y + 1);\n", 'off')).toBe(
      'const a = 2 * (y + 1);\n',
    );
    expect(await body("const a = 2 + (u.isEnabled('k') ? 3 : 4) ;\n", 'off')).toBe(
      'const a = 2 + (4) ;\n',
    );
    expect(await body("const a = z || (u.isEnabled('k') ? 'é𝄞' : 'o');\n", 'on')).toBe(
      "const a = z || ('é𝄞');\n",
    );
    expect(await body("const a = () => u.isEnabled('k') ? { b: 1 } : 2;\n", 'on')).toBe(
      'const a = () => ({ b: 1 });\n',
    );
  });

  it('rewrites a bare call to a declared helper', async () => {
    const files = {
      '.flagmarshal.yml': 'customPatterns:\n  methods: [isOn]\n',
      'a.ts': "export const v = isOn('k') ? on() : off();\n",
    };
    const result = await preview(files, 'off');
    expect(result.files[0]?.after).toBe('export const v = off();\n');
  });
});

describe('previewResolution: const bindings', () => {
  it('substitutes a const holding the read into every condition, then removes it', async () => {
    const source = [
      'async function price(user) {',
      "  const modern = await c.variation('k', user, false);",
      '  if (!modern) {',
      '    log();',
      '  }',
      '  return modern ? 9 : 12;',
      '}',
      '',
    ].join('\n');
    expect(await body(source, 'on', LD)).toBe('async function price(user) {\n  return 9;\n}\n');
    expect(await body(source, 'off', LD)).toBe(
      'async function price(user) {\n  log();\n  return 12;\n}\n',
    );
  });

  it('follows a negated binding and uses inside closures', async () => {
    const source = "const off = !u.isEnabled('k');\nexport const f = () => (off ? 'a' : 'b');\n";
    expect(await body(source, 'on')).toBe("export const f = () => ('b');\n");
  });

  it('removes a binding nothing uses', async () => {
    expect(await body("const unused = u.isEnabled('k');\nnext();\n", 'on')).toBe('next();\n');
  });

  it('reproduces the fixture pattern that the first shape refused', async () => {
    const pricing = [
      'export async function priceFor(userKey: string): Promise<number> {',
      "  const modern = await c.variation('k', { key: userKey }, false);",
      '  return modern ? 9 : 12;',
      '}',
      '',
    ].join('\n');
    expect(await body(pricing, 'off', LD)).toBe(
      'export async function priceFor(userKey: string): Promise<number> {\n  return 12;\n}\n',
    );
  });

  it('refuses a binding whose value goes anywhere but a condition, at the use', async () => {
    const reasons = async (source: string): Promise<string[]> =>
      (await preview({ 'a.ts': UNLEASH + source }, 'on')).refusals.map(
        (r) => `${r.reason}@${(r.line ?? -1) + 1}`,
      );
    // Line 3 is the declaration; the blocking use is reported where it is.
    expect(await reasons("\nconst on = u.isEnabled('k');\nsend(on);\n")).toEqual([
      'unsupported-shape@5',
    ]);
    expect(await reasons("const on = u.isEnabled('k');\nreturn { on };\n")).toEqual([
      'unsupported-shape@4',
    ]);
    expect(
      await reasons("const on = u.isEnabled('k');\nfunction g(on) {\n  if (on) x();\n}\n"),
    ).toEqual(['unsupported-shape@4']);
    expect(await reasons("const a = u.isEnabled('k'), b = 2;\nif (a) x();\n")).toEqual([
      'unsupported-shape@3',
    ]);
    expect(await reasons("export const on = u.isEnabled('k');\n")).toEqual(['unsupported-shape@3']);
    expect(await reasons("const { on } = u.isEnabled('k');\n")).toEqual(['unsupported-shape@3']);
    // Deleting the declaration would join `x = y` to `(z)()`.
    expect(await reasons("x = y\nconst on = u.isEnabled('k');\n(z)();\n")).toEqual([
      'unsupported-shape@4',
    ]);
  });
});

describe('previewResolution: refusals', () => {
  const reasons = (r: RefactorPreview): string[] =>
    r.refusals.map((x) => `${x.reason}${x.line === undefined ? '' : `@${x.line + 1}`}`);

  it('refuses an unknown flag', async () => {
    const result = await preview(
      { 'a.ts': `${UNLEASH}if (u.isEnabled('k')) a();\n` },
      'on',
      'nope',
    );
    expect(result.outcome).toBe('refused');
    expect(reasons(result)).toEqual(['unknown-flag']);
  });

  it('names every read it cannot follow, and rewrites nothing', async () => {
    const source = [
      "if (u.isEnabled('k')) a();", // fine
      "let v = u.isEnabled('k');", // a binding that can be reassigned
      "if (u.isEnabled('k') && x) b();", // part of a larger condition
      "send(u.isEnabled('k'));", // an argument
      "for (;;) if (u.isEnabled('k')) c();", // braceless body
      "if (u.isEnabled('k')) d(); e();", // shares a line
      "u.isEnabled('k') ? f() : (g = 1);", // would need ( at statement start
      '',
    ].join('\n');
    const result = await preview({ 'a.ts': UNLEASH + source }, 'on');
    expect(result.outcome).toBe('refused');
    expect(result.files).toEqual([]);
    expect(reasons(result)).toEqual([
      'unsupported-shape@4',
      'unsupported-shape@5',
      'unsupported-shape@6',
      'unsupported-shape@7',
      'shares-lines@8',
      'unsupported-shape@9',
    ]);
  });

  it('refuses a rewrite that could join two statements into one', async () => {
    const joining = [
      ["x = y\nif (u.isEnabled('k')) {\n  (a || b).run();\n}\n", 'unwrapped branch starts with ('],
      ["x = y\nif (u.isEnabled('k')) {\n  a();\n}\n[1].map(f);\n", 'next statement starts with ['],
      ["x = y\nif (u.isEnabled('k')) a();\nelse `t`;\n", 'else branch is a template'],
    ];
    for (const [source, why] of joining) {
      const result = await preview({ 'a.ts': UNLEASH + (source ?? '') }, 'on');
      expect(reasons(result), why).toEqual(['unsupported-shape@4']);
    }
    // A terminated statement before the if, or a harmless follower, is fine.
    for (const source of [
      "x = y;\nif (u.isEnabled('k')) {\n  (a || b).run();\n}\n",
      "x = y\nif (u.isEnabled('k')) {\n  a();\n}\nb();\n",
    ]) {
      expect((await preview({ 'a.ts': UNLEASH + source }, 'on')).outcome).toBe('preview');
    }
  });

  it('refuses while any key in the repository is computed', async () => {
    const source = `if (u.isEnabled('k')) a();\nif (u.isEnabled(name)) b();\n`;
    const result = await preview({ 'a.ts': UNLEASH + source }, 'on');
    expect(reasons(result)).toEqual(['unresolved-keys']);
  });

  it('refuses while part of the repository is in a language it cannot read', async () => {
    const result = await preview(
      { 'a.ts': `${UNLEASH}if (u.isEnabled('k')) a();\n`, 'tool.py': 'print(1)\n' },
      'on',
    );
    expect(reasons(result)).toEqual(['unparsed-languages']);
  });

  it('refuses configuration, declarations and other languages', async () => {
    const report = {
      flags: [
        {
          key: 'k',
          references: [
            {
              kind: 'configuration',
              language: 'yaml',
              range: { file: 'c.yml', start: { line: 0 } },
            },
            {
              kind: 'production-code',
              language: 'java',
              range: { file: 'A.java', start: { line: 4 } },
            },
          ],
        },
      ],
      unresolvedReferences: [],
    } as unknown as ScanReport;
    const result = await previewResolution({
      report,
      unparsedLanguages: [],
      key: 'k',
      value: 'on',
      scanOptions: {},
      readFile: () => Promise.reject(new Error('not read')),
    });
    expect(reasons(result)).toEqual(['not-code@1', 'unsupported-language@5']);
  });

  it('shows the flag confidence beside a preview without gating on it', async () => {
    const result = await preview({ 'a.ts': `${UNLEASH}if (u.isEnabled('k')) a();\n` }, 'on');
    expect(result.outcome).toBe('preview');
    // No git history here, so staleness cannot be judged at all.
    expect(result.confidence).toBe('unknown');
  });
});
