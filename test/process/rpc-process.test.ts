import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ScanReport } from '../../src/core/api/index.js';
import { decode, encode } from '../../src/frontends/rpc/protocol.js';
import { RPC_METHODS } from '../../src/frontends/rpc/server.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const ENTRY = resolve(ROOT, 'dist/frontends/cli/main.js');

interface Exchange {
  readonly responses: readonly { id: unknown; result?: unknown; error?: { code: number } }[];
  readonly status: number | null;
  readonly stderr: string;
}

/**
 * Drives the built server the way an editor would: one long-lived process, many
 * framed requests down one pipe. Unit tests cover framing and dispatch; only this
 * proves the shipped binary speaks the protocol and — just as important — that it
 * actually exits when told to. A server that answers correctly but leaves the
 * process alive is a hung editor.
 */
function serve(requests: readonly object[], timeoutMs = 60_000): Promise<Exchange> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('node', [ENTRY, 'serve', '--stdio'], { cwd: ROOT });
    const chunks: Buffer[] = [];
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`serve --stdio did not exit within ${timeoutMs}ms; stderr: ${stderr}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    child.on('error', reject);
    child.on('close', (status) => {
      clearTimeout(timer);
      const { messages } = decode(Buffer.concat(chunks) as Buffer<ArrayBuffer>);
      resolvePromise({ responses: messages as Exchange['responses'], status, stderr });
    });

    for (const request of requests) child.stdin.write(encode(request as never));
    child.stdin.end();
  });
}

const golden = (name: string): ScanReport =>
  JSON.parse(readFileSync(resolve(ROOT, 'fixtures', name, 'expected.json'), 'utf8')) as ScanReport;

/** Identical to the CLI process test's: the two frontends are held to one shape. */
const detectionShape = (report: ScanReport) =>
  report.flags.map(({ key, references, inConfiguration }) => ({
    key,
    references,
    inConfiguration,
  }));

describe('the built RPC server', () => {
  it('is built (run `npm run build` first)', () => {
    expect(existsSync(ENTRY), `missing ${ENTRY}`).toBe(true);
  });

  it('answers a scan with the same detection the golden set pins', async () => {
    const { responses, status, stderr } = await serve([
      { jsonrpc: '2.0', id: 1, method: RPC_METHODS.INITIALIZE },
      {
        jsonrpc: '2.0',
        id: 2,
        method: RPC_METHODS.SCAN,
        params: { root: 'fixtures/java-togglz', git: false },
      },
      { jsonrpc: '2.0', id: 3, method: RPC_METHODS.SHUTDOWN },
    ]);

    expect(stderr).toBe('');
    expect(status, 'the server must exit after shutdown').toBe(0);
    expect(responses.map((r) => r.id)).toEqual([1, 2, 3]);

    const report = responses[1]?.result as ScanReport;
    expect(detectionShape(report)).toEqual(detectionShape(golden('java-togglz')));
    expect(report.unresolvedReferences).toEqual(golden('java-togglz').unresolvedReferences);
  });

  it('serves repeated scans from one warm process', async () => {
    // The whole reason this frontend exists: an editor must not pay grammar
    // loading per keystroke, so the second scan has to work as well as the first.
    const scan = (id: number, fixture: string) => ({
      jsonrpc: '2.0',
      id,
      method: RPC_METHODS.SCAN,
      params: { root: `fixtures/${fixture}`, git: false },
    });
    const { responses, status } = await serve([
      scan(1, 'ts-launchdarkly'),
      scan(2, 'ts-launchdarkly'),
      { jsonrpc: '2.0', id: 3, method: RPC_METHODS.EXIT },
    ]);

    expect(status).toBe(0);
    const first = responses[0]?.result as ScanReport;
    const second = responses[1]?.result as ScanReport;
    expect(detectionShape(first)).toEqual(detectionShape(golden('ts-launchdarkly')));
    expect(detectionShape(second)).toEqual(detectionShape(first));
  });

  it('reports a bad request and keeps serving', async () => {
    const { responses, status } = await serve([
      { jsonrpc: '2.0', id: 1, method: 'flagMarshal/nope' },
      { jsonrpc: '2.0', id: 2, method: RPC_METHODS.INITIALIZE },
      { jsonrpc: '2.0', id: 3, method: RPC_METHODS.SHUTDOWN },
    ]);

    expect(status).toBe(0);
    expect(responses[0]?.error?.code).toBe(-32601);
    expect(responses[1]?.result).toBeDefined();
  });

  it('exits when its input closes, without a shutdown request', async () => {
    // An editor that dies mid-session closes the pipe and sends nothing. The
    // server must not linger as an orphan process holding a parser pool.
    const { responses, status } = await serve([
      { jsonrpc: '2.0', id: 1, method: RPC_METHODS.INITIALIZE },
    ]);

    expect(status).toBe(0);
    expect(responses).toHaveLength(1);
  });
});
