import { z } from "zod";
import { readFile } from "node:fs/promises";
export const MetricsSchema = z.object({
  public_tests_passed: z.boolean().nullable(), hidden_tests_passed: z.boolean().nullable(),
  crap_max: z.number().finite().nullable(), crap_mean: z.number().finite().nullable(),
  dup_pairs_over_threshold: z.number().int().nonnegative().nullable(),
  mutation_survivors: z.number().int().nonnegative().nullable(),
  diff_lines: z.number().int().nonnegative(), commits: z.number().int().nonnegative(),
  code_diff_lines: z.number().int().nonnegative().nullable().default(null),
  test_diff_lines: z.number().int().nonnegative().nullable().default(null),
  other_diff_lines: z.number().int().nonnegative().nullable().default(null),
  first_commit_is_failing_test: z.boolean().nullable(), wallclock_ms: z.number().nonnegative(),
  exit_code: z.number().int(),
});
export type Metrics = z.infer<typeof MetricsSchema>;
export const ResultSchema = z.object({
  id: z.string(), task: z.string(), model: z.string(), variant: z.enum(["A", "C"]), seed: z.number().int(),
  status: z.enum(["completed", "invalid"]), valid: z.boolean(), invalid_reasons: z.array(z.string()),
  metrics: MetricsSchema, null_reasons: z.record(z.string()), skill_evidence: z.array(z.string()),
  available_skills: z.array(z.string()), base: z.string(), commit_sequence: z.array(z.object({
    sha: z.string(), message: z.string(), files: z.array(z.string()),
  })), finished_at: z.string(), attempts: z.number().int(),
});
export type Result = z.infer<typeof ResultSchema>;
export function skillCatalog(text: string): string[] {
  return text.match(/^- [^\n]+\(file: [^\n]+SKILL\.md\)$/gm) ?? [];
}
export function resolveSkillPaths(text: string): string[] {
  const roots = new Map([...text.matchAll(/^- `(r\d+)` = `(.+)`$/gm)].map(m => [m[1]!, m[2]!]));
  return [...text.matchAll(/^-.+?\(file: (.+?SKILL\.md)\)$/gm)].map(m => {
    const path = m[1]!, alias = path.split("/")[0]!;
    return roots.has(alias) ? roots.get(alias)! + path.slice(alias.length) : path;
  });
}
export async function completedResult(path: string): Promise<Result | null> {
  try { const x = ResultSchema.safeParse(JSON.parse(await readFile(path, "utf8"))); return x.success ? x.data : null; }
  catch { return null; }
}
export function parseEvents(stream: string) {
  const events: Record<string, unknown>[] = [];
  for (const line of stream.split("\n")) {
    try { const value: unknown = JSON.parse(line); if (value && typeof value === "object") events.push(value as Record<string, unknown>); }
    catch { /* diagnostic lines are retained in events.jsonl */ }
  }
  const evidence: string[] = [];
  const delegation: string[] = [];
  for (const event of events) {
    const collaboration = event.item as { type?: string; tool?: string; status?: string } | undefined;
    if (event.type === "item.completed" && collaboration?.type === "collab_tool_call" &&
      collaboration.tool === "spawn_agent" && collaboration.status === "completed") delegation.push(JSON.stringify(event));
    const item = event.item as { type?: string; command?: string; status?: string; aggregated_output?: string; command_actions?: { path?: string }[] } | undefined;
    if (item?.status === "completed" && item.aggregated_output?.includes("# ub-mode") &&
      (item.command?.includes("ub-mode/SKILL.md") || item.command_actions?.some(x => x.path?.endsWith("ub-mode/SKILL.md")))) evidence.push(JSON.stringify(event));
  }
  return { completed: events.some(e => e.type === "turn.completed"), skillEvidence: evidence, delegation };
}
export function parseCrap(edn: string) {
  if (!edn.includes(":entries")) throw new Error("missing CRAP entries");
  const numbers = [...edn.matchAll(/:crap\s+(-?\d+(?:\.\d+)?|nil)/g)].map(m => m[1] === "nil" ? null : Number(m[1]));
  if (numbers.some(n => n === null)) return null;
  const values = numbers as number[];
  return { max: values.length ? Math.max(...values) : 0, mean: values.length ? values.reduce((a,b) => a+b, 0) / values.length : 0 };
}
export function parseDry(edn: string) {
  if (!edn.includes(":candidates")) throw new Error("missing duplication candidates");
  return [...edn.matchAll(/:score\s+\d/g)].length;
}
export function parseMutation(text: string): number {
  const match = text.match(/^Total\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(?:[\d.]+%|n\/a)\s*$/m);
  if (match) return Number(match[2]);
  if (text.includes("No functions to mutate.") || text.includes("No source files")) return 0;
  throw new Error("missing mutation total");
}
export function parseMutationResult(exitCode: number | undefined, text: string): number | null {
  if (exitCode !== 0 && exitCode !== 3) return null;
  try { return parseMutation(text); } catch { return null; }
}
export interface TestReport { numTotalTests: number; numFailedTests: number; numPassedTests: number;
  testResults: { assertionResults: { fullName: string; status: string }[] }[] }
export function firstTestProof(red: TestReport, green: TestReport): boolean {
  const failed=red.testResults.flatMap(x=>x.assertionResults).filter(x=>x.status==="failed");
  const passed=new Set(green.testResults.flatMap(x=>x.assertionResults).filter(x=>x.status==="passed").map(x=>x.fullName));
  return red.numFailedTests>0&&green.numFailedTests===0&&green.numPassedTests>0&&failed.length>0&&failed.every(x=>passed.has(x.fullName));
}
