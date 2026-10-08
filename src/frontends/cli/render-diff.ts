/** Unchanged lines shown around each change, as `git diff` does. */
const CONTEXT = 3;

/**
 * A unified diff of one file, in the form `git apply` accepts.
 *
 * Paths are relative to the scanned root, so the patch applies from there.
 * Lines are compared with Myers' algorithm, which keeps several small rewrites
 * in a large file as several small hunks rather than one that spans them.
 */
export function unifiedDiff(path: string, before: string, after: string): string {
  const a = splitLines(before);
  const b = splitLines(after);
  const ops = diffLines(a.lines, b.lines);

  const out = [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`];
  for (const hunk of hunks(ops)) {
    const oldStart = hunk.oldStart + (hunk.oldCount === 0 ? 0 : 1);
    const newStart = hunk.newStart + (hunk.newCount === 0 ? 0 : 1);
    out.push(`@@ -${oldStart},${hunk.oldCount} +${newStart},${hunk.newCount} @@`);
    for (const op of hunk.ops) {
      const prefix = op.kind === 'same' ? ' ' : op.kind === 'removed' ? '-' : '+';
      out.push(prefix + op.text);
      const last = op.kind === 'added' ? b : a;
      const index = op.kind === 'added' ? op.newIndex : op.oldIndex;
      if (!last.finalNewline && index === last.lines.length - 1) {
        out.push('\\ No newline at end of file');
      }
    }
  }
  return out.join('\n');
}

function splitLines(text: string): { lines: string[]; finalNewline: boolean } {
  if (text === '') return { lines: [], finalNewline: true };
  const finalNewline = text.endsWith('\n');
  const lines = (finalNewline ? text.slice(0, -1) : text).split('\n');
  return { lines, finalNewline };
}

interface Op {
  readonly kind: 'same' | 'removed' | 'added';
  readonly text: string;
  readonly oldIndex: number;
  readonly newIndex: number;
}

/** Myers' O(ND) shortest edit script over lines. */
function diffLines(a: readonly string[], b: readonly string[]): Op[] {
  const max = a.length + b.length;
  const offset = max + 1;
  const v = new Array<number>(2 * max + 3).fill(0);
  const trace: number[][] = [];

  outer: for (let d = 0; d <= max; d++) {
    trace.push([...v]);
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0));
      let x = down ? (v[offset + k + 1] ?? 0) : (v[offset + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < a.length && y < b.length && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= a.length && y >= b.length) break outer;
    }
  }

  const ops: Op[] = [];
  let x = a.length;
  let y = b.length;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d] ?? [];
    const k = x - y;
    const down = k === -d || (k !== d && (vd[offset + k - 1] ?? 0) < (vd[offset + k + 1] ?? 0));
    const prevK = down ? k + 1 : k - 1;
    const prevX = vd[offset + prevK] ?? 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      ops.push({ kind: 'same', text: a[x] ?? '', oldIndex: x, newIndex: y });
    }
    if (d > 0) {
      if (down) {
        y--;
        ops.push({ kind: 'added', text: b[y] ?? '', oldIndex: x, newIndex: y });
      } else {
        x--;
        ops.push({ kind: 'removed', text: a[x] ?? '', oldIndex: x, newIndex: y });
      }
    }
  }
  return ops.reverse();
}

interface Hunk {
  readonly oldStart: number;
  readonly newStart: number;
  readonly oldCount: number;
  readonly newCount: number;
  readonly ops: readonly Op[];
}

/** Groups changes with their context, merging groups whose context touches. */
function hunks(ops: readonly Op[]): Hunk[] {
  const changed = ops.flatMap((op, i) => (op.kind === 'same' ? [] : [i]));
  const groups: [number, number][] = [];
  for (const i of changed) {
    const from = Math.max(0, i - CONTEXT);
    const to = Math.min(ops.length - 1, i + CONTEXT);
    const last = groups[groups.length - 1];
    if (last !== undefined && from <= last[1] + 1) last[1] = to;
    else groups.push([from, to]);
  }

  return groups.map(([from, to]) => {
    const slice = ops.slice(from, to + 1);
    const first = slice[0];
    return {
      oldStart: first?.oldIndex ?? 0,
      newStart: first?.newIndex ?? 0,
      oldCount: slice.filter((op) => op.kind !== 'added').length,
      newCount: slice.filter((op) => op.kind !== 'removed').length,
      ops: slice,
    };
  });
}
