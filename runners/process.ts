import { execa } from "execa";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
export const artifactRoot = resolve(process.env.BENCH_ARTIFACTS_DIR ?? ".");
export const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
export function docker(args: string[], timeout = 180_000) {
  return execa("sg", ["docker", "-c", ["docker", ...args].map(quote).join(" ")], { reject: false, timeout });
}
export async function checkedDocker(args: string[], timeout?: number) {
  const r = await docker(args, timeout);
  if (r.exitCode !== 0) throw new Error(`docker ${args[0]} failed: ${r.stderr}`);
  return r.stdout.trim();
}
export function cleanEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("TRAE") || key.startsWith("GIT_CONFIG_") || key.startsWith("CODEX")) delete env[key];
  }
  return env;
}

export async function resolveExecutable(command: string): Promise<string> {
  const result = await execa("sh", ["-c", 'command -v "$1"', "benchmark", command], {
    env: cleanEnvironment(), extendEnv: false,
  });
  return realpath(result.stdout.trim());
}

export function isTaskDeadline(error: unknown, elapsedMs: number, budgetMs: number): boolean {
  return typeof error === "object" && error !== null && "timedOut" in error && error.timedOut === true && elapsedMs >= budgetMs;
}
