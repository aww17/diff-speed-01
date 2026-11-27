// Fast drop-in replacement for makefun-diff 1.0.0 (make.fun's own line diff).
//
// Returns exactly what makefun-diff's diffPatch returns for the same input:
// the same lines, the same common prefix/suffix trim, the same Myers greedy
// search with the deletion-preference tie-break, the same first path to both
// ends, and the same patch layout (3 context lines, hunks merged at <= 6 kept
// lines apart, "%" after a line with no trailing newline).
//
// Speed comes from: integer ids for lines (one Map pass over the trimmed
// middle), a typed-array Myers search (one Int32Array per depth d, kept for
// the backtrack), a backtrack that walks snakes by length instead of by
// comparing lines, and a patch builder that only checks the bare-line case
// for the final line of each text.

const KEEP = 0;
const DELETE = 1;
const INSERT = 2;

/** A text's lines, each with its "\n" (the last one without, when the text does not end in one). */
function tokenize(text) {
  const lines = [];
  let start = 0;
  for (;;) {
    const idx = text.indexOf('\n', start);
    if (idx === -1) {
      if (start < text.length) lines.push(text.slice(start));
      break;
    }
    lines.push(text.slice(start, idx + 1));
    start = idx + 1;
  }
  return lines;
}

/**
 * The edit runs of A into B, in order, as [kind, count] pairs (kind KEEP /
 * DELETE / INSERT). Replicates makefun-diff's editRuns exactly: for
 * d = 0, 1, 2, ... and each diagonal k = x - y from -d to d in steps of 2, the
 * furthest point a path of d edits reaches on k is one old line past the
 * (d-1)-point on k - 1 (a deletion) or one new line past the (d-1)-point on
 * k + 1 (an insertion), whichever lies further into the old text, the
 * deletion when both reach the same point; a move past either text's end is
 * no candidate; from that point the path follows every run of equal lines.
 * The first path to reach both ends is the script.
 */
function myersRuns(A, B) {
  const N = A.length;
  const M = B.length;
  // Vs[d] is an Int32Array of length 2d+1; Vs[d][k+d] is the number of old
  // lines consumed after d edits and the snake on diagonal k, or -1 when no
  // path of d edits reaches that diagonal.
  const Vs = [];
  let v0 = new Int32Array(1);
  let x = 0;
  while (x < N && x < M && A[x] === B[x]) x++;
  v0[0] = x;
  Vs.push(v0);
  let D = 0;
  if (x < N || x < M) {
    for (let d = 1; ; d++) {
      const v = new Int32Array(2 * d + 1);
      v.fill(-1);
      const vp = Vs[d - 1];
      const vplen = vp.length;
      for (let k = -d, idx = 0; k <= d; k += 2, idx += 2) {
        let xDel = -1;
        let xIns = -1;
        const iDel = idx - 2;
        if (iDel >= 0) {
          const xv = vp[iDel];
          if (xv !== -1 && xv < N) xDel = xv + 1;
        }
        const iIns = idx;
        if (iIns < vplen) {
          const xv = vp[iIns];
          if (xv !== -1 && xv - 1 - k < M) xIns = xv;
        }
        if (xDel < 0 && xIns < 0) continue;
        let xx = xDel >= xIns ? xDel : xIns;
        let y = xx - k;
        while (xx < N && y < M && A[xx] === B[y]) {
          xx++;
          y++;
        }
        v[idx] = xx;
        if (xx >= N && y >= M) {
          D = d;
          Vs.push(v);
          break;
        }
      }
      if (D !== 0) break;
      Vs.push(v);
    }
  }

  // Backtrack from (N, M) on diagonal N - M. At each depth the edit is the
  // same choice the forward search made; the snake is the segment from the
  // edit's landing point to the current point, so it is walked by length,
  // never by comparing lines again.
  const rev = [];
  const push = (kind) => {
    const l = rev[rev.length - 1];
    if (l !== undefined && l[0] === kind) l[1]++;
    else rev.push([kind, 1]);
  };
  x = N;
  let y = M;
  let k = N - M;
  for (let d = D; d >= 1; d--) {
    const vp = Vs[d - 1];
    const vplen = vp.length;
    const iDel = k + d - 2;
    const iIns = k + d;
    let xDel = -1;
    let xIns = -1;
    let xvDel = -1;
    let xvIns = -1;
    if (iDel >= 0 && iDel < vplen) {
      const xv = vp[iDel];
      if (xv !== -1 && xv < N) {
        xDel = xv + 1;
        xvDel = xv;
      }
    }
    if (iIns >= 0 && iIns < vplen) {
      const xv = vp[iIns];
      if (xv !== -1 && xv - 1 - k < M) {
        xIns = xv;
        xvIns = xv;
      }
    }
    if (xDel >= xIns) {
      const xe = xDel;
      while (x > xe) {
        x--;
        y--;
        push(KEEP);
      }
      push(DELETE);
      x = xvDel;
      k = k - 1;
      y = x - k;
    } else {
      const xe = xIns;
      while (x > xe) {
        x--;
        y--;
        push(KEEP);
      }
      push(INSERT);
      x = xvIns;
      k = k + 1;
      y = x - k;
    }
  }
  while (x > 0) {
    x--;
    y--;
    push(KEEP);
  }
  rev.reverse();
  return rev;
}

/** A line as the patch writes it: op + line, plus "%" on its own line when the line had no newline. */
function written(op, line, bare) {
  return bare ? op + line + '\n%\n' : op + line;
}

/** makefun-diff 1.0.0's answer for one case's input. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  const a = tokenize(input.old);
  const b = tokenize(input.new);
  const n = a.length;
  const m = b.length;
  // The common prefix, then the common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) suffix++;
  const na = n - prefix - suffix;
  const nb = m - prefix - suffix;

  // Intern the trimmed middle's lines to integer ids (one Map pass).
  const ids = new Map();
  let nextId = 0;
  const A = new Int32Array(na);
  for (let i = 0; i < na; i++) {
    const s = a[prefix + i];
    let id = ids.get(s);
    if (id === undefined) {
      id = nextId++;
      ids.set(s, id);
    }
    A[i] = id;
  }
  const B = new Int32Array(nb);
  for (let j = 0; j < nb; j++) {
    const s = b[prefix + j];
    let id = ids.get(s);
    if (id === undefined) {
      id = nextId++;
      ids.set(s, id);
    }
    B[j] = id;
  }

  const mid = myersRuns(A, B);
  const runs = [];
  if (prefix > 0) runs.push([KEEP, prefix]);
  for (let i = 0; i < mid.length; i++) runs.push(mid[i]);
  if (suffix > 0) runs.push([KEEP, suffix]);

  // The change runs: each a stretch of deletions and insertions between two kept lines, at old line o and new line p.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (let r = 0; r < runs.length; r++) {
    const kind = runs[r][0];
    const count = runs[r][1];
    if (kind === KEEP) {
      o += count;
      p += count;
      continue;
    }
    let c = changes[changes.length - 1];
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (kind === DELETE) {
      c.dels += count;
      o += count;
      deleted += count;
    } else {
      c.ins += count;
      p += count;
      inserted += count;
    }
  }

  // The hunks: change runs at most 2 * 3 kept lines apart share one.
  const hunks = [];
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    const h = hunks[hunks.length - 1];
    const prev = h !== undefined ? h[h.length - 1] : undefined;
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 6) h.push(c);
    else hunks.push([c]);
  }

  // Only the last line of each text can lack its newline.
  const aBare = n > 0 && !a[n - 1].endsWith('\n');
  const bBare = m > 0 && !b[m - 1].endsWith('\n');
  const out = [`makefun-diff/1 old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (let hi = 0; hi < hunks.length; hi++) {
    const h = hunks[hi];
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - 3);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(3, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (let ci = 0; ci < h.length; ci++) {
      const c = h[ci];
      for (; at < c.o; at++) out.push(written('=', a[at], aBare && at === n - 1));
      for (let i = 0; i < c.dels; i++) out.push(written('-', a[c.o + i], aBare && c.o + i === n - 1));
      for (let i = 0; i < c.ins; i++) out.push(written('+', b[c.p + i], bBare && c.p + i === m - 1));
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) out.push(written('=', a[at], aBare && at === n - 1));
  }
  return out.join('');
}
