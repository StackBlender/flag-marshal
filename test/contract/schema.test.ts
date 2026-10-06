import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { messageCatalog } from '../../src/core/api/index.js';

const ROOT = resolve(import.meta.dirname, '..', '..');

/** Only the parts of the schema these tests assert on. */
interface EnumDef {
  enum: string[];
}
interface ContractSchema {
  required: string[];
  properties: { schemaVersion: { const: string } };
  $defs: Record<string, EnumDef | undefined> & {
    PositionEncoding: EnumDef;
    FindingId: EnumDef;
  };
}
const schema = JSON.parse(
  readFileSync(resolve(ROOT, 'schema/v1/scan-report.schema.json'), 'utf8'),
) as ContractSchema;

describe('wire contract', () => {
  it('is a valid JSON Schema that ajv can compile', () => {
    const ajv = new Ajv2020({ strict: true, allowUnionTypes: true });
    expect(() => ajv.compile(schema)).not.toThrow();
  });

  it('pins a schemaVersion so consumers can reject unknown majors', () => {
    expect(schema.properties.schemaVersion.const).toBe('1.0');
  });

  it('requires an explicit position encoding', () => {
    expect(schema.required).toContain('positionEncoding');
    expect(schema.$defs.PositionEncoding.enum).toContain('utf-16');
  });

  it('every $ref resolves to a definition that exists', () => {
    const refs = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node === null || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string') refs.add(value);
        else walk(value);
      }
    };
    walk(schema);

    const missing = [...refs].filter((ref) => {
      const name = ref.replace('#/$defs/', '');
      return !Object.prototype.hasOwnProperty.call(schema.$defs, name);
    });
    expect(missing).toEqual([]);
  });

  it('defines no unreachable definition', () => {
    const used = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node === null || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string') used.add(value.replace('#/$defs/', ''));
        else walk(value);
      }
    };
    walk(schema);

    const orphans = Object.keys(schema.$defs).filter((name) => !used.has(name));
    expect(orphans, 'an unused $def is either dead or a forgotten wiring').toEqual([]);
  });
});

describe('message catalog', () => {
  const findingIds: string[] = schema.$defs.FindingId.enum;

  it('has an entry for every finding id in the schema', () => {
    const missing = findingIds.filter((id) => !(id in messageCatalog));
    expect(missing, 'a finding with no catalog entry renders as nothing').toEqual([]);
  });

  it('has no entry for an id the schema does not define', () => {
    const extra = Object.keys(messageCatalog).filter((id) => !findingIds.includes(id));
    expect(extra, 'a catalog entry for an unknown id is dead wording').toEqual([]);
  });

  it('gives every rule summary text that contains no placeholder', () => {
    // Rule descriptors describe the rule, not an instance, so there is nothing
    // to substitute into them. A `{count}` here would ship straight into a SARIF
    // report and a code-scanning UI.
    for (const [id, entry] of Object.entries(messageCatalog)) {
      expect(entry.rule, id).toBeTruthy();
      expect(entry.rule, `${id}.rule must not contain a placeholder`).not.toMatch(/\{\w+\}/);
    }
  });

  it('gives every entry a title, an explanation, and declared placeholders', () => {
    for (const [id, entry] of Object.entries(messageCatalog)) {
      expect(entry.title, id).toBeTruthy();
      expect(entry.explanation, id).toBeTruthy();
      expect(Array.isArray(entry.placeholders), id).toBe(true);
    }
  });

  it('declares every placeholder that its title actually uses', () => {
    for (const [id, entry] of Object.entries(messageCatalog)) {
      const used = [...entry.title.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const name of used) {
        expect(entry.placeholders, `${id} uses {${name}} without declaring it`).toContain(name);
      }
    }
  });

  it('never promises a flag is safe to delete', () => {
    // The credibility rule from docs/design.md section 5: local evidence cannot
    // prove a flag is unused in production, so no canned wording may claim it.
    for (const [id, entry] of Object.entries(messageCatalog)) {
      const text = `${entry.title} ${entry.explanation}`.toLowerCase();
      expect(text, `${id} must not promise safety`).not.toMatch(/safe to (delete|remove)/);
    }
  });
});

describe('schema directory', () => {
  it('contains exactly the v1 contract', () => {
    expect(readdirSync(resolve(ROOT, 'schema/v1'))).toEqual(['scan-report.schema.json']);
  });
});

describe('contract compatibility within version 1.0', () => {
  const required: string[] = schema.required;

  it('does not require a field added after 1.0 shipped', () => {
    // A report written by an earlier 1.0 build has no unsupportedProviders. Making
    // it required would retroactively invalidate those reports without the version
    // changing, which is exactly what a version is for.
    expect(required).not.toContain('unsupportedProviders');
  });

  it('still requires the fields 1.0 has always had', () => {
    for (const field of [
      'schemaVersion',
      'tool',
      'root',
      'positionEncoding',
      'flags',
      'unresolvedReferences',
      'findings',
    ]) {
      expect(required, field).toContain(field);
    }
  });

  it('states the pre-release policy, so a widened enum is a choice not an accident', () => {
    // `declaration` was added to ReferenceKind within 1.0. That is fine only
    // because nothing is published yet, and the contract says so out loud rather
    // than leaving a future reader to guess whether it was an oversight.
    const description: string = (schema as unknown as { description: string }).description;
    expect(description).toContain('PRE-RELEASE CONTRACT POLICY');
    expect(description).toContain('optional, never required');
    expect(description, 'the policy must name its own expiry').toContain('first release');
  });

  it('keeps declaration distinct from the usage kinds', () => {
    const kinds: string[] = schema.$defs['ReferenceKind']?.enum ?? [];
    expect(kinds).toContain('declaration');
    expect(kinds).toContain('production-code');
    expect(kinds).toContain('test-code');
  });
});
