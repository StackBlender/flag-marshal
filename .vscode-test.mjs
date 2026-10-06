import { defineConfig } from '@vscode/test-cli';

/**
 * Runs the assembled extension inside a real VS Code.
 *
 * `extensionDevelopmentPath` points at `artifacts/vscode`, the same directory
 * `npm run package:vscode` produces, so these tests exercise the artifact a user
 * would install rather than the source tree. Build it first with
 * `npm run extension:dev`.
 */
export default defineConfig({
  label: 'integration',
  files: 'artifacts/vscode-test/**/*.test.cjs',
  extensionDevelopmentPath: './artifacts/vscode',
  // java-spring-conditional is the fixture that produces both flags and a
  // finding, so diagnostics and the inventory are both exercised. A fixture with
  // a clean bill of health would let a broken diagnostic path pass silently.
  workspaceFolder: './fixtures/java-spring-conditional',
  launchArgs: ['--disable-extensions', '--disable-gpu'],
  mocha: {
    ui: 'tdd',
    // A cold run downloads VS Code and loads four tree-sitter grammars.
    timeout: 60_000,
  },
});
