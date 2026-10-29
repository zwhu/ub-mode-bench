# ub-mode-bench

An independent, reproducible benchmark for evaluating agent skills that enforce
software engineering discipline (initially targeting
[`unclebob/ub-mode`](https://github.com/unclebob/ub-mode) and comparable
alternatives).

> This repo is **not** affiliated with Uncle Bob or any of the companion tools
> (`crapper`, `dryer`, `mutator`). It is a third-party evaluation harness.

## Why

Agent skills that promise "better code hygiene" (TDD, root-cause fixing, small
commits, CRAP/duplication/mutation gates) are hard to compare objectively.
`ub-mode-bench` provides:

- A curated set of real-world PRs turned into **isolated, non-contaminating
  tasks**.
- Deterministic quality gates (tests, CRAP, duplication, mutation).
- An A/C runner measuring ub-mode's marginal effect within each model.
- Anti-leak design so agents can't just search GitHub for the original PR.

## Design in one line

> **One task = one container = one worktree = one agent session; the ground
> truth never enters the agent's context.**

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full rationale.

## Repo layout

```
ub-mode-bench/
├── tasks/                 Public task definitions (prompt + base state only)
├── gold/                  Local only: hidden tests, reference patch, source PR
├── variants/              A/C configs (B/D retained as historical examples)
├── runners/               TypeScript evaluator entrypoints
├── gates/                 Quality gate shell wrappers
├── score/                 Automatic metrics grouped by model, C minus A
├── docker/                Sandbox + gates container images
├── scripts/               Dev utilities (new task, rewrite PR, etc.)
└── docs/                  Design, task authoring, anti-leak policy
```

## Quick start

```bash
pnpm install
pnpm approve-builds esbuild  # if pnpm 12 reports ignored builds
pnpm lint
pnpm test
pnpm task:validate url-base-slashes
pnpm bench:smoke --dry-run  # 6 runs: one task, A/C, three models, one seed
pnpm bench:run --dry-run    # 54 runs: three tasks, A/C, three models, three seeds
pnpm bench:smoke
pnpm bench:run
pnpm report --run formal   # reports/overnight/formal/aggregate.json and raw.csv
```

## Status

The active execution plan, acceptance criteria and stop conditions are in
[`HANDOFF.md`](HANDOFF.md). Read it and the last 20 lines of
`reports/overnight/PROGRESS.md` before resuming. Example tasks under `_examples`
are excluded.

The host CLI calls models while an unprivileged executor runs inside an internal
Docker network. Only the task workspace, CLI binary, and C's read-only skill
directory are mounted. Authentication and refresh tokens stay on the host.
Every run uses a clean configuration with memories, plugins, bundled skills,
web search and commit attribution disabled. Native user skills are explicitly
filtered and the final model context is checked before the agent starts.

Images use Node 22.16.0 and SHA-pinned Python gate tools. Build dependencies
before evaluation; all visible/hidden tests and evaluator gates use
`--network=none`. Source PRs and hidden overlays are in local `gold/`; dependency
locks and image identities are in ignored `reports/overnight/` evidence.

Run results live in `runs/<phase>/<task>--<model>--<variant>--<seed>/result.json`.
Complete validated results are skipped on restart. Incomplete directories are
recreated. Mutation is capped at 20 minutes and timeout stays `null` with a
reason. Scores compare the full final state with the benchmark base commit,
including uncommitted and new files. Commit replay verifies that the first
commit only changes tests, those tests fail there, and pass in the final state.

## License

MIT for the harness. Task-derived content retains its upstream license and is
cited per-task.
