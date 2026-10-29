export const MODELS = {
  "GPT-6.1-Sol": { effort: "xhigh", harness: "codex" },
  "GPT-5.6-Luna": { effort: "xhigh", harness: "codex" },
  "DeepSeek-V4.1-Flash": { effort: "high", harness: "claudecode" },
} as const;
export type Model = keyof typeof MODELS;
export interface Job { id: string; task: string; variant: "A" | "C"; model: Model; seed: number }
export function matrix(tasks: string[], variants: string[], models: string[], seeds: number): Job[] {
  if (!tasks.length || !models.length || !variants.length || !Number.isInteger(seeds) || seeds < 1) throw new Error("empty or invalid matrix");
  const jobs: Job[] = [];
  for (const task of tasks) {
    if (!/^[a-z0-9-]+$/.test(task)) throw new Error("invalid task id");
    for (const model of models) {
      if (!(model in MODELS)) throw new Error(`unsupported model ${model}`);
      for (const variant of variants) {
        if (variant !== "A" && variant !== "C") throw new Error("only A and C are accepted");
        for (let seed = 1; seed <= seeds; seed++) jobs.push({ task, model: model as Model, variant, seed,
          id: `${task}--${model}--${variant}--${seed}` });
      }
    }
  }
  if (new Set(jobs.map(j => j.id)).size !== jobs.length) throw new Error("duplicate matrix entries");
  return jobs;
}
