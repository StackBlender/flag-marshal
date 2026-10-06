/// <reference types="mocha" />
/**
 * Integration tests: the real extension, inside a real VS Code.
 *
 * `test/frontends/vscode-extension.test.ts` runs `activate` against a fake
 * `vscode` module, which proves the wiring but cannot prove the extension is
 * loadable — the manifest could name a missing file, the CommonJS bundle could
 * fail to require, an API could have been used incorrectly in a way that only the
 * real implementation rejects. These download VS Code, install the assembled
 * extension into it, and drive the editor.
 *
 * They are deliberately few. Anything decidable belongs in `model.ts` and is
 * covered by the ordinary suite, which runs in seconds and needs no editor. What
 * is here is what only a real host can answer.
 *
 * Run with `npm run test:integration`. Not part of `npm run check`: it needs a
 * network download and a display.
 */

import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'stackblender.flag-marshal';

/** The workspace `.vscode-test.mjs` opens. */
function workspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'the test runner opened no workspace folder');
  return folder.uri.fsPath;
}

async function extension(): Promise<vscode.Extension<unknown>> {
  const found = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(found, `${EXTENSION_ID} is not installed in this VS Code`);
  if (!found.isActive) await found.activate();
  return found;
}

/**
 * Polls until the condition holds.
 *
 * Activation starts a scan it does not await, and grammar loading plus a
 * directory walk are real I/O. A fixed sleep would either be flaky or slow, and
 * on a cold VS Code download the first activation is much slower than later ones.
 */
async function eventually<T>(
  describeIt: string,
  produce: () => T | undefined | Promise<T | undefined>,
  timeoutMs = 30_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await produce();
      if (value !== undefined && !(Array.isArray(value) && value.length === 0)) return value;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(
    `timed out waiting for ${describeIt}${last === undefined ? '' : `: ${String(last)}`}`,
  );
}

suite('Flag Marshal in a real VS Code', () => {
  test('activates', async () => {
    const found = await extension();
    assert.equal(found.isActive, true);
  });

  test('contributes the commands it registers', async () => {
    await extension();
    const commands = await vscode.commands.getCommands(true);

    // Registered but not contributed is invisible to a user; contributed but not
    // registered throws when they run it. Only a real host proves both happened.
    assert.ok(commands.includes('flagMarshal.scan'), 'flagMarshal.scan is not registered');
    assert.ok(commands.includes('flagMarshal.reveal'), 'flagMarshal.reveal is not registered');
  });

  test('publishes diagnostics for the open workspace', async () => {
    await extension();

    const diagnostics = await eventually('diagnostics to appear', () => {
      const all = vscode.languages
        .getDiagnostics()
        .filter(([, items]) => items.some((item) => item.source === 'Flag Marshal'));
      return all.length > 0 ? all : undefined;
    });

    const [uri, items] = diagnostics[0] as [vscode.Uri, vscode.Diagnostic[]];
    assert.ok(
      uri.fsPath.startsWith(workspaceRoot()),
      `${uri.fsPath} is outside the workspace folder`,
    );

    const ours = items.find((item) => item.source === 'Flag Marshal');
    assert.ok(ours, 'no Flag Marshal diagnostic');
    assert.ok(typeof ours.code === 'string' && ours.code.startsWith('flag.'), 'missing finding id');
    assert.doesNotMatch(
      ours.message,
      /\{[a-zA-Z]+\}/,
      'an unfilled catalog placeholder reached a user',
    );
  });

  test('rescans on demand without throwing', async () => {
    await extension();
    // The command is the user's escape hatch when the debounce has not fired. If
    // it rejects, the only symptom in normal use is a notification nobody reads.
    await vscode.commands.executeCommand('flagMarshal.scan');
  });

  test('opens the file a reference points at', async () => {
    await extension();

    const target = await eventually('a diagnostic to reveal', () => {
      const entry = vscode.languages
        .getDiagnostics()
        .find(([, items]) => items.some((item) => item.source === 'Flag Marshal'));
      return entry;
    });

    const [uri, items] = target as [vscode.Uri, vscode.Diagnostic[]];
    const first = items[0];
    assert.ok(first);

    await vscode.commands.executeCommand('flagMarshal.reveal', { uri, range: rangeOf(first) });
    const editor = await eventually('an editor to open', () => vscode.window.activeTextEditor);

    assert.equal(editor.document.uri.fsPath, uri.fsPath);
  });

  test('rescans after a save', async () => {
    await extension();
    const root = workspaceRoot();

    // Touching a file the walker reads must produce a fresh scan. Saving without
    // editing is enough: the extension listens for the save, not for a change.
    const file = await eventually('a source file to save', async () => {
      const found = await vscode.workspace.findFiles('**/*.{ts,js,java,kt}', undefined, 1);
      return found.length > 0 ? found[0] : undefined;
    });

    assert.ok(file.fsPath.startsWith(root));
    const document = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(document);
    await document.save();

    // The debounce is 750ms; give it room and assert the extension is still
    // serving diagnostics rather than having fallen over on the second pass.
    await eventually('diagnostics after the save', () => {
      const all = vscode.languages
        .getDiagnostics()
        .filter(([, items]) => items.some((item) => item.source === 'Flag Marshal'));
      return all.length > 0 ? all : undefined;
    });
  });

  test('ships the flag inventory view in the manifest', async () => {
    const found = await extension();
    const contributes = found.packageJSON.contributes as {
      views: { explorer: { id: string }[] };
    };

    // A view whose id does not match the one the code registers renders as
    // "There is no data provider registered", which looks like a broken scan.
    assert.ok(
      contributes.views.explorer.some((view) => view.id === 'flagMarshal.inventory'),
      'the inventory view is not contributed',
    );
  });

  test('reads the workspace it was pointed at', () => {
    assert.equal(path.basename(workspaceRoot()), 'java-spring-conditional');
  });
});

function rangeOf(diagnostic: vscode.Diagnostic): {
  start: { line: number; character: number };
  end: { line: number; character: number };
} {
  const { start, end } = diagnostic.range;
  return {
    start: { line: start.line, character: start.character },
    end: { line: end.line, character: end.character },
  };
}
