/**
 * The VS Code extension host.
 *
 * This is the only file in the repository that imports `vscode`, and it is
 * deliberately the dullest: it translates the records `model.ts` produces into
 * `vscode.Diagnostic` and tree items, and arranges when a scan happens. Every
 * decision worth arguing about — which finding lands where, what it says, how a
 * flag is described — lives in `model.ts` and `src/present`, where the ordinary
 * test suite can reach it. Judgement that creeps in here is judgement nothing in
 * `npm run check` can verify.
 */

import * as vscode from 'vscode';
import type { Finding, ScanReport, SourceRange } from '../../core/api/index.js';
import { shouldAutoRescan, toDiagnostics, toInventory, type EditorSeverity } from './model.js';
import { arrangeFlags, type FlagOrder } from './model.js';
import type { Inventory, InventoryFlag, InventoryReference } from './model.js';
import { scanWorkspace } from './workspace-scan.js';

const SOURCE = 'Flag Marshal';

/** Rescan is debounced: a "save all" across twenty files is one scan, not twenty. */
const RESCAN_DEBOUNCE_MS = 750;

/**
 * The parameter is narrowed to what is actually used. VS Code passes a full
 * `ExtensionContext`, which is structurally compatible; declaring the whole thing
 * would force every test to build fifteen properties this file never reads.
 */
type ActivationContext = Pick<vscode.ExtensionContext, 'subscriptions'>;

export function activate(context: ActivationContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('flag-marshal');
  const output = vscode.window.createOutputChannel(SOURCE);
  const inventory = new InventoryProvider();

  context.subscriptions.push(
    diagnostics,
    output,
    vscode.window.registerTreeDataProvider('flagMarshal.inventory', inventory),
  );

  let pending: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let queued = false;
  let lastScanMs: number | undefined;
  let saidItIsTooSlow = false;

  const scanNow = async (): Promise<void> => {
    // A scan already in flight means the one we would start now is stale before
    // it finishes. Remember that another is wanted and run it once this returns,
    // rather than piling concurrent scans onto one workspace.
    if (running) {
      queued = true;
      return;
    }
    running = true;
    const started = Date.now();
    try {
      await scanAll(diagnostics, inventory, output);
    } finally {
      lastScanMs = Date.now() - started;
      running = false;
      if (queued) {
        queued = false;
        void scanNow();
      }
    }
  };

  const scanSoon = (): void => {
    // A workspace this tool cannot scan quickly does not get scanned on every
    // save. Saying so once is the difference between a considered limit and an
    // editor that mysteriously stutters.
    if (!shouldAutoRescan(lastScanMs)) {
      if (!saidItIsTooSlow) {
        saidItIsTooSlow = true;
        output.appendLine(
          `Scanning this workspace took ${formatSeconds(lastScanMs)}, so rescanning on save is off. ` +
            'Run "Flag Marshal: Scan workspace for feature flags" when you want a fresh result.',
        );
      }
      return;
    }
    if (pending !== undefined) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = undefined;
      void scanNow();
    }, RESCAN_DEBOUNCE_MS);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('flagMarshal.scan', () => scanNow()),
    vscode.commands.registerCommand('flagMarshal.reveal', (target: RevealTarget) => reveal(target)),
    vscode.commands.registerCommand('flagMarshal.toggleSort', () => inventory.toggleOrder()),
    vscode.workspace.onDidSaveTextDocument(scanSoon),
    vscode.workspace.onDidChangeWorkspaceFolders(scanSoon),
    new vscode.Disposable(() => {
      if (pending !== undefined) clearTimeout(pending);
    }),
  );

  void scanNow();
}

export function deactivate(): void {
  // Every disposable is registered on the context, which VS Code disposes itself.
}

async function scanAll(
  diagnostics: vscode.DiagnosticCollection,
  inventory: InventoryProvider,
  output: vscode.OutputChannel,
): Promise<void> {
  diagnostics.clear();
  const folders = vscode.workspace.workspaceFolders ?? [];
  const inventories: { folder: vscode.WorkspaceFolder; inventory: Inventory }[] = [];

  for (const folder of folders) {
    const outcome = await scanWorkspace({ root: folder.uri.fsPath });

    if (outcome.error !== undefined || outcome.report === undefined) {
      output.appendLine(`${folder.name}: scan failed — ${outcome.error ?? 'no report'}`);
      continue;
    }

    publish(diagnostics, folder, outcome.report, output);
    inventories.push({ folder, inventory: toInventory(outcome.report) });
  }

  inventory.replace(inventories);
}

function publish(
  collection: vscode.DiagnosticCollection,
  folder: vscode.WorkspaceFolder,
  report: ScanReport,
  output: vscode.OutputChannel,
): void {
  const { byFile, workspace } = toDiagnostics(report);

  for (const [file, items] of byFile) {
    // Report paths are workspace-relative with forward slashes on every platform,
    // which is exactly what joinPath expects.
    const uri = vscode.Uri.joinPath(folder.uri, ...file.split('/'));
    collection.set(
      uri,
      items.map((item) => {
        // The evidence goes in the message because `Diagnostic` has no second
        // field that VS Code is guaranteed to show: `relatedInformation` needs a
        // location and is collapsed by default, and there is no detail property
        // at all. A user reading a hover must see why the claim was made, so the
        // conclusion is the first line and the evidence follows it.
        const diagnostic = new vscode.Diagnostic(
          toRange(item.range),
          `${item.message}\n${item.detail}`,
          toSeverity(item.severity),
        );
        diagnostic.source = SOURCE;
        diagnostic.code = item.code;
        return diagnostic;
      }),
    );
  }

  // A budget breach has no file to be underlined in. It is also the finding a
  // team explicitly agreed to enforce, so it goes somewhere a person will see it
  // rather than being dropped.
  for (const item of workspace) {
    output.appendLine(`${folder.name}: ${item.message}`);
    for (const line of item.detail.split('\n')) output.appendLine(`  ${line}`);
  }
}

function formatSeconds(ms: number | undefined): string {
  return ms === undefined ? 'too long' : `${(ms / 1000).toFixed(1)}s`;
}

function toRange(range: SourceRange): vscode.Range {
  return new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  );
}

const SEVERITIES: Record<EditorSeverity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

function toSeverity(severity: EditorSeverity): vscode.DiagnosticSeverity {
  return SEVERITIES[severity];
}

interface RevealTarget {
  readonly uri: vscode.Uri;
  readonly range: SourceRange;
}

async function reveal(target: RevealTarget): Promise<void> {
  const document = await vscode.workspace.openTextDocument(target.uri);
  const range = toRange(target.range);
  await vscode.window.showTextDocument(document, { selection: range });
}

/**
 * The flag inventory tree.
 *
 * Two levels when one folder is open (flag, then its references) and three when
 * several are (folder first), because a flat list across folders would show the
 * same key twice with no way to tell which repository it came from.
 */
type Node =
  | {
      readonly kind: 'folder';
      readonly folder: vscode.WorkspaceFolder;
      readonly inventory: Inventory;
    }
  | { readonly kind: 'flag'; readonly folder: vscode.WorkspaceFolder; readonly flag: InventoryFlag }
  | {
      readonly kind: 'reference';
      readonly folder: vscode.WorkspaceFolder;
      readonly reference: InventoryReference;
    }
  | { readonly kind: 'note'; readonly label: string; readonly description: string };

class InventoryProvider implements vscode.TreeDataProvider<Node> {
  private entries: { folder: vscode.WorkspaceFolder; inventory: Inventory }[] = [];
  private order: FlagOrder = 'debt';
  private readonly changed = new vscode.EventEmitter<undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  replace(entries: { folder: vscode.WorkspaceFolder; inventory: Inventory }[]): void {
    this.entries = entries;
    this.changed.fire(undefined);
  }

  toggleOrder(): void {
    this.order = this.order === 'debt' ? 'name' : 'debt';
    this.changed.fire(undefined);
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const { Collapsed, Expanded, None } = vscode.TreeItemCollapsibleState;

    switch (node.kind) {
      case 'folder': {
        const item = new vscode.TreeItem(node.folder.name, Expanded);
        item.description = `${node.inventory.flags.length} flags`;
        return item;
      }
      case 'flag': {
        const item = new vscode.TreeItem(node.flag.label, Collapsed);
        item.description = node.flag.description;
        item.tooltip = node.flag.tooltip;
        item.iconPath = new vscode.ThemeIcon(iconFor(node.flag));
        return item;
      }
      case 'reference': {
        const item = new vscode.TreeItem(node.reference.label, None);
        item.description = node.reference.kind;
        item.command = {
          command: 'flagMarshal.reveal',
          title: 'Go to reference',
          arguments: [
            {
              uri: vscode.Uri.joinPath(node.folder.uri, ...node.reference.range.file.split('/')),
              range: node.reference.range,
            } satisfies RevealTarget,
          ],
        };
        return item;
      }
      case 'note': {
        const item = new vscode.TreeItem(node.label, None);
        item.description = node.description;
        item.iconPath = new vscode.ThemeIcon('warning');
        return item;
      }
    }
  }

  getChildren(node?: Node): Node[] {
    if (node === undefined) {
      if (this.entries.length === 1) {
        const only = this.entries[0];
        return only === undefined ? [] : this.childrenOf(only.folder, only.inventory);
      }
      return this.entries.map((entry) => ({ kind: 'folder', ...entry }));
    }

    switch (node.kind) {
      case 'folder':
        return this.childrenOf(node.folder, node.inventory);
      case 'flag':
        return node.flag.references.map((reference) => ({
          kind: 'reference',
          folder: node.folder,
          reference,
        }));
      default:
        return [];
    }
  }

  private childrenOf(folder: vscode.WorkspaceFolder, inventory: Inventory): Node[] {
    const flags: Node[] = arrangeFlags(inventory.flags, this.order).map((flag) => ({
      kind: 'flag',
      folder,
      flag,
    }));

    // Stated in the tree, not only in a log. An inventory that silently omits a
    // whole flag platform is a confident wrong answer, and this is the one place
    // a user looks to decide whether the list in front of them is complete.
    const notes: Node[] = inventory.unsupported.map((provider) => ({
      kind: 'note',
      label: provider.name,
      description: provider.description,
    }));

    if (inventory.unresolved.length > 0) {
      notes.push({
        kind: 'note',
        label: `${inventory.unresolved.length} computed key(s)`,
        description: inventory.unresolvedDescription,
      });
    }

    return [...notes, ...flags];
  }
}

/** Findings a flag carries decide its icon. Nothing here invents wording. */
function iconFor(flag: InventoryFlag): string {
  const has = (id: Finding['id']): boolean => flag.findings.includes(id);
  if (has('flag.expired') || has('flag.budget-exceeded')) return 'error';
  if (has('flag.stale') || has('flag.absent-from-code') || has('flag.test-only')) return 'warning';
  if (!flag.inConfiguration) return 'question';
  return 'circle-outline';
}
