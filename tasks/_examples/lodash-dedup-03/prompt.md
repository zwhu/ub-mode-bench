# Task: Collapse near-duplicate implementations

## Observed state

Two helpers in `src/collections/` perform structurally identical work on
different input types (array of primitives vs. array of objects with a key
function). The duplication is caught by the `dryer` tool at similarity ≥ 0.8.

## Required outcome

- Produce a single implementation that both call sites use.
- Public exports and their signatures remain unchanged.
- All existing tests still pass.
- `dryer` reports no pair of blocks at similarity ≥ 0.8 inside `src/`.
- No new runtime dependencies.

## Reproduction / verification

```bash
node --test test/dedup.test.js
# then the harness runs: dryer check src/ --threshold 0.8
```

## Rules

- Edit `src/**` and `test/**` only.
- Keep each resulting function below CRAP 10.
- Network is disabled.
