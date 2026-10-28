import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";

interface Metrics {
  public_tests_passed: boolean;
  hidden_tests_passed: boolean | null;
  crap_max: number | null;
  crap_mean: number | null;
  dup_pairs_over_threshold: number | null;
  mutation_survivors: number | null;
  diff_lines: number;
  commits: number;
  wallclock_ms: number;
  exit_code: number;
}

interface Row {
  task: string;
  variant: string;
  seed: number;
  m: Metrics;
}

const program = new Command();
program
  .option("--run <id>", "run id (defaults to latest)", "")
  .option("--out <dir>", "report output dir", "")
  .action(async (opts) => {
    const base = "reports";
    const runs = (await readdir(base, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && d.name !== ".gitkeep")
      .map((d) => d.name)
      .sort();
    const runId = opts.run || runs.at(-1);
    if (!runId) throw new Error("no runs found");
    const runDir = join(base, runId);
    const rows = await collectRows(runDir);
    const out = opts.out || runDir;
    await mkdir(out, { recursive: true });
    await writeFile(join(out, "metrics.csv"), toCsv(rows));
    await writeFile(join(out, "metrics.json"), JSON.stringify(rows, null, 2));
    await writeFile(join(out, "index.html"), renderHtml(runId, rows));
    console.log(`report: ${join(out, "index.html")}`);
  });

async function collectRows(runDir: string): Promise<Row[]> {
  const rows: Row[] = [];
  if (!existsSync(runDir)) return rows;
  for (const task of await readdir(runDir)) {
    const tDir = join(runDir, task);
    for (const variant of await readdir(tDir)) {
      const vDir = join(tDir, variant);
      for (const seed of await readdir(vDir)) {
        const metricsPath = join(vDir, seed, "metrics.json");
        if (!existsSync(metricsPath)) continue;
        const m: Metrics = JSON.parse(await readFile(metricsPath, "utf8"));
        rows.push({ task, variant, seed: Number(seed), m });
      }
    }
  }
  return rows;
}

function toCsv(rows: Row[]): string {
  const header = [
    "task",
    "variant",
    "seed",
    "public_tests_passed",
    "hidden_tests_passed",
    "crap_max",
    "crap_mean",
    "dup_pairs",
    "mutation_survivors",
    "diff_lines",
    "commits",
    "wallclock_ms",
    "exit_code",
  ].join(",");
  const body = rows
    .map((r) =>
      [
        r.task,
        r.variant,
        r.seed,
        r.m.public_tests_passed,
        r.m.hidden_tests_passed,
        r.m.crap_max,
        r.m.crap_mean,
        r.m.dup_pairs_over_threshold,
        r.m.mutation_survivors,
        r.m.diff_lines,
        r.m.commits,
        r.m.wallclock_ms,
        r.m.exit_code,
      ].join(","),
    )
    .join("\n");
  return `${header}\n${body}\n`;
}

function renderHtml(runId: string, rows: Row[]): string {
  const byTaskVariant = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.task}|${r.variant}`;
    const list = byTaskVariant.get(k) ?? [];
    list.push(r);
    byTaskVariant.set(k, list);
  }
  const cells = [...byTaskVariant.entries()]
    .map(([k, rs]) => {
      const [task, variant] = k.split("|");
      const pass = rs.filter((r) => r.m.public_tests_passed).length;
      const avgDiff = rs.reduce((a, r) => a + r.m.diff_lines, 0) / rs.length;
      const avgCrap =
        rs.map((r) => r.m.crap_max).filter((n): n is number => n !== null).reduce((a, n) => a + n, 0) /
          Math.max(1, rs.length);
      return `<tr><td>${task}</td><td>${variant}</td><td>${pass}/${rs.length}</td><td>${avgDiff.toFixed(1)}</td><td>${avgCrap.toFixed(1)}</td></tr>`;
    })
    .join("");
  return `<!doctype html><meta charset="utf-8"><title>ub-mode-bench ${runId}</title>
<style>body{font:14px/1.5 ui-monospace,monospace;padding:24px;color:#2a2a2a}
table{border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}
th{background:#f6f6f6}h1{font-size:18px}</style>
<h1>ub-mode-bench · ${runId}</h1>
<table><thead><tr><th>task</th><th>variant</th><th>pass rate</th><th>avg diff lines</th><th>avg CRAP max</th></tr></thead>
<tbody>${cells}</tbody></table>`;
}

program.parseAsync(process.argv);
