# Design: ub-mode-bench

## Invariants

1. **Isolation.** Every `(task, variant, seed)` triple runs in a brand-new
   sandbox container with its own workdir, no network, and no mount of
   `gold/`. Containers are `--rm` so they cannot carry state between runs.
2. **No leak.** The agent must not be able to recover the ground truth from
   the environment or from the open web.
3. **Determinism.** Given the same inputs (image hashes + skill version +
   model + temperature + seed) the harness should produce identical metrics.

## Isolation layers

| Layer | Mechanism |
|-------|-----------|
| Filesystem | Fresh `mkdtemp` per run, bind-mounted at `/sandbox` |
| Git | `setup.sh` wipes `.git` after fetching the base SHA, then reinits — no history |
| Process | Docker `--rm`, cpu/memory/pids caps per `bench.yaml` |
| Network | `--network=none` on the sandbox; evaluator image pulled offline |
| Agent memory | New session per run; cross-task memory disabled |
| Evaluator | Separate `gates` container; only this container ever mounts `gold/` |

## Anti-leak layers

| Vector | Mitigation |
|--------|-----------|
| Agent searches GitHub for PR | `--network=none`; dependencies pre-cached as a wheelhouse |
| Agent reads commit history | `.git` severed in `setup.sh` |
| Agent reads CHANGELOG / release notes | Removed by `setup.sh` |
| Agent infers from file names | Optional AST rename pipeline (`scripts/rewrite_pr.ts`) |
| Agent reads hidden tests | Hidden tests only mounted into evaluator, never sandbox |
| Agent searches public task.yaml | `repo_hash`, `base_sha_hash`, `pr_url_encrypted` are hashed/encrypted; real values live in private `gold/` |
| Training-set memorization | Rotate in PRs < 90 days old; mix in rewritten variants; refresh quarterly |

## Flow (per task × variant × seed)

```
cli.ts
  └── startSandbox(task, variant)     # fresh container, no network, no gold/
        └── setup.sh (host side)      # clone base, sever .git, strip leak files, apply pre_patch
        └── runAgent(handle)          # writes TASK.md, invokes adapter CLI
        └── collect(handle)           # public tests + gates (crap/dryer/mutator) + git stats
        └── persistRun(runDir, …)     # per-run dir with agent.log and metrics.json
      destroy()                       # docker kill, rm -rf host workdir
```

## Scoring

- **Automated**: public tests pass, hidden tests pass, CRAP max/mean,
  duplication pairs ≥ 0.8, surviving mutants, diff lines, commit count,
  wallclock, token/exit.
- **Human (rubric)**: six items × 0/1/2, two reviewers, Cohen's kappa.

## What this harness does NOT do

- It does not host or train models.
- It does not grade subjective style unless a human rubric scorer runs.
- It does not run against production credentials or external APIs.
