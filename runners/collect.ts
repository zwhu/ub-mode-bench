import { execa } from "execa";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { BenchConfig, Task } from "./schema.ts";
import type { SandboxHandle } from "./isolate.ts";

export interface Metrics {
  public_tests_passed: boolean;
  hidden_tests_passed: boolean | null;
  crap_max: number | null;
  crap_mean: number | null;
  dup_pairs_over_threshold: number | null;
  mutation_survivors: number | null;
  diff_lines: number;
  commits: number;
  first_commit_is_failing_test: boolean | null;
  wallclock_ms: number;
  exit_code: number;
}

export async function collect(
  handle: SandboxHandle,
  task: Task,
  cfg: BenchConfig,
  agentExitCode: number,
  wallclockMs: number,
): Promise<Metrics> {
  // Diff/commit stats run in a lightweight helper container; the sandbox may be
  // dirty from the agent run and we want evaluator independence.
  const workdir = handle.workdir;

  const { stdout: diffShort } = await execa(
    "git",
    ["-C", workdir, "diff", "HEAD~1..HEAD", "--shortstat"],
  ).catch(() => ({ stdout: "" }));
  const diff_lines = parseDiffLines(diffShort);

  const { stdout: logOut } = await execa(
    "git",
    ["-C", workdir, "log", "--pretty=%H"],
  ).catch(() => ({ stdout: "" }));
  const commits = logOut.split("\n").filter(Boolean).length;

  // Gates (evaluator container). Each returns null on failure to run, so
  // missing tools do not falsely zero-fill a variant.
  const [publicOk, hiddenOk, crap, dup, mut] = await Promise.all([
    runPublicTests(workdir, task),
    runHiddenTests(workdir, task, cfg),
    runCrapper(workdir, cfg),
    runDryer(workdir, cfg),
    runMutator(workdir, cfg),
  ]);

  return {
    public_tests_passed: publicOk,
    hidden_tests_passed: hiddenOk,
    crap_max: crap?.max ?? null,
    crap_mean: crap?.mean ?? null,
    dup_pairs_over_threshold: dup,
    mutation_survivors: mut,
    diff_lines,
    commits,
    first_commit_is_failing_test: null, // filled by human rubric for MVP
    wallclock_ms: wallclockMs,
    exit_code: agentExitCode,
  };
}

function parseDiffLines(short: string): number {
  const m = short.match(/(\d+) insertion/);
  const d = short.match(/(\d+) deletion/);
  return (m ? Number(m[1]) : 0) + (d ? Number(d[1]) : 0);
}

async function runPublicTests(workdir: string, task: Task): Promise<boolean> {
  for (const cmd of task.evaluation.public_tests) {
    const res = await execa("bash", ["-lc", cmd], {
      cwd: workdir,
      reject: false,
    });
    if (res.exitCode !== 0) return false;
  }
  return true;
}

async function runHiddenTests(
  workdir: string,
  task: Task,
  cfg: BenchConfig,
): Promise<boolean | null> {
  // Hidden tests live in gold/<id>/hidden_tests and are mounted into a
  // separate evaluator container only. For MVP we invoke a helper script that
  // the operator wires up with their private gold/ submodule.
  const script = `gates/run_hidden_tests.sh`;
  const res = await execa("bash", [script, workdir, task.id, cfg.gates.image], {
    reject: false,
  });
  if (res.exitCode === 127) return null; // script missing
  return res.exitCode === 0;
}

async function runCrapper(workdir: string, cfg: BenchConfig) {
  const res = await execa("bash", ["gates/run_crapper.sh", workdir, cfg.gates.image], {
    reject: false,
  });
  if (res.exitCode !== 0) return null;
  try {
    const j = JSON.parse(res.stdout);
    return { max: Number(j.max), mean: Number(j.mean) };
  } catch {
    return null;
  }
}

async function runDryer(workdir: string, cfg: BenchConfig): Promise<number | null> {
  const res = await execa(
    "bash",
    ["gates/run_dryer.sh", workdir, String(cfg.gates.dup_threshold), cfg.gates.image],
    { reject: false },
  );
  if (res.exitCode !== 0) return null;
  const n = Number(res.stdout.trim());
  return Number.isFinite(n) ? n : null;
}

async function runMutator(workdir: string, cfg: BenchConfig): Promise<number | null> {
  const res = await execa("bash", ["gates/run_mutator.sh", workdir, cfg.gates.image], {
    reject: false,
  });
  if (res.exitCode !== 0) return null;
  const n = Number(res.stdout.trim());
  return Number.isFinite(n) ? n : null;
}

export async function persistRun(
  runDir: string,
  task: Task,
  variantId: string,
  seed: number,
  log: string,
  metrics: Metrics,
) {
  const dir = join(runDir, task.id, variantId, String(seed));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "agent.log"), log);
  await writeFile(join(dir, "metrics.json"), JSON.stringify(metrics, null, 2));
}

export async function readMetrics(path: string): Promise<Metrics> {
  return JSON.parse(await readFile(path, "utf8"));
}
