import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { cleanEnvironment } from "./process.ts";
import { fileKind } from "./paths.ts";

export async function diffStats(workdir: string, base: string) {
  const git = (...args: string[]) => execa("git", ["-C", workdir, "-c", "core.hooksPath=/dev/null", ...args], {
    env: cleanEnvironment(), extendEnv: false,
  });
  const [tracked, untracked] = await Promise.all([
    git("diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--numstat", "-z", base),
    git("ls-files", "--others", "--exclude-standard", "-z"),
  ]);
  const files: { path: string; added: number; deleted: number; untracked: boolean; kind: "code" | "test" | "other" }[] = [];
  const add = (path: string, added: number, deleted: number, untracked: boolean) => {
    files.push({ path, added, deleted, untracked, kind: fileKind(path) });
  };
  for (const entry of tracked.stdout.split("\0").filter(Boolean)) {
    const match = /^(\d+)\t(\d+)\t([\s\S]+)$/.exec(entry);
    if (!match) throw new Error(`Cannot count non-text diff: ${entry}`);
    add(match[3]!, Number(match[1]), Number(match[2]), false);
  }
  for (const path of untracked.stdout.split("\0").filter(Boolean)) {
    const text = await readFile(join(workdir, path), "utf8");
    add(path, (text.match(/\n/g)?.length ?? 0) + Number(Boolean(text) && !text.endsWith("\n")), 0, true);
  }
  const sum = (kind?: "code" | "test" | "other") => files.filter(f => !kind || f.kind === kind).reduce((n, f) => n + f.added + f.deleted, 0);
  return { diff_lines: sum(), code_diff_lines: sum("code"), test_diff_lines: sum("test"), other_diff_lines: sum("other"), files };
}
