import { readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { execa } from "execa";
import type { Task, BenchConfig } from "./schema.ts";
import type { SandboxHandle } from "./isolate.ts";
import { MODELS, type Job } from "./matrix.ts";
import { cleanEnvironment } from "./process.ts";
import { resolveSkillPaths, skillCatalog } from "./result.ts";

let authQueue: Promise<void> = Promise.resolve();
export function hostAuth(cli: string, outputDir: string): Promise<void> {
  const call = authQueue.then(() => checkHostAuth(cli, outputDir));
  authQueue = call.catch(() => {});
  return call;
}
async function checkHostAuth(cli: string, outputDir: string) {
  const p = join(homedir(), ".trae/cli/auth.json");
  let auth = JSON.parse(await readFile(p, "utf8"));
  if (Date.parse(auth.trae?.expires_at ?? "") - Date.now() < 40 * 60_000 || !auth.trae?.access_token) {
    const r = await execa(cli, ["exec", "-m", "GPT-5.6-Luna", "-c", "model_reasoning_effort=xhigh", "--json",
      "--ephemeral", "--skip-git-repo-check", "Reply HOST_AUTH_OK. Do not use tools."], {
      env: cleanEnvironment(), extendEnv: false, stdin: "ignore", reject: false, timeout: 180_000 });
    await writeFile(join(outputDir, "host-refresh.jsonl"), r.stdout);
    await writeFile(join(outputDir, "host-refresh.stderr"), r.stderr);
    if (r.exitCode !== 0 || !r.stdout.includes('"type":"turn.completed"')) throw new Error("HOST_AUTH_BLOCKED");
    auth = JSON.parse(await readFile(p, "utf8"));
  }
  const remaining = Date.parse(auth.trae?.expires_at ?? "") - Date.now();
  if (!Number.isFinite(remaining) || remaining < 40 * 60_000) throw new Error("HOST_AUTH_BLOCKED: token not refreshed");
  await writeFile(join(outputDir, "auth-check.json"), JSON.stringify({ expires_at: auth.trae.expires_at,
    checked_at: new Date().toISOString(), refresh_owner: "host", container_auth: false }, null, 2));
}

export async function runAgent(handle: SandboxHandle, task: Task, job: Job, cfg: BenchConfig, out: string, remainingMs = cfg.run.task_timeout_sec * 1000) {
  const deadline=performance.now()+remainingMs;
  const cli = cfg.agent.adapters[cfg.agent.default]?.cmd[0];
  if (!cli) throw new Error("missing CLI");
  const config = [
    'model_provider = "trae"', 'commit_attribution = ""', 'web_search = "disabled"', 'resource_dirs = [".trae"]',
    '[features]', 'memories = false', 'plugins = false', 'multi_agent = false',
    '[memories]', 'generate_memories = false', 'use_memories = false', '[skills.bundled]', 'enabled = false',
  ];
  const env = { ...cleanEnvironment(), TRAE_HOME: handle.home, TRAECLI_HOME: join(handle.home, "cli"),
    TRAECLI_EXEC_SERVER_URL: `ws://${handle.ip}:4300` };
  await writeFile(join(handle.home, "traecli.toml"), config.join("\n") + "\n");
  const discovery = await execa(cli, ["debug", "prompt-input", "Skill discovery only"], {
    env, extendEnv: false, stdin: "ignore", reject: false, timeout: 30_000 });
  if (discovery.exitCode !== 0) throw new Error("skill discovery failed");
  const inputs = JSON.parse(discovery.stdout) as { content: { text?: string }[] }[];
  const text = inputs.flatMap(x => x.content).map(c => c.text ?? "").join("\n");
  const skills = resolveSkillPaths(text);
  const expected = join(handle.home, "skills/ub-mode/SKILL.md");
  for (const path of skills) {
    if (path !== expected) config.push("[[skills.config]]", `path = ${JSON.stringify(path)}`, "enabled = false");
  }
  await writeFile(join(handle.home, "traecli.toml"), config.join("\n") + "\n");
  const context = await execa(cli, ["debug", "prompt-input", "-c", `model=${job.model}`, "Verify isolated context"], {
    env, extendEnv: false, stdin: "ignore", reject: false, timeout: 30_000 });
  await writeFile(join(out, "context.json"), context.stdout);
  if (context.exitCode !== 0) throw new Error("context failed");
  const c = JSON.parse(context.stdout) as { content: { text?: string }[] }[];
  const available = skillCatalog(c.flatMap(x => x.content).map(x => x.text ?? "").join("\n"));
  if (available.length !== (job.variant === "A" ? 0 : 1) || (available.length && !available[0]!.includes(expected))) throw new Error("SKILL_ISOLATION_BLOCKED");
  const prompt = [job.variant === "C" ? "/ub-mode" : "", await readFile(`tasks/${task.id}/prompt.md`, "utf8"),
    `Allowed code paths: ${task.constraints.allowed_paths.join(", ")}.`,
    `Run tests with: ${task.evaluation.public_tests.join(" && ")}.`,
    "Work only in the task workspace. No delegation. No network access, external lookup, or pushes. No remotes are configured.",
    "The dependencies are preinstalled; do not change package or test runner configuration. Leave the completed work in the workspace.",
    job.variant === "C" ? "For explicit loading evidence, read the complete ub-mode SKILL.md with a file or shell read tool before changing code. The three quality tools are installed." : "",
  ].filter(Boolean).join("\n\n");
  await writeFile(join(out, "events.jsonl"), "");
  await writeFile(join(out, "agent.stderr"), "");
  let streamWrites = Promise.resolve();
  const child = execa(cli, ["exec", "-C", handle.workdir, "-m", job.model, "-c", `model_reasoning_effort=${MODELS[job.model].effort}`,
    "--json", "-o", join(out, "last-message.md"), "-y", "--ephemeral", "--skip-git-repo-check", prompt], {
    env, extendEnv: false, stdin: "ignore", reject: false, timeout: Math.max(1,deadline-performance.now()) });
  child.stdout?.on("data", (data: Buffer) => { streamWrites = streamWrites.then(() => appendFile(join(out,"events.jsonl"),data)); });
  child.stderr?.on("data", (data: Buffer) => { streamWrites = streamWrites.then(() => appendFile(join(out,"agent.stderr"),data)); });
  const r = await child;
  await streamWrites;
  await writeFile(join(out, "events.jsonl"), r.stdout);
  await writeFile(join(out, "agent.stderr"), r.stderr);
  if (/failed to connect to exec-server|exec-server transport disconnected/i.test(r.stderr)) throw new Error("EXEC_SERVER_CONNECTION_FAILED");
  return { stdout: r.stdout, exitCode: r.exitCode ?? 1 };
}
