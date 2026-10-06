import { describe, expect, it } from 'vitest';
import { readSettings, SETTINGS_FILE, type FileSystem } from '../../src/core/api/index.js';

function fsWith(contents?: string): FileSystem {
  return {
    readDirectory: () => Promise.resolve([]),
    readFile: (path) =>
      contents !== undefined && path === `/w/${SETTINGS_FILE}`
        ? Promise.resolve(contents)
        : Promise.reject(new Error('ENOENT')),
  };
}

describe('settings', () => {
  it('defaults cleanly when no settings file exists', async () => {
    const { settings, problems } = await readSettings(fsWith(), '/w');
    expect(settings.customMethods).toEqual([]);
    expect(problems).toEqual([]);
  });

  it('reads custom helper methods', async () => {
    const { settings } = await readSettings(
      fsWith('customPatterns:\n  methods:\n    - isFeatureOn\n    - checkFlag\n'),
      '/w',
    );
    expect(settings.customMethods).toEqual(['checkFlag', 'isFeatureOn']);
  });

  it('deduplicates and sorts, so output does not depend on file order', async () => {
    const { settings } = await readSettings(
      fsWith('customPatterns:\n  methods: [b, a, b]\n'),
      '/w',
    );
    expect(settings.customMethods).toEqual(['a', 'b']);
  });

  it('reports malformed YAML instead of failing the scan', async () => {
    const { settings, problems } = await readSettings(fsWith('customPatterns:\n  - [oops\n'), '/w');
    expect(settings.customMethods).toEqual([]);
    expect(problems[0]).toContain('not valid YAML');
  });

  it('reports a wrongly-typed methods list', async () => {
    const { settings, problems } = await readSettings(
      fsWith('customPatterns:\n  methods: nope\n'),
      '/w',
    );
    expect(settings.customMethods).toEqual([]);
    expect(problems[0]).toContain('must be a list');
  });

  it('skips non-string entries but keeps the good ones', async () => {
    const { settings, problems } = await readSettings(
      fsWith('customPatterns:\n  methods: [good, 42]\n'),
      '/w',
    );
    expect(settings.customMethods).toEqual(['good']);
    expect(problems).toHaveLength(1);
  });
});
