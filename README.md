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
- A/B/C/D variant runner so you can measure a skill's **marginal** value vs.
  a plain baseline and vs. other skills.
- Anti-leak design so agents can't just search GitHub for the original PR.

## Design in one line

> **One task = one container = one worktree = one agent session; the ground
> truth never enters the agent's context.**

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full rationale.

## Repo layout

```
ub-mode-bench/
├── tasks/                 Public task definitions (prompt + base state only)
├── gold/                  PRIVATE submodule: hidden tests + expected diff
├── variants/              A/B/C/D runner configs
├── runners/               TypeScript evaluator entrypoints
├── gates/                 Quality gate shell wrappers
├── score/                 Auto + Rubric scoring, report aggregation
├── docker/                Sandbox + gates container images
├── scripts/               Dev utilities (new task, rewrite PR, etc.)
└── docs/                  Design, task authoring, anti-leak policy
```

## Quick start

```bash
pnpm install
pnpm bench:smoke          # 1 task × A/C variants (requires docker)
pnpm bench:run -- --tasks requests-session-timeout-01 --variants A,C --seeds 3
pnpm report               # produces reports/<run_id>/index.html
```

## Status

MVP scaffold. 3 example tasks, A/C variants only. See
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## License

MIT for the harness. Task-derived content retains its upstream license and is
cited per-task.
