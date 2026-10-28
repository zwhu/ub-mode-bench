#!/usr/bin/env tsx
// Scaffolds a new task: creates tasks/<id>/{task.yaml,prompt.md,setup.sh,allowed_paths.txt}
// and the companion private skeleton under gold/<id>/.
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Command } from "commander";

const program = new Command();
program
  .argument("<id>", "task id (lowercase, hyphenated, no upstream slug)")
  .requiredOption("--category <c>", "bug_fix|feature|refactor|dedup|dead_code|redesign|concurrency")
  .requiredOption("--language <l>", "python|ts|js|go|rust|java")
  .option("--difficulty <d>", "trivial|easy|medium|hard", "easy")
  .option("--upstream-repo <slug>", "owner/name of upstream (not committed)", "")
  .option("--upstream-sha <sha>", "base SHA of upstream (not committed)", "")
  .action(async (id, opts) => {
    const taskDir = join("tasks", "_examples", id);
    const goldDir = join("gold", id);
    await mkdir(taskDir, { recursive: true });
    await mkdir(goldDir, { recursive: true });

    const repoHash = opts.upstreamRepo
      ? "sha256:" + sha(opts.upstreamRepo)
      : "sha256:PLACEHOLDER_REPO_HASH";
    const shaHash = opts.upstreamSha
      ? "sha256:" + sha(opts.upstreamSha)
      : "sha256:PLACEHOLDER_BASE_SHA_HASH";

    await writeFile(
      join(taskDir, "task.yaml"),
      taskYaml(id, opts, repoHash, shaHash),
    );
    await writeFile(join(taskDir, "prompt.md"), promptTemplate(id));
    await writeFile(join(taskDir, "setup.sh"), setupSh(id));
    await chmod(join(taskDir, "setup.sh"), 0o755);
    await writeFile(join(taskDir, "allowed_paths.txt"), "src/**\ntests/**\n");

    // gold skeleton (private; .gitignored)
    await writeFile(
      join(goldDir, "provenance.yaml"),
      [
        `repo: ${opts.upstreamRepo || "owner/name"}`,
        `base_sha: ${opts.upstreamSha || "SHA"}`,
        `mirror: file:///mirror`,
        `pr_url: https://github.com/owner/name/pull/0`,
      ].join("\n") + "\n",
    );
    await writeFile(join(goldDir, "pre_patch.diff"), "");
    await writeFile(join(goldDir, "expected.diff"), "");
    await mkdir(join(goldDir, "hidden_tests"), { recursive: true });
    await writeFile(join(goldDir, "hidden_tests", "run.sh"), "#!/usr/bin/env bash\nexit 0\n");
    await chmod(join(goldDir, "hidden_tests", "run.sh"), 0o755);
    await writeFile(join(goldDir, "rubric.md"), "Reviewer notes for " + id + "\n");

    console.log(`scaffolded tasks/_examples/${id}/ and gold/${id}/`);
  });

function sha(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

function taskYaml(
  id: string,
  o: { category: string; language: string; difficulty: string },
  repoHash: string,
  shaHash: string,
) {
  return `id: ${id}
category: ${o.category}
language: ${o.language}
difficulty: ${o.difficulty}

upstream:
  repo_hash: ${repoHash}
  base_sha_hash: ${shaHash}
  pr_url_encrypted: enc:PLACEHOLDER
  license: UNKNOWN

constraints:
  allowed_paths:
    - src/**
    - tests/**
  forbidden_paths:
    - CHANGELOG*
    - HISTORY*
    - docs/release-notes/**
    - "**/.git/**"
  time_budget_sec: 1500
  token_budget: 150000
  network: none

evaluation:
  public_tests:
    - "echo TODO && false"
  hidden_tests_ref: "gold://${id}/hidden_tests"
  gates:
    crap_max: 10
    dup_threshold: 0.8
    mutation_survivor_max: 0
  rubric_prompts:
    - "gold://${id}/rubric.md"
`;
}

function promptTemplate(id: string) {
  return `# Task: ${id}

## Observed behavior
TODO

## Expected behavior
TODO

## Reproduction
\`\`\`bash
# TODO
\`\`\`

## Rules
- Edit allowed paths only.
- No CHANGELOG / HISTORY / release notes (removed by setup).
- Network is disabled.
`;
}

function setupSh(id: string) {
  return `#!/usr/bin/env bash
set -euo pipefail
WORKDIR="\${1:?workdir required}"
TASK_ID="${id}"
PROVENANCE="/gold/\${TASK_ID}/provenance.yaml"
[[ -f "$PROVENANCE" ]] || { echo "missing $PROVENANCE" >&2; exit 2; }

REPO=$(yq -r '.repo' "$PROVENANCE")
BASE_SHA=$(yq -r '.base_sha' "$PROVENANCE")
MIRROR=$(yq -r '.mirror' "$PROVENANCE")

mkdir -p "$WORKDIR" && cd "$WORKDIR"
git init -q
git remote add origin "$MIRROR/\${REPO}.git"
git fetch --depth=1 origin "$BASE_SHA" -q
git checkout -q FETCH_HEAD
rm -rf .git
git init -q && git add -A
git -c user.email=bench@local -c user.name=bench commit -q -m "base"

rm -rf CHANGELOG* HISTORY* NEWS* docs/release-notes docs/changelog* .github 2>/dev/null || true
find . -iname "changelog*" -delete 2>/dev/null || true

if [[ -f "/gold/\${TASK_ID}/pre_patch.diff" ]]; then
  git apply "/gold/\${TASK_ID}/pre_patch.diff"
fi
git add -A
git -c user.email=bench@local -c user.name=bench commit -q -m "task baseline"
echo "ready at $WORKDIR"
`;
}

program.parseAsync(process.argv);
