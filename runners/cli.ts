#!/usr/bin/env tsx
import { Command } from "commander";
import pLimit from "p-limit";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { execa } from "execa";
import chalk from "chalk";
import { loadBenchConfig, loadTask, loadVariant } from "./config.ts";
import { startSandbox } from "./isolate.ts";
import { runAgent } from "./run_agent.ts";
import { collect, persistRun } from "./collect.ts";

const program = new Command();

program
  .name("ub-mode-bench")
  .description("Run the ub-mode-bench evaluation harness")
  .version("0.1.0");

program
  .command("run")
  .option("--tasks <ids>", "comma-separated task ids", "")
  .option("--variants <ids>", "comma-separated variant ids", "A,C")
  .option("--seeds <n>", "repetitions per (task, variant)", (v) => Number(v))
  .option("--config <path>", "bench config path", "bench.yaml")
  .action(async (opts) => {
    const cfg = loadBenchConfig(opts.config);
    const seeds = opts.seeds ?? cfg.run.default_seeds;
    const taskIds = opts.tasks.split(",").filter(Boolean);
    const variantIds = opts.variants.split(",").filter(Boolean);

    if (taskIds.length === 0) {
      console.error(chalk.red("provide --tasks <id,id,...>"));
      process.exit(2);
    }

    const runId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID().slice(0, 8);
    const runDir = join(cfg.reporting.out_dir, runId);
    console.log(chalk.cyan(`run id: ${runId}`));
    console.log(chalk.cyan(`output: ${runDir}`));

    const limit = pLimit(cfg.run.parallelism);
    const jobs: Promise<unknown>[] = [];

    for (const taskId of taskIds) {
      const taskPath = join("tasks", "_examples", taskId, "task.yaml");
      const task = loadTask(taskPath);
      for (const vid of variantIds) {
        const variant = loadVariant(join("variants", variantFile(vid)));
        for (let seed = 0; seed < seeds; seed++) {
          jobs.push(
            limit(() => runOne(task, variant, cfg, seed, runId, runDir)),
          );
        }
      }
    }

    await Promise.all(jobs);
    console.log(chalk.green("done"));
    console.log(`report with: pnpm report -- --run ${runId}`);
  });

function variantFile(id: string): string {
  const map: Record<string, string> = {
    A: "A_baseline.yaml",
    B: "B_tdd_only.yaml",
    C: "C_ub_mode.yaml",
    D: "D_ub_mode_no_tools.yaml",
  };
  const f = map[id];
  if (!f) throw new Error(`unknown variant: ${id}`);
  return f;
}

async function runOne(
  task: ReturnType<typeof loadTask>,
  variant: ReturnType<typeof loadVariant>,
  cfg: ReturnType<typeof loadBenchConfig>,
  seed: number,
  runId: string,
  runDir: string,
) {
  const tag = `${task.id} ${variant.id}#${seed}`;
  console.log(chalk.gray(`[start] ${tag}`));
  const t0 = performance.now();
  const handle = await startSandbox(task, variant, cfg, `${runId}-${seed}`);
  try {
    await execa("bash", [`tasks/_examples/${task.id}/setup.sh`, handle.workdir], {
      stdio: "inherit",
    });
    const { log, exitCode } = await runAgent(handle, task, variant, cfg);
    const metrics = await collect(handle, task, cfg, exitCode, performance.now() - t0);
    await persistRun(runDir, task, variant.id, seed, log, metrics);
    console.log(
      chalk.gray(
        `[done ] ${tag} pub=${metrics.public_tests_passed} crap=${metrics.crap_max ?? "?"} diff=${metrics.diff_lines}`,
      ),
    );
  } finally {
    await handle.destroy();
  }
}

program.parseAsync(process.argv);
