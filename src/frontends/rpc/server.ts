import { resolve } from 'node:path';
import {
  openWorkspace,
  type FileSystem,
  type GitHistory,
  type ScanReport,
} from '../../core/api/index.js';
import { RPC_ERRORS, type RpcRequest, type RpcResponse } from './protocol.js';

export interface RpcContext {
  readonly fs: FileSystem;
  readonly cwd: string;
  readonly git?: (root: string) => GitHistory;
  readonly now?: number;
}

/** Methods this server answers. Namespaced so an LSP wrapper can coexist. */
export const RPC_METHODS = {
  INITIALIZE: 'initialize',
  SCAN: 'flagMarshal/scan',
  SHUTDOWN: 'shutdown',
  EXIT: 'exit',
} as const;

const PROTOCOL_VERSION = '1.0';

/**
 * A long-lived analysis server for editor frontends.
 *
 * The one-shot CLI pays grammar loading and workspace discovery on every
 * invocation, which is fine for CI and hopeless for an editor that wants an
 * answer while someone is typing. This process stays alive, so the parser pool
 * and the loaded grammars stay warm between requests.
 *
 * It answers the same `AnalysisSession` the CLI drives, so the two frontends
 * cannot drift: a difference between them would be a difference in this file's
 * argument handling, not in analysis.
 */
export function createRpcServer(context: RpcContext) {
  let shuttingDown = false;

  async function scan(params: unknown): Promise<ScanReport> {
    const root = (params as { root?: unknown } | undefined)?.root;
    if (root !== undefined && typeof root !== 'string') {
      throw new RpcError(RPC_ERRORS.INVALID_PARAMS, 'params.root must be a string path');
    }

    const absolute = resolve(context.cwd, root ?? '.');
    const useGit = (params as { git?: unknown } | undefined)?.git !== false;

    return openWorkspace({
      root: absolute,
      fs: context.fs,
      ...(context.git === undefined || !useGit ? {} : { git: context.git(absolute) }),
      ...(context.now === undefined ? {} : { now: context.now }),
    }).scan();
  }

  return {
    get shuttingDown(): boolean {
      return shuttingDown;
    },

    /**
     * Handles one request. Returns undefined for a notification — a message with
     * no `id`, which JSON-RPC says must not be answered.
     */
    async handle(request: RpcRequest): Promise<RpcResponse | undefined> {
      const id = request.id ?? null;

      if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
        return reply(id, RPC_ERRORS.INVALID_REQUEST, 'expected a JSON-RPC 2.0 request');
      }

      const isNotification = request.id === undefined;

      try {
        switch (request.method) {
          case RPC_METHODS.INITIALIZE: {
            const result = {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: { scan: true },
            };
            return isNotification ? undefined : { jsonrpc: '2.0', id, result };
          }

          case RPC_METHODS.SCAN: {
            const report = await scan(request.params);
            return isNotification ? undefined : { jsonrpc: '2.0', id, result: report };
          }

          // `exit` is accepted alongside `shutdown` because every editor client
          // already speaks the LSP pair. Answering only one of them would make a
          // conforming client hang waiting for a reply it never gets.
          case RPC_METHODS.EXIT:
          case RPC_METHODS.SHUTDOWN: {
            shuttingDown = true;
            return isNotification ? undefined : { jsonrpc: '2.0', id, result: null };
          }

          default:
            return isNotification
              ? undefined
              : reply(id, RPC_ERRORS.METHOD_NOT_FOUND, `unknown method '${request.method}'`);
        }
      } catch (error) {
        if (isNotification) return undefined;
        // A failure analysing one workspace must not take the server down; the
        // editor keeps its connection and the user sees an error on that request.
        if (error instanceof RpcError) return reply(id, error.code, error.message);
        return reply(id, RPC_ERRORS.INTERNAL_ERROR, describe(error));
      }
    },
  };
}

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

function reply(id: number | string | null, code: number, message: string): RpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
