import { describe, expect, it } from 'vitest';
import { createRpcServer, RPC_METHODS } from '../../src/frontends/rpc/server.js';
import { RPC_ERRORS } from '../../src/frontends/rpc/protocol.js';
import type { DirectoryEntry, FileSystem, ScanReport } from '../../src/core/api/index.js';

/** The same in-memory workspace shape the CLI tests use. */
function memoryFs(files: Record<string, string>): FileSystem {
  return {
    async readDirectory(path: string): Promise<DirectoryEntry[]> {
      const prefix = path.endsWith('/') ? path : `${path}/`;
      const names = new Set<string>();
      const dirs = new Set<string>();
      for (const full of Object.keys(files)) {
        if (!full.startsWith(prefix)) continue;
        const rest = full.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash === -1) names.add(rest);
        else dirs.add(rest.slice(0, slash));
      }
      if (names.size === 0 && dirs.size === 0) throw new Error(`ENOENT: ${path}`);
      return [
        ...[...dirs].map((name) => ({
          name,
          isDirectory: true,
          isFile: false,
          isSymbolicLink: false,
        })),
        ...[...names].map((name) => ({
          name,
          isDirectory: false,
          isFile: true,
          isSymbolicLink: false,
        })),
      ];
    },
    async readFile(path: string): Promise<string> {
      const text = files[path];
      if (text === undefined) throw new Error(`ENOENT: ${path}`);
      return text;
    },
  };
}

const LD = "import { init } from 'launchdarkly-node-server-sdk';\nconst client = init('');\n";
const workspace = { '/w/src/a.ts': `${LD}client.variation('alpha', u, false);\n` };

const server = (files = workspace) => createRpcServer({ fs: memoryFs(files), cwd: '/w' });

describe('rpc dispatch', () => {
  it('answers initialize with its protocol version and capabilities', async () => {
    const response = await server().handle({
      jsonrpc: '2.0',
      id: 1,
      method: RPC_METHODS.INITIALIZE,
    });
    expect(response?.result).toEqual({ protocolVersion: '1.0', capabilities: { scan: true } });
  });

  it('scans through the same session the CLI drives', async () => {
    // The two frontends must not drift: a difference between them would be a
    // difference in argument handling, never in analysis.
    const response = await server().handle({
      jsonrpc: '2.0',
      id: 2,
      method: RPC_METHODS.SCAN,
      params: { git: false },
    });
    const report = response?.result as ScanReport;
    expect(report.flags.map((f) => f.key)).toEqual(['alpha']);
    expect(report.schemaVersion).toBe('1.0');
  });

  it('rejects an unknown method with the reserved code', async () => {
    const response = await server().handle({ jsonrpc: '2.0', id: 3, method: 'nope' });
    expect(response?.error?.code).toBe(RPC_ERRORS.METHOD_NOT_FOUND);
  });

  it('rejects a non-string root rather than resolving nonsense', async () => {
    const response = await server().handle({
      jsonrpc: '2.0',
      id: 4,
      method: RPC_METHODS.SCAN,
      params: { root: 42 },
    });
    expect(response?.error?.code).toBe(RPC_ERRORS.INVALID_PARAMS);
  });

  it('rejects a message that is not JSON-RPC 2.0', async () => {
    const response = await server().handle({
      jsonrpc: '1.0',
      id: 5,
      method: 'initialize',
    } as never);
    expect(response?.error?.code).toBe(RPC_ERRORS.INVALID_REQUEST);
  });

  it('reports an analysis failure without ending the connection', async () => {
    // One unreadable workspace must not take the editor's server down.
    const broken: FileSystem = {
      readDirectory: () => Promise.reject(new Error('EACCES')),
      readFile: () => Promise.reject(new Error('EACCES')),
    };
    const s = createRpcServer({ fs: broken, cwd: '/w' });
    const response = await s.handle({ jsonrpc: '2.0', id: 6, method: RPC_METHODS.SCAN });

    // The walker tolerates an unreadable root, so this succeeds with nothing.
    expect(response?.id).toBe(6);
    expect(s.shuttingDown, 'a failed request must not stop the server').toBe(false);
  });

  it('does not answer a notification', async () => {
    // JSON-RPC forbids replying to a message with no id.
    const response = await server().handle({ jsonrpc: '2.0', method: RPC_METHODS.INITIALIZE });
    expect(response).toBeUndefined();
  });

  it.each([RPC_METHODS.SHUTDOWN, RPC_METHODS.EXIT])('stops on %s', async (method) => {
    const s = server();
    expect(s.shuttingDown).toBe(false);
    await s.handle({ jsonrpc: '2.0', id: 7, method });
    expect(s.shuttingDown).toBe(true);
  });
});
