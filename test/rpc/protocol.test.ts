import { describe, expect, it } from 'vitest';
import { decode, encode, RPC_ERRORS } from '../../src/frontends/rpc/protocol.js';

const buf = (s: string) => Buffer.from(s, 'utf8') as Buffer<ArrayBuffer>;
const frame = (body: string) => `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;

describe('framing', () => {
  it('round-trips a message', () => {
    const wire = encode({ jsonrpc: '2.0', id: 1, result: { ok: true } });
    const { messages, rest } = decode(buf(wire));
    expect(messages).toEqual([{ jsonrpc: '2.0', id: 1, result: { ok: true } }]);
    expect(rest.length).toBe(0);
  });

  it('counts Content-Length in bytes, not characters', () => {
    // A flag key with a multi-byte character would otherwise truncate the body
    // and desynchronise the stream for every message after it.
    const wire = encode({ jsonrpc: '2.0', id: 1, result: { key: 'café-🚀' } });
    const declared = Number(/Content-Length: (\d+)/.exec(wire)?.[1]);
    const body = wire.slice(wire.indexOf('\r\n\r\n') + 4);

    expect(declared).toBe(Buffer.byteLength(body, 'utf8'));
    expect(declared).not.toBe(body.length);
    expect(decode(buf(wire)).messages[0]).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { key: 'café-🚀' },
    });
  });

  it('reads several messages from one chunk', () => {
    const wire =
      frame('{"jsonrpc":"2.0","id":1,"method":"a"}') +
      frame('{"jsonrpc":"2.0","id":2,"method":"b"}');
    expect(decode(buf(wire)).messages.map((m) => m.id)).toEqual([1, 2]);
  });

  it('waits for a body that has not fully arrived', () => {
    // A stream delivers arbitrary chunks; half a message must be kept, not parsed.
    const wire = frame('{"jsonrpc":"2.0","id":1,"method":"a"}');
    const half = decode(buf(wire.slice(0, wire.length - 5)));

    expect(half.messages).toEqual([]);
    expect(half.rest.length).toBeGreaterThan(0);

    const rejoined = decode(Buffer.concat([half.rest, buf(wire.slice(-5))]) as Buffer<ArrayBuffer>);
    expect(rejoined.messages.map((m) => m.id)).toEqual([1]);
  });

  it('waits when only part of a header has arrived', () => {
    expect(decode(buf('Content-Len')).messages).toEqual([]);
  });

  it('reports a malformed body without losing the stream', () => {
    const wire = frame('not json') + frame('{"jsonrpc":"2.0","id":9,"method":"ok"}');
    const result = decode(buf(wire));

    expect(result.problems).toHaveLength(1);
    expect(
      result.messages.map((m) => m.id),
      'the following message still parses',
    ).toEqual([9]);
  });

  it('reports a header with no Content-Length and moves on', () => {
    const wire = 'X-Nonsense: 1\r\n\r\n' + frame('{"jsonrpc":"2.0","id":3,"method":"ok"}');
    const result = decode(buf(wire));

    expect(result.problems[0]).toContain('Content-Length');
    expect(result.messages.map((m) => m.id)).toEqual([3]);
  });

  it('uses the reserved JSON-RPC error codes', () => {
    expect(RPC_ERRORS.METHOD_NOT_FOUND).toBe(-32601);
    expect(RPC_ERRORS.INVALID_PARAMS).toBe(-32602);
  });
});
