import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { BenchConfigSchema, TaskSchema, VariantSchema } from "./schema.ts";
import type { BenchConfig, Task, Variant } from "./schema.ts";

export function loadBenchConfig(path = "bench.yaml"): BenchConfig {
  return BenchConfigSchema.parse(parse(readFileSync(path, "utf8")));
}

export function loadTask(path: string): Task {
  return TaskSchema.parse(parse(readFileSync(path, "utf8")));
}

export function loadVariant(path: string): Variant {
  return VariantSchema.parse(parse(readFileSync(path, "utf8")));
}
