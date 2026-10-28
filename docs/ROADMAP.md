# Roadmap

## MVP (this scaffold)

- [x] Repo structure, config schema, variant configs A/B/C/D.
- [x] Isolated sandbox + evaluator runner in TypeScript.
- [x] Three example tasks (`requests-session-timeout-01`,
      `click-echo-color-02`, `lodash-dedup-03`).
- [x] Gate script wrappers for tests, CRAP, duplication, mutation.
- [x] CSV / JSON / HTML report aggregator.
- [x] Design, anti-leak, and task-authoring docs.

## Next (0.2)

- [ ] Real agent adapter for TRAE CLI (`traecli --prompt-file`).
- [ ] Private `gold/` submodule bootstrap (`scripts/bootstrap_gold.sh`).
- [ ] Offline wheelhouse recipe for Python / Node tasks.
- [ ] AST-based rewrite pipeline (`scripts/rewrite_pr.ts`) for Python and TS.
- [ ] Human rubric scorer CLI (`score/score_manual.py`).

## Later (0.3+)

- [ ] 24-task public release spanning the category table.
- [ ] CI `smoke.yml` + `bench-nightly.yml`.
- [ ] Quarterly `drift-check.yml` with auto-rotate.
- [ ] Radar chart + task-level diff viewer in `index.html`.
- [ ] Second-skill adapter: evaluate peers of ub-mode (poteto-mode, etc.).
