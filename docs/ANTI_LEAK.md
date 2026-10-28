# Anti-leak policy

The agent must solve each task from the task prompt and the task baseline
repo state — nothing else. This document enumerates every known leak surface
and the mitigation.

## In-repo surfaces

| Surface | Mitigation |
|---------|-----------|
| Public `tasks/<id>/task.yaml` | Only hashed/encrypted provenance; real values in private `gold/` |
| Public `prompt.md` | Reviewer-authored; must not quote the upstream fix message, CHANGELOG, or PR title |
| Public `setup.sh` | References `/gold/<id>/provenance.yaml` which is only mounted in a build step, never inside the running sandbox |
| Public example tasks | Carry `_examples/` prefix and `PLACEHOLDER` hashes until paired with a private `gold/` entry |

## Runtime surfaces

| Surface | Mitigation |
|---------|-----------|
| `.git` history | Severed by `setup.sh` after shallow fetch; agent sees only the baseline commit |
| CHANGELOG, HISTORY, NEWS, release notes | Removed by `setup.sh` |
| `.github/` (which often contains PR templates / workflows referencing the fix) | Removed |
| Network | `--network=none` on sandbox container |
| Agent memory from prior tasks | New session per run, cross-task memory disabled in adapters |
| Package registries | Dependencies pre-cached into a local wheelhouse mounted read-only; no outbound DNS |

## Training-set memorization

Even with the above, a model may have the PR text memorized from training.
Countermeasures:

1. **Recency** — At least 50% of tasks come from PRs merged within the last
   90 days.
2. **Rewriting** — `scripts/rewrite_pr.ts` renames public symbols, re-splits
   files, and renames fixtures via a stable mapping stored in
   `gold/<id>/rewrite.map`. Hidden tests are regenerated with the mapping.
3. **Rotation** — Quarterly task rotation; tasks that start showing
   anomalously high A-group pass rates are deprecated.
4. **Dual tracking** — Each task carries an `original/` and `rewritten/`
   version. Benchmarks default to `rewritten/`.

## Reviewer rules

- Never paste the upstream PR title, description, or commit message into
  `prompt.md`.
- Never include file paths that are unique enough to make a search trivial
  (e.g. `src/really_specific_module_name.py`); either rename via the rewrite
  mapping or add decoy files.
- Hidden tests must assert behavior, not implementation hashes.
- Rubric notes stay in `gold/<id>/rubric.md`; never in the public prompt.

## Audits

- Monthly `drift-check.yml` CI job: pick 3 random tasks, run variant A with
  temperature 0 against a baseline model; if pass rate > 70% for A, flag the
  task as "likely memorized" and queue for rewrite.
