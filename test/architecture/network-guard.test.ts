import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SRC_ROOT, importsOf, sourceFiles } from './source-scan.js';

/**
 * Flag Marshal performs zero network traffic: no source, flag keys,
 * configuration, findings, or repository metadata leave the machine.
 * This test fails the build if a network client is introduced into the core.
 *
 * See docs/design.md, section 9.
 */
describe('local-only guarantee', () => {
  const coreFiles = sourceFiles(join(SRC_ROOT, 'core'));

  const NETWORK_MODULES = new Set([
    'http',
    'https',
    'http2',
    'net',
    'tls',
    'dgram',
    'dns',
    'node:http',
    'node:https',
    'node:http2',
    'node:net',
    'node:tls',
    'node:dgram',
    'node:dns',
    'undici',
    'axios',
    'node-fetch',
    'got',
    'superagent',
    'ws',
  ]);

  it('core imports no network module', () => {
    const violations = coreFiles
      .flatMap(importsOf)
      .filter((ref) => NETWORK_MODULES.has(ref.specifier))
      .map((ref) => `${ref.from} -> ${ref.specifier}`);

    expect(violations, 'core must make zero network calls').toEqual([]);
  });

  it('core calls no global network API', () => {
    const GLOBALS = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon)\s*\(/;
    const violations = coreFiles.filter((file) => GLOBALS.test(readFileSync(file, 'utf8')));

    expect(violations, 'core must not use fetch or any global network API').toEqual([]);
  });
});
