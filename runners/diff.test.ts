import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";
import { cleanEnvironment } from "./process.ts";
import { diffStats } from "./diff.ts";
import { collectRows, aggregate } from "../score/aggregate.ts";
import { fileKind, allowedPath } from "./paths.ts";

test("monorepo source, tests and allowed paths respect directory boundaries", () => {
  assert.equal(fileKind("packages/compiler-sfc/src/compileScript.ts"), "code");
  assert.equal(fileKind("packages/compiler-sfc/__tests__/src/demo.spec.ts"), "test");
  assert.equal(fileKind("scripts/aliases.js"), "other");
  const paths = ["packages/compiler-sfc/src/**", "packages/compiler-sfc/__tests__/**", "ACTION_LOG.md"];
  assert(allowedPath("packages/compiler-sfc/src/template/new.ts", paths));
  assert(allowedPath("packages/compiler-sfc/__tests__/new.spec.ts", paths));
  assert(allowedPath("ACTION_LOG.md", paths));
  assert(!allowedPath("packages/compiler-sfc/src-extra/new.ts", paths));
  assert(!allowedPath("packages/runtime-core/src/renderer.ts", paths));
  assert(!allowedPath("vitest.config.ts", paths));
});

test("line counts separate source, tests and logs across committed, staged, unstaged and new files", async () => {
  const root = await mkdtemp(join(tmpdir(), "ubm-diff-"));
  const work = join(root, "sample", "workspace");
  const git = (...args: string[]) => execa("git", ["-C", work, "-c", "core.hooksPath=/dev/null",
    "-c", "user.name=Test", "-c", "user.email=test@example.invalid", ...args], { env: cleanEnvironment(), extendEnv: false });
  try {
    await mkdir(join(work, "src"), { recursive: true });
    await mkdir(join(work, "test"));
    await writeFile(join(work, "src/main.ts"), "old\nkeep\n");
    await writeFile(join(work, "src/deleted.ts"), "remove\n");
    await writeFile(join(work, "test/existing.test.ts"), "old test\n");
    await git("init", "--quiet"); await git("add", "."); await git("commit", "--quiet", "-m", "base");
    const base = (await git("rev-parse", "HEAD")).stdout;
    await writeFile(join(work, "test/existing.test.ts"), "new test\n");
    await git("add", "test/existing.test.ts"); await git("commit", "--quiet", "-m", "test edit");
    await writeFile(join(work, "src/main.ts"), "new\nkeep\n"); await git("add", "src/main.ts");
    await rm(join(work, "src/deleted.ts"));
    await writeFile(join(work, "src/new.ts"), "no final newline");
    await writeFile(join(work, "test/new\tcase.test.ts"), "one\ntwo\n");
    await writeFile(join(work, "ACTION_LOG.md"), "one\ntwo\n");
    const { files, ...counts } = await diffStats(work, base);
    assert.deepEqual(counts, { diff_lines: 10, code_diff_lines: 4, test_diff_lines: 4, other_diff_lines: 2 });
    assert(files.some(f => f.path === "test/new\tcase.test.ts" && f.added === 2));
    assert(files.some(f => f.path === "src/deleted.ts" && f.deleted === 1));

    const path = join(root, "sample/result.json");
    const original = JSON.stringify({ id: "sample", task: "task", model: "model", variant: "A", seed: 1,
      status: "completed", valid: true, invalid_reasons: [], metrics: {
        public_tests_passed: true, hidden_tests_passed: true, crap_max: 5, crap_mean: 3,
        dup_pairs_over_threshold: 0, mutation_survivors: null, diff_lines: 10, commits: 1,
        first_commit_is_failing_test: false, wallclock_ms: 1000, exit_code: 0,
      }, null_reasons: {}, skill_evidence: [], available_skills: [], base, commit_sequence: [], finished_at: "now", attempts: 1 });
    await writeFile(path, original);
    const rows = await collectRows(root);
    assert.equal(rows[0]?.metrics.code_diff_lines, 4);
    assert.equal(rows[0]?.metrics.test_diff_lines, 4);
    assert.equal(rows[0]?.metrics.other_diff_lines, 2);
    assert.equal(await readFile(path, "utf8"), original);
    assert.equal(aggregate(rows)[0]?.metrics.code_diff_lines?.A.mean, 4);

    await writeFile(join(work, "src/new.ts"), "changed\nextra\n");
    await assert.rejects(collectRows(root), /Retained diff changed/);
    await rm(work, { recursive: true });
    const missing = aggregate(await collectRows(root))[0]?.metrics.code_diff_lines;
    assert.equal(missing?.A.n, 0); assert.equal(missing?.A.mean, null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
