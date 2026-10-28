# Task authoring guide

## 1. Pick a PR

Hard criteria:

- Diff ≤ 300 lines (source + tests).
- PR carries regression tests, or you can author equivalent hidden tests.
- Single concern — no mixed formatting or dependency bumps.
- Local test suite runs without external services.
- Upstream license is permissive (MIT / BSD / Apache / MPL). Record the SPDX
  id in `task.yaml`.
- Prefer PRs merged within the last 90 days to reduce training-set overlap.

Category balance target per release:

| Category | Count |
|----------|------|
| bug_fix | 6 |
| feature | 4 |
| refactor | 4 |
| dedup | 3 |
| dead_code | 2 |
| redesign | 2 |
| concurrency | 3 |

## 2. Scaffold

```bash
pnpm task:new <id> \
  --category bug_fix \
  --language python \
  --difficulty medium \
  --upstream-repo owner/name \
  --upstream-sha <base-sha>
```

This creates:
- `tasks/_examples/<id>/{task.yaml,prompt.md,setup.sh,allowed_paths.txt}` (public)
- `gold/<id>/{provenance.yaml,pre_patch.diff,expected.diff,hidden_tests/,rubric.md}` (private)

## 3. Fill in `gold/<id>/`

| File | Purpose |
|------|---------|
| `provenance.yaml` | Real repo slug + base SHA + offline mirror URL |
| `pre_patch.diff` | Patch that restores the "bug present" state from the base commit |
| `expected.diff` | Reference fix diff (reviewer eyes only) |
| `hidden_tests/run.sh` | Entrypoint; must exit 0 iff all hidden assertions hold |
| `rubric.md` | Per-task notes for human scorers |

## 4. Write `prompt.md`

Say what the agent sees, what it must deliver, and the constraints. Do NOT
copy the upstream PR body. Do NOT name functions that would make the fix
trivially searchable; rename via the rewrite pipeline if needed.

## 5. Validate locally

```bash
pnpm lint
BENCH_GOLD_DIR=./gold pnpm bench:smoke
```

The smoke run must:
- Boot the sandbox.
- Apply `setup.sh` cleanly.
- Produce a `metrics.json` even if the agent fails (null gates are OK).

## 6. Review

- Second reviewer runs variant A at temperature 0 three times.
- If A passes > 2/3 without any assistance, the task is likely memorized —
  rewrite public symbols or pick a different PR.
