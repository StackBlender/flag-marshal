import { describe, expect, it } from 'vitest';
import { scanSource } from '../../src/core/api/index.js';

/**
 * Real SDK usage imports the client and binds it to a name; detection requires
 * both. Kept to one line so line-number expectations stay readable.
 */
const PRELUDE = "import { init } from 'launchdarkly-node-server-sdk'; const client = init('');\n";

/** Scans one line of code, with the import that makes it a provider call. */
async function scanLine(code: string) {
  const refs = await scanSource({ path: 'src/a.ts', text: PRELUDE + code });
  return refs[0];
}

/**
 * The report declares `positionEncoding: "utf-16"`. tree-sitter's columns must
 * therefore be UTF-16 code units, not UTF-8 bytes — otherwise every range after
 * a multi-byte character would be silently wrong, which is exactly the
 * off-by-one class the design's range-encoding rule exists to prevent.
 *
 * These tests pin that empirically rather than trusting it.
 */
describe('position encoding', () => {
  it('counts a multi-byte character as one UTF-16 code unit', async () => {
    // 'é' is one UTF-16 code unit but two UTF-8 bytes.
    const code = "const s = 'é'; client.variation('after-accent', u, false);";
    const ref = await scanLine(code);

    expect(ref?.range.start.character).toBe(code.indexOf("'after-accent'"));
  });

  it('counts an astral character as two UTF-16 code units', async () => {
    // '🚀' is two UTF-16 code units (a surrogate pair) and four UTF-8 bytes.
    const code = "const s = '🚀'; client.variation('after-rocket', u, false);";
    const ref = await scanLine(code);

    expect(ref?.range.start.character).toBe(code.indexOf("'after-rocket'"));
  });

  it('reports zero-based lines and columns', async () => {
    const ref = await scanLine("client.variation('first-line', u, false);");
    // Line 1, because the import occupies line 0.
    expect(ref?.range.start).toEqual({ line: 1, character: 17 });
  });

  it('gives a range whose end follows its start', async () => {
    const ref = await scanLine("\n\n  client.variation('later', u, false);");
    expect(ref?.range.start.line).toBe(3);
    expect(ref?.range.end.line).toBe(3);
    expect(ref?.range.end.character).toBeGreaterThan(ref!.range.start.character);
  });
});
