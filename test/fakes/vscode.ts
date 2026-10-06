/**
 * A fake `vscode` module, aliased in for tests.
 *
 * `src/frontends/vscode/extension.ts` is the one file in the repository that
 * cannot run outside an editor, which normally means it is the one file nothing
 * verifies. This fake implements just enough of the API for `activate` to run
 * against a real fixture directory, so the wiring — does a scan happen, do
 * diagnostics land on the right URIs, does the tree have the right shape — fails
 * in `npm run check` rather than in a Development Host window.
 *
 * It is not a simulation of VS Code. It records what the extension asked for.
 */

export class Uri {
  private constructor(readonly fsPath: string) {}
  static file(fsPath: string): Uri {
    return new Uri(fsPath);
  }
  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri([base.fsPath, ...segments].join('/'));
  }
  toString(): string {
    return this.fsPath;
  }
}

export class Range {
  constructor(
    readonly startLine: number,
    readonly startCharacter: number,
    readonly endLine: number,
    readonly endCharacter: number,
  ) {}
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Diagnostic {
  source?: string;
  code?: string;
  constructor(
    readonly range: Range,
    readonly message: string,
    readonly severity: DiagnosticSeverity,
  ) {}
}

export class ThemeIcon {
  constructor(readonly id: string) {}
}

export class Disposable {
  constructor(private readonly onDispose: () => void) {}
  dispose(): void {
    this.onDispose();
  }
}

export class EventEmitter<T> {
  private readonly listeners: ((value: T) => void)[] = [];
  readonly event = (listener: (value: T) => void): Disposable => {
    this.listeners.push(listener);
    return new Disposable(() => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    });
  };
  fire(value: T): void {
    for (const listener of this.listeners) listener(value);
  }
  dispose(): void {
    this.listeners.length = 0;
  }
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  description?: string;
  tooltip?: string;
  iconPath?: ThemeIcon;
  command?: { command: string; title: string; arguments?: unknown[] };
  constructor(
    readonly label: string,
    readonly collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None,
  ) {}
}

export interface WorkspaceFolder {
  readonly uri: Uri;
  readonly name: string;
  readonly index: number;
}

class FakeDiagnosticCollection {
  readonly entries = new Map<string, Diagnostic[]>();
  set(uri: Uri, diagnostics: Diagnostic[]): void {
    this.entries.set(uri.fsPath, diagnostics);
  }
  clear(): void {
    this.entries.clear();
  }
  dispose(): void {
    this.entries.clear();
  }
}

class FakeOutputChannel {
  readonly lines: string[] = [];
  appendLine(line: string): void {
    this.lines.push(line);
  }
  dispose(): void {
    this.lines.length = 0;
  }
}

/** Everything the extension registered, so a test can drive it afterwards. */
export const recorded = {
  diagnostics: undefined as FakeDiagnosticCollection | undefined,
  output: undefined as FakeOutputChannel | undefined,
  trees: new Map<
    string,
    { getChildren(node?: unknown): unknown[]; getTreeItem(node: unknown): TreeItem }
  >(),
  commands: new Map<string, (...args: never[]) => unknown>(),
  savedDocumentListeners: [] as (() => void)[],
  shownDocuments: [] as { uri: Uri; selection?: Range }[],
};

export function reset(folders: WorkspaceFolder[]): void {
  recorded.diagnostics = undefined;
  recorded.output = undefined;
  recorded.trees.clear();
  recorded.commands.clear();
  recorded.savedDocumentListeners.length = 0;
  recorded.shownDocuments.length = 0;
  workspace.workspaceFolders = folders;
}

export function folder(fsPath: string, name: string): WorkspaceFolder {
  return { uri: Uri.file(fsPath), name, index: 0 };
}

export const languages = {
  createDiagnosticCollection(_name: string): FakeDiagnosticCollection {
    const collection = new FakeDiagnosticCollection();
    recorded.diagnostics = collection;
    return collection;
  },
};

export const window = {
  createOutputChannel(_name: string): FakeOutputChannel {
    const channel = new FakeOutputChannel();
    recorded.output = channel;
    return channel;
  },
  registerTreeDataProvider(id: string, provider: never): Disposable {
    recorded.trees.set(id, provider);
    return new Disposable(() => recorded.trees.delete(id));
  },
  showTextDocument(document: { uri: Uri }, options?: { selection?: Range }): Promise<unknown> {
    recorded.shownDocuments.push({ uri: document.uri, ...(options ?? {}) });
    return Promise.resolve({});
  },
};

export const commands = {
  registerCommand(name: string, handler: (...args: never[]) => unknown): Disposable {
    recorded.commands.set(name, handler);
    return new Disposable(() => recorded.commands.delete(name));
  },
};

export const workspace = {
  workspaceFolders: [] as WorkspaceFolder[],
  openTextDocument(uri: Uri): Promise<{ uri: Uri }> {
    return Promise.resolve({ uri });
  },
  onDidSaveTextDocument(listener: () => void): Disposable {
    recorded.savedDocumentListeners.push(listener);
    return new Disposable(() => {
      const index = recorded.savedDocumentListeners.indexOf(listener);
      if (index >= 0) recorded.savedDocumentListeners.splice(index, 1);
    });
  },
  onDidChangeWorkspaceFolders(_listener: () => void): Disposable {
    return new Disposable(() => undefined);
  },
};

export interface ExtensionContext {
  readonly subscriptions: { dispose(): void }[];
}
