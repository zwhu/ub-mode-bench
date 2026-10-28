import { z } from "zod";

export const TaskSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  category: z.enum([
    "bug_fix",
    "feature",
    "refactor",
    "dedup",
    "dead_code",
    "redesign",
    "concurrency",
  ]),
  language: z.enum(["python", "ts", "js", "go", "rust", "java"]),
  difficulty: z.enum(["trivial", "easy", "medium", "hard"]),
  upstream: z.object({
    repo_hash: z.string().startsWith("sha256:"),
    base_sha_hash: z.string().startsWith("sha256:"),
    pr_url_encrypted: z.string().startsWith("enc:"),
    license: z.string().min(1),
  }),
  constraints: z.object({
    allowed_paths: z.array(z.string()).min(1),
    forbidden_paths: z.array(z.string()).default([]),
    time_budget_sec: z.number().int().positive(),
    token_budget: z.number().int().positive(),
    network: z.enum(["none", "wheelhouse"]).default("none"),
  }),
  evaluation: z.object({
    public_tests: z.array(z.string()).min(1),
    hidden_tests_ref: z.string().startsWith("gold://"),
    gates: z.object({
      crap_max: z.number().positive(),
      dup_threshold: z.number().min(0).max(1),
      mutation_survivor_max: z.number().int().min(0),
    }),
    rubric_prompts: z.array(z.string().startsWith("gold://")).default([]),
  }),
});
export type Task = z.infer<typeof TaskSchema>;

export const VariantSchema = z.object({
  id: z.enum(["A", "B", "C", "D"]),
  name: z.string(),
  description: z.string(),
  skills: z.array(z.string()).default([]),
  tools_available: z.array(z.string()).default([]),
  system_prompt_additions: z.array(z.string()).default([]),
  gate_feedback_in_loop: z.boolean().default(false),
});
export type Variant = z.infer<typeof VariantSchema>;

export const BenchConfigSchema = z.object({
  run: z.object({
    default_seeds: z.number().int().positive(),
    task_timeout_sec: z.number().int().positive(),
    parallelism: z.number().int().positive(),
    network: z.enum(["none"]),
  }),
  agent: z.object({
    default: z.string(),
    adapters: z.record(
      z.object({
        cmd: z.array(z.string()).min(1),
        skill_mount: z.string(),
      }),
    ),
  }),
  sandbox: z.object({
    image: z.string(),
    cpus: z.number().positive(),
    memory_mb: z.number().int().positive(),
    tmp_mb: z.number().int().positive(),
    pids: z.number().int().positive(),
  }),
  gates: z.object({
    image: z.string(),
    crap_max: z.number().positive(),
    dup_threshold: z.number(),
    mutation_survivor_max: z.number().int().min(0),
  }),
  reporting: z.object({
    out_dir: z.string(),
    formats: z.array(z.enum(["csv", "html", "json"])),
  }),
});
export type BenchConfig = z.infer<typeof BenchConfigSchema>;
