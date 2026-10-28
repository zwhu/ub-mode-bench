import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BenchConfig, Task, Variant } from "./schema.ts";
import { execInSandbox, type SandboxHandle } from "./isolate.ts";

/**
 * Boot the agent inside the sandbox. The sandbox has:
 *   - /sandbox        the task worktree (writable)
 *   - /gold           NOT mounted (never)
 *   - /skills         variant-specific skill bundle (readonly)
 * Returns the raw stdout log; collection/metrics happen in collect.ts.
 */
export async function runAgent(
  handle: SandboxHandle,
  task: Task,
  variant: Variant,
  cfg: BenchConfig,
): Promise<{ log: string; exitCode: number }> {
  const adapterName = process.env.BENCH_AGENT ?? cfg.agent.default;
  const adapter = cfg.agent.adapters[adapterName];
  if (!adapter) throw new Error(`unknown agent adapter: ${adapterName}`);

  const prompt = await readFile(
    join("tasks", "_examples", task.id, "prompt.md"),
    "utf8",
  ).catch(() => `(prompt missing for ${task.id})`);

  const header = [
    `# Task: ${task.id}`,
    `# Allowed paths: ${task.constraints.allowed_paths.join(", ")}`,
    `# Forbidden paths: ${task.constraints.forbidden_paths.join(", ")}`,
    `# Token budget: ${task.constraints.token_budget}`,
    `# Time budget: ${task.constraints.time_budget_sec}s`,
    "",
    ...variant.system_prompt_additions,
    "",
    prompt,
  ].join("\n");

  await writeFile(join(handle.workdir, "TASK.md"), header);

  const res = await execInSandbox(
    handle,
    [...adapter.cmd, "--prompt-file", "/sandbox/TASK.md"],
    {
      cwd: "/sandbox",
      env: {
        BENCH_VARIANT: variant.id,
        BENCH_TASK: task.id,
      },
    },
  ).catch((e: { exitCode?: number; stdout?: string; stderr?: string }) => ({
    stdout: e.stdout ?? "",
    stderr: e.stderr ?? String(e),
    exitCode: e.exitCode ?? 1,
  }));

  return {
    log: `${res.stdout}\n---STDERR---\n${res.stderr ?? ""}`,
    exitCode: res.exitCode ?? 0,
  };
}
