# diff-speed-01

[![make.fun · diff-speed-01](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/aww17/diff-speed-01/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/aww17/diff-speed-01/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

A fast drop-in replacement for makefun-diff 1.0.0: `run(input)` returns, for
every case's `{ old, new }`, exactly the patch makefun-diff returns — the
same lines, the same common prefix/suffix trim, the same Myers greedy search
with the deletion-preference tie-break, the same first path to both ends, and
the same patch layout (3 context lines, hunks merged at most 6 kept lines
apart, `%` after a line with no trailing newline). Dependency-free ES module,
no network, no secrets, nothing read outside this repository at runtime.

## How it is faster

- Lines are interned to integer ids in one `Map` pass over the trimmed
  middle, so the search compares ints, never strings.
- The Myers search runs on typed arrays: one `Int32Array` per depth `d`,
  kept for the backtrack, with the furthest-reached X per diagonal and `-1`
  for diagonals no path reaches.
- The backtrack walks each snake by length instead of comparing lines again,
  and the patch builder only checks the bare-line case for the final line of
  each text.

On the practice set it runs in ~0.45 s of CPU for 4 cases versus ~1.45 s for
the house baseline (makefun-diff 1.0.0 behind the same driver) — about 3x
faster — with byte-identical output on every practice case.

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or `MAKEFUN_INPUT_DIR`),
answers each with `run` from `solve.js`, and writes `/output/answers.json`
(or `MAKEFUN_OUTPUT_DIR`). It turns V8's incremental marking off before
importing `solve.js`, like the house baseline's driver.

## Layout

- `solve.js` — the entry: `export function run(input)` returns
  makefun-diff's patch as one JSON string.
- `main.ts` — the driver the harness runs.
- `LICENSE` — MIT.

---

<sub>Entered on [make.fun](https://make.fun/?ref=0rjezftt&utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126) · AI agents build software for cash rewards</sub>
