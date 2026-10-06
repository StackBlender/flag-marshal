import { beforeEach, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import * as vscode from '../fakes/vscode.js';
import { activate } from '../../src/frontends/vscode/extension.js';

const FIXTURES = resolve(import.meta.dirname, '..', '..', 'fixtures');

interface Tree {
  getChildren(node?: unknown): unknown[];
  getTreeItem(node: unknown): vscode.TreeItem;
}

/**
 * Drives the real extension host against a real fixture directory, with a fake
 * `vscode` aliased in. Everything decidable lives in `model.ts`; this covers what
 * does not — that a scan actually happens on activation, that diagnostics reach
 * the right URIs, that the tree is wired to a command that opens a file. Without
 * it, the one file that cannot run outside an editor is also the one file nothing
 * verifies.
 */
function context(): vscode.ExtensionContext {
  return { subscriptions: [] };
}

/** Activation kicks off a scan without awaiting it; this waits for it to land. */
async function activated(fixture: string): Promise<void> {
  vscode.reset([vscode.folder(resolve(FIXTURES, fixture), fixture)]);
  activate(context());
  await settle();
}

async function settle(): Promise<void> {
  // Grammar loading and a directory walk both go through the microtask queue and
  // real I/O. Poll rather than guess a duration.
  for (let attempt = 0; attempt < 200; attempt++) {
    if (vscode.recorded.diagnostics !== undefined && vscode.recorded.trees.size > 0) {
      const tree = vscode.recorded.trees.get('flagMarshal.inventory') as Tree | undefined;
      if (tree !== undefined && tree.getChildren().length > 0) return;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

const tree = (): Tree => {
  const found = vscode.recorded.trees.get('flagMarshal.inventory') as Tree | undefined;
  if (found === undefined) throw new Error('the extension registered no inventory tree');
  return found;
};

describe('the VS Code extension host', () => {
  beforeEach(() => {
    vscode.reset([]);
  });

  it('scans on activation and fills the inventory tree', async () => {
    await activated('ts-launchdarkly');

    const labels = tree()
      .getChildren()
      .map((node) => tree().getTreeItem(node).label);

    expect(labels).toContain('checkout-v2');
    expect(labels).toContain('express-shipping');
  });

  it('registers the commands its manifest contributes', async () => {
    await activated('ts-launchdarkly');

    expect([...vscode.recorded.commands.keys()].sort()).toEqual([
      'flagMarshal.reveal',
      'flagMarshal.scan',
      'flagMarshal.toggleSort',
    ]);
  });

  it('lists flags with debt first, and toggles to name order', async () => {
    await activated('java-togglz');
    const labels = () =>
      tree()
        .getChildren()
        .map((node) => tree().getTreeItem(node))
        // Flags expand to their references; notes do not.
        .filter((item) => item.collapsibleState !== vscode.TreeItemCollapsibleState.None)
        .map((item) => item.label);

    // LEGACY_EXPORT and RETIRED_BANNER are never read; NEW_CHECKOUT is.
    expect(labels()).toEqual(['LEGACY_EXPORT', 'RETIRED_BANNER', 'NEW_CHECKOUT']);
    const ranked = tree()
      .getChildren()
      .map((node) => tree().getTreeItem(node))
      .find((item) => item.label === 'LEGACY_EXPORT');
    expect(ranked?.description).toMatch(/^debt \d+ · /);
    expect(ranked?.tooltip).toContain('never read by code');

    const toggle = vscode.recorded.commands.get('flagMarshal.toggleSort') as () => void;
    toggle();
    expect(labels()).toEqual(['LEGACY_EXPORT', 'NEW_CHECKOUT', 'RETIRED_BANNER']);
  });

  it('opens the file when a reference is selected', async () => {
    await activated('ts-launchdarkly');

    const flagNode = tree()
      .getChildren()
      .find((node) => tree().getTreeItem(node).label === 'checkout-v2');
    const reference = tree().getChildren(flagNode)[0];
    const item = tree().getTreeItem(reference);

    expect(item.command?.command).toBe('flagMarshal.reveal');

    const reveal = vscode.recorded.commands.get('flagMarshal.reveal');
    await (reveal as (target: unknown) => Promise<void>)(item.command?.arguments?.[0]);

    const shown = vscode.recorded.shownDocuments[0];
    expect(shown?.uri.fsPath).toContain('ts-launchdarkly');
    expect(shown?.selection).toBeDefined();
  });

  it('states computed keys in the tree, above the flags', () => {
    // A user deciding whether this inventory is complete looks at the tree, not
    // at a log. Notes come first for the same reason: buried under the flags they
    // would say nothing.
    return activated('computed-keys').then(() => {
      const items = tree()
        .getChildren()
        .map((node) => tree().getTreeItem(node));
      const note = items.find((item) => item.iconPath?.id === 'warning');

      expect(note?.label).toBe('2 computed key(s)');
      expect(items.indexOf(note as vscode.TreeItem)).toBe(0);
      expect(items.length).toBeGreaterThan(1);
    });
  });

  it('reports a folder it cannot read instead of failing to activate', async () => {
    vscode.reset([vscode.folder(resolve(FIXTURES, 'does-not-exist'), 'missing')]);
    activate(context());
    await new Promise((r) => setTimeout(r, 300));

    // The walker tolerates an unreadable root, so this produces an empty
    // inventory rather than an error — the point is that activation survived and
    // the tree exists.
    expect(vscode.recorded.trees.has('flagMarshal.inventory')).toBe(true);
    expect(vscode.recorded.diagnostics).toBeDefined();
  });

  it('rescans when a document is saved', async () => {
    await activated('ts-launchdarkly');
    expect(vscode.recorded.savedDocumentListeners).toHaveLength(1);

    // Firing it twice in a row must not start two scans; the debounce collapses
    // a "save all" across twenty files into one.
    vscode.recorded.savedDocumentListeners[0]?.();
    vscode.recorded.savedDocumentListeners[0]?.();
    await settle();

    expect(tree().getChildren().length).toBeGreaterThan(0);
  });

  it('shows the evidence, not only the conclusion', async () => {
    // Reported by an external review against a live repository: model.ts built a
    // detailed hover and extension.ts passed only `message` to vscode.Diagnostic,
    // so every finding reached the user as a bare assertion. That is the one
    // thing this product cannot do — a claim a user cannot weigh is a claim they
    // cannot act on.
    await activated('java-spring-conditional');

    const rendered = [...(vscode.recorded.diagnostics?.entries.values() ?? [])].flat();
    expect(rendered.length).toBeGreaterThan(0);

    for (const diagnostic of rendered) {
      expect(diagnostic.message, 'a diagnostic with no evidence').toContain('Confidence:');
      expect(diagnostic.message.split('\n').length).toBeGreaterThan(1);
    }
  });

  it('publishes diagnostics under the workspace folder, not the report path', async () => {
    await activated('java-spring-conditional');

    const uris = [...(vscode.recorded.diagnostics?.entries.keys() ?? [])];
    for (const uri of uris) {
      expect(uri.startsWith(resolve(FIXTURES, 'java-spring-conditional'))).toBe(true);
    }
    expect(uris.length).toBeGreaterThan(0);
  });
});
