# gold/ (PRIVATE)

This directory is intentionally empty in the public repo. In actual deployment
it is a **private git submodule** containing the ground truth for every task:

```
gold/
├── <task-id>/
│   ├── provenance.yaml      # real repo slug, base SHA, PR URL, upstream license
│   ├── pre_patch.diff       # patch applied by setup.sh to recreate the bug
│   ├── expected.diff        # reference diff from the original PR (reviewer eyes only)
│   ├── hidden_tests/        # tests the agent never sees
│   └── rubric.md            # per-task scoring guidance for human reviewers
└── key.txt                  # fernet key used to decrypt pr_url_encrypted
```

## Why private?

An agent that can read `gold/` can trivially solve every task. The runner
mounts `gold/<task-id>` into the **evaluator container only**, never into the
sandbox the agent runs in.

## Adding a task

See `../scripts/new_task.ts` and `docs/TASK_AUTHORING.md`. The script wires up
both the public `tasks/<id>/` skeleton and the private `gold/<id>/` skeleton.

Do NOT commit real `provenance.yaml`, `expected.diff`, or `hidden_tests/`
contents to the public repo.
