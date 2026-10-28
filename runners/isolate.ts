import { execa } from "execa";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BenchConfig, Task, Variant } from "./schema.ts";

export interface SandboxHandle {
  containerId: string;
  workdir: string;
  destroy: () => Promise<void>;
}

/**
 * Starts an isolated sandbox container for a single (task, variant, seed).
 * Guarantees:
 *   - fresh tmp workdir on host, bind-mounted to /sandbox in container
 *   - --network=none, cpu/mem/pids caps
 *   - gold/ NEVER mounted here (that is only for the evaluator)
 */
export async function startSandbox(
  task: Task,
  variant: Variant,
  cfg: BenchConfig,
  runId: string,
): Promise<SandboxHandle> {
  const host = await mkdtemp(join(tmpdir(), `ube-${task.id}-`));
  const name = `ube-${task.id}-${variant.id}-${runId}`;

  const args = [
    "run",
    "-d",
    "--rm",
    "--name",
    name,
    "--network=none",
    `--cpus=${cfg.sandbox.cpus}`,
    `--memory=${cfg.sandbox.memory_mb}m`,
    `--pids-limit=${cfg.sandbox.pids}`,
    `--tmpfs=/tmp:rw,size=${cfg.sandbox.tmp_mb}m`,
    "-v",
    `${host}:/sandbox:rw`,
    cfg.sandbox.image,
    "sleep",
    `${cfg.run.task_timeout_sec}`,
  ];

  const { stdout } = await execa("docker", args);
  const containerId = stdout.trim();

  return {
    containerId,
    workdir: host,
    destroy: async () => {
      try {
        await execa("docker", ["kill", containerId]);
      } catch {
        /* already gone */
      }
      await rm(host, { recursive: true, force: true });
    },
  };
}

export async function execInSandbox(
  handle: SandboxHandle,
  cmd: string[],
  opts: { env?: Record<string, string>; cwd?: string } = {},
) {
  const envArgs = Object.entries(opts.env ?? {}).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  return execa("docker", [
    "exec",
    ...(opts.cwd ? ["-w", opts.cwd] : []),
    ...envArgs,
    handle.containerId,
    ...cmd,
  ]);
}
