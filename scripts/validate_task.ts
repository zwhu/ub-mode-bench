#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, cp, rm, readdir, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";
import { loadTask } from "../runners/config.ts";
import { assertDependencyBaselines, dependencyProbeCode } from "../runners/reference.ts";

const id = process.argv[2];
assert(id && /^[a-z0-9-]+$/.test(id), "provide a task id");
const task = loadTask(`tasks/${id}/task.yaml`);
const extra = JSON.parse(await readFile(`tasks/${id}/task.yaml`, "utf8")) as {
  image: string; hidden_command: string;
};
const source = JSON.parse(await readFile(`gold/${id}/source.json`, "utf8")) as {
  title: string; pr: string; hidden_files: string[];
};
const out = resolve(`reports/overnight/validation/${id}`);
await mkdir(out, { recursive: true });
const scratch = await mkdtemp(join(tmpdir(), `ubm-validate-${id}-`));

function quote(value: string) { return `'${value.replaceAll("'", "'\\''")}'`; }

async function offline(workspace: string, cmd: string, label: string) {
  const result = await execa("sg", ["docker", "-c", [
    "docker", "run", "--rm", "--pull=never", "--network=none", "--cpus=2", "--memory=4096m",
    "--pids-limit=512", "-v", `${workspace}:/sandbox:rw`, "-w", "/sandbox", extra.image,
    "bash", "-c", `ln -sfn /opt/task/node_modules node_modules; ${cmd} --reporter=json --outputFile=/sandbox/test-result.json`,
  ].map(quote).join(" ")], { reject: false, timeout: 180_000 });
  await writeFile(join(out, `${label}.log`), result.stdout + "\n" + result.stderr);
  const report = JSON.parse(await readFile(join(workspace, "test-result.json"), "utf8")) as {
    numTotalTests: number; numFailedTests: number; numPassedTests: number;
    testResults: { assertionResults: { title: string; status: string }[] }[];
  };
  await writeFile(join(out, `${label}.json`), JSON.stringify({
    command: cmd, network: "none", exit_code: result.exitCode, report,
  }, null, 2));
  assert(report.numTotalTests > 0, `${label}: no tests`);
  return { exit: result.exitCode, report };
}

async function inspect(dir: string): Promise<void> {
  const prNumber = source.pr.split("/").at(-1)!;
  for (const name of await readdir(dir)) {
    const file = join(dir, name);
    assert(name !== ".git" && name !== ".github" && !name.toLowerCase().startsWith("changelog"), `history leak: ${file}`);
    const stat = await lstat(file);
    assert(!stat.isSymbolicLink(), `unexpected fixture symlink: ${file}`);
    if (stat.isDirectory()) await inspect(file);
    else {
      const text = await readFile(file, "utf8");
      assert(!text.includes(source.title), `PR title leak: ${file}`);
      assert(!new RegExp(`(?:#|/(?:pull|issues)/)${prNumber}\\b`).test(text), `PR number leak: ${file}`);
    }
  }
}

try {
  if(task.dependency_baselines){
    const probe=await execa("sg",["docker","-c",["docker","run","--rm","--pull=never","--network=none","--user",`${process.getuid!()}:${process.getgid!()}`,extra.image,
      "node","-e",dependencyProbeCode,JSON.stringify(Object.keys(task.dependency_baselines))].map(quote).join(" ")],{reject:false,timeout:30_000});
    assert.equal(probe.exitCode,0,"dependency preflight failed");
    const copies:unknown=JSON.parse(probe.stdout);assertDependencyBaselines(copies,task.dependency_baselines);
    await writeFile(join(out,"reference-check.json"),JSON.stringify({expected:task.dependency_baselines,copies},null,2));
  }
  const base = join(scratch, "base");
  await execa("bash", [`tasks/${id}/setup.sh`, base]);
  await inspect(base);
  const baseHidden = join(scratch, "base-hidden");
  const fixed = join(scratch, "fixed");
  await cp(base, baseHidden, { recursive: true });
  await cp(base, fixed, { recursive: true });
  const visible = await offline(base, task.evaluation.public_tests.join(" && "), "base-visible");
  assert.equal(visible.exit, 0, "base visible tests must pass");
  assert.equal(visible.report.numFailedTests, 0);
  await cp(`gold/${id}/hidden_tests`, baseHidden, { recursive: true });
  const hidden = await offline(baseHidden, extra.hidden_command, "base-hidden");
  assert.notEqual(hidden.exit, 0, "hidden tests must fail on base");
  assert(hidden.report.numFailedTests > 0, "hidden failure must be an assertion, not infrastructure");
  await execa("git", ["apply", resolve(`gold/${id}/reference.patch`)], { cwd: fixed });
  const fixedVisible = await offline(fixed, task.evaluation.public_tests.join(" && "), "fixed-visible");
  assert.equal(fixedVisible.exit, 0, "reference must pass visible tests");
  await cp(`gold/${id}/hidden_tests`, fixed, { recursive: true });
  const fixedHidden = await offline(fixed, extra.hidden_command, "fixed-hidden");
  assert.equal(fixedHidden.exit, 0, "reference must pass hidden tests");
  assert.equal(fixedHidden.report.numFailedTests, 0);
  await writeFile(join(out, "result.json"), JSON.stringify({
    task: id, status: "PASS_CANDIDATE", network: "none", fixture_sanitized: true,
    base_visible: visible.report.numPassedTests, base_hidden_failures: hidden.report.numFailedTests,
    reference_visible: fixedVisible.report.numPassedTests, reference_hidden: fixedHidden.report.numPassedTests,
    failed_assertions: hidden.report.testResults.flatMap(x => x.assertionResults).filter(x => x.status === "failed").map(x => x.title),
  }, null, 2));
  console.log(`${id}: PASS_CANDIDATE (${out}/result.json)`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
