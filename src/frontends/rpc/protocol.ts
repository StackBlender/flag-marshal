/**
 * JSON-RPC 2.0 message framing over a byte stream.
 *
 * Uses `Content-Length` headers, the framing the Language Server Protocol uses.
 * Newline-delimited JSON would be simpler, but the design commits to LSP being
 * *additive later* rather than rejected — and an LSP wrapper over a
 * newline-framed server would mean replacing the transport rather than adding a
 * layer. Matching the framing now costs a few lines and keeps that door open.
 */
export interface RpcRequest {
  readonly jsonrpc: '2.0';
  readonly id?: number | string | null;
  readonly method: string;
  readonly params?: unknown;
}

export interface RpcResponse {
  readonly jsonrpc: '2.0';
  readonly id: number | string | null;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
}

/** JSON-RPC 2.0 reserved error codes. */
export const RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/** Frames a message for the wire. */
export function encode(message: RpcResponse): string {
  const body = JSON.stringify(message);
  // Content-Length counts bytes, not characters: a multi-byte key in a flag name
  // would otherwise truncate the message.
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

export interface DecodeResult {
  /** Messages fully received, in order. */
  readonly messages: RpcRequest[];
  /** Bytes not yet forming a complete message. */
  readonly rest: Buffer<ArrayBuffer>;
  /** Framing problems, reported rather than thrown so the stream survives. */
  readonly problems: string[];
}

const HEADER_END = '\r\n\r\n';

/**
 * Pulls every complete message out of a buffer.
 *
 * A stream delivers arbitrary chunks, so a message may arrive split across
 * several reads or several messages within one. Returning the remainder lets the
 * caller accumulate without the parser holding state.
 */
export function decode(buffer: Buffer<ArrayBuffer>): DecodeResult {
  const messages: RpcRequest[] = [];
  const problems: string[] = [];
  let rest: Buffer<ArrayBuffer> = buffer;

  for (;;) {
    const headerEnd = rest.indexOf(HEADER_END);
    if (headerEnd === -1) break;

    const header = rest.subarray(0, headerEnd).toString('utf8');
    const length = /content-length:\s*(\d+)/i.exec(header)?.[1];
    if (length === undefined) {
      problems.push('message header has no Content-Length');
      rest = rest.subarray(headerEnd + HEADER_END.length) as Buffer<ArrayBuffer>;
      continue;
    }

    const start = headerEnd + HEADER_END.length;
    const end = start + Number.parseInt(length, 10);
    if (rest.length < end) break; // Body still arriving.

    const body = rest.subarray(start, end).toString('utf8');
    rest = rest.subarray(end) as Buffer<ArrayBuffer>;

    try {
      messages.push(JSON.parse(body) as RpcRequest);
    } catch {
      problems.push('message body is not valid JSON');
    }
  }

  return { messages, rest, problems };
}
