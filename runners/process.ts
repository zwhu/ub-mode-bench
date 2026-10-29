import { execa } from "execa";
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
