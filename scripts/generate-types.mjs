/**
 * Generates TypeScript models from the wire contract.
 *
 * schema/v1/*.schema.json is the source of truth. Models are never hand-written,
 * so the CLI, the RPC server, the VS Code frontend, and the future Kotlin models
 * cannot drift from what the core actually emits.
 *
 * Output is committed so a plain `npm ci && npm run build` needs no generation
 * step. `test/contract/generated-types.test.ts` fails if the committed output is
 * stale.
 *
 * Usage: node scripts/generate-types.mjs [--check]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFromFile } from 'json-schema-to-typescript';
import prettier from 'prettier';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = resolve(root, 'schema/v1/scan-report.schema.json');
const OUTPUT = resolve(root, 'src/core/api/generated/scan-report.ts');

const BANNER = `/**
 * DO NOT EDIT BY HAND.
 *
 * Generated from schema/v1/scan-report.schema.json by scripts/generate-types.mjs.
 * Change the schema, then run \`npm run generate:types\`.
 */`;

export async function generate() {
  const compiled = await compileFromFile(SCHEMA, {
    bannerComment: BANNER,
    additionalProperties: false,
    enableConstEnums: false,
    style: { singleQuote: true, printWidth: 100, trailingComma: 'all' },
  });
  const config = await prettier.resolveConfig(OUTPUT);
  return prettier.format(compiled, { ...config, filepath: OUTPUT });
}

const check = process.argv.includes('--check');
const next = await generate();

if (check) {
  const current = await readFile(OUTPUT, 'utf8').catch(() => '');
  if (current !== next) {
    console.error('Generated types are stale. Run: npm run generate:types');
    process.exit(1);
  }
  console.log('Generated types are up to date.');
} else {
  await writeFile(OUTPUT, next, 'utf8');
  console.log(`Wrote ${OUTPUT}`);
}
