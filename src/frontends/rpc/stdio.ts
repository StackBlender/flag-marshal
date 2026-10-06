import { createRpcServer, type RpcContext } from './server.js';
import { decode, encode } from './protocol.js';

/**
 * Drives the RPC server over a pair of streams.
 *
 * Requests are handled **in order**, not concurrently. A scan mutates the shared
 * parser pool, and two overlapping scans would interleave grammar loading; an
 * editor also expects the answer to its latest keystroke last. Serialising here
 * is simpler and more correct than locking inside the engine.
 */
export async function serveStdio(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  context: RpcContext,
): Promise<void> {
  const server = createRpcServer(context);
  let buffer: Buffer<ArrayBuffer> = Buffer.alloc(0);
  let queue = Promise.resolve();

  await new Promise<void>((finish) => {
    let finished = false;

    /** Stops the server. Pausing input is what lets the process exit: an open,
     * flowing stdin keeps the event loop alive whatever this resolves. */
    const stop = (): void => {
      if (finished) return;
      finished = true;
      input.pause();
      finish();
    };

    /**
     * Ends after the queue drains. Only safe from *outside* the queue — calling
     * it from within a queued handler would await the chain that link belongs
     * to, which deadlocks on itself and hangs the process forever.
     */
    const stopWhenDrained = (): void => {
      queue.then(stop).catch(stop);
    };

    input.on('data', (chunk: Buffer | string) => {
      const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      buffer = Buffer.concat([buffer, incoming]) as Buffer<ArrayBuffer>;
      const { messages, rest, problems } = decode(buffer);
      buffer = rest;

      for (const problem of problems) {
        // Framing errors have no id to answer, so they go to stderr rather than
        // being dropped: a client sending malformed frames needs to see why, and
        // the connection stays usable.
        process.stderr.write(`flag-marshal: ${problem}\n`);
      }

      for (const message of messages) {
        queue = queue
          .then(async () => {
            const response = await server.handle(message);
            if (response !== undefined) output.write(encode(response));
            // Checked after handling, not in this data callback: requests run on
            // the queue, so a synchronous check here would always see the state
            // from before `shutdown` ran. `stop` rather than `stopWhenDrained`
            // because this *is* the queue — the response is already written.
            if (server.shuttingDown) stop();
          })
          .catch(() => undefined);
      }
    });

    input.on('error', stopWhenDrained);
    input.on('end', stopWhenDrained);
    input.on('close', stopWhenDrained);
  });
}
