import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * `vscode` exists only inside a running editor, so the extension host file
     * would otherwise be the one source file no test can load. The fake in
     * test/fakes records what the extension asked the editor to do.
     */
    alias: { vscode: resolve(import.meta.dirname, 'test/fakes/vscode.ts') },
    include: ['test/**/*.test.ts'],
    /**
     * Integration tests run inside a real VS Code via `npm run test:integration`,
     * not here: they use mocha's globals and the genuine `vscode` module, which
     * the alias above deliberately replaces.
     */
    exclude: ['test/integration/**'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});
