#!/usr/bin/env tsx
import { readFile, writeFile } from "node:fs/promises";
import { collectRows, aggregate, METRICS } from "../score/aggregate.ts";
import type { Result } from "../runners/result.ts";
import { artifactRoot } from "../runners/process.ts";
import { join } from "node:path";

async function rows(phase:string):Promise<Result[]>{try{return await collectRows(join(artifactRoot,"runs",phase));}catch{return [];}}
const smoke=await rows("smoke"),formal=await rows("formal");
const path="reports/overnight-2026-10-29.md";
let text=await readFile(path,"utf8");
const finished=formal.length===54;
const valid=formal.filter(r=>r.valid).length;
const status=finished?(valid>=49?"PASS_CANDIDATE":"LIMITED"):"IN_PROGRESS";
const number=(n:number|null)=>n===null?"null":Number(n.toFixed(4)).toString();
text=text.replace(/当前状态：[^\n]+/,`当前状态：${status}。S1–S3 为 PASS_CANDIDATE；smoke ${smoke.length}/6，正式 ${formal.length}/54（有效 ${valid}）。`);
const smokeSection=["## Smoke","",`${smoke.length}/6 个终态，${smoke.filter(r=>r.valid).length} 个有效。`,"",
  "| 模型 | 变体 | valid | hidden | CRAP max | 重复对 | mutation survivors | 首 commit 为失败测试 |",
  "| --- | --- | --- | --- | ---: | ---: | ---: | --- |",
  ...smoke.map(r=>`| ${r.model} | ${r.variant} | ${r.valid} | ${r.metrics.hidden_tests_passed} | ${r.metrics.crap_max??"null"} | ${r.metrics.dup_pairs_over_threshold??"null"} | ${r.metrics.mutation_survivors??"null"} | ${r.metrics.first_commit_is_failing_test??"null"} |`),
  "","完整 smoke 结果、skill 读取事件和网络探针在 `runs/smoke/`。验收摘要在 `reports/overnight/smoke-acceptance.json`。",""];
smokeSection.push("| 模型 | smoke 指标 | A 均值 (n) | C 均值 (n) | C−A |",
  "| --- | --- | ---: | ---: | ---: |");
for(const model of aggregate(smoke))for(const key of METRICS){const m=model.metrics[key]!;
  smokeSection.push(`| ${model.model} | ${key} | ${number(m.A.mean)} (${m.A.n}) | ${number(m.C.mean)} (${m.C.n}) | ${number(m.delta)} |`);}
smokeSection.push("", "smoke 每组仅一个样本；此表用于验证流程。原始向量与 CSV 在 `reports/overnight/smoke/`。", "");
const formalSection=["## 正式结果","",`${formal.length}/54 个终态；有效 ${valid}/${formal.length}。状态 ${status}。`,"",
  "每行在同一个模型内计算 C−A。布尔指标按 0/1 计算均值；n 只统计该指标的非 null 有效样本。表内数值最多显示四位小数，全精度值保留在 JSON/CSV。", "",
  "每个变体每模型为3个任务×3次重复，未作显著性检验。C−A 是非 null 组均值之差；当 n 不同时，不能当作完整配对差。diff、commit 数和用时描述改动量及过程成本。", "",
  "| 模型 | 指标 | A 均值 (n) | C 均值 (n) | C−A |",
  "| --- | --- | ---: | ---: | ---: |"];
for(const model of aggregate(formal))for(const key of METRICS){const m=model.metrics[key]!;
  formalSection.push(`| ${model.model} | ${key} | ${number(m.A.mean)} (${m.A.n}) | ${number(m.C.mean)} (${m.C.n}) | ${number(m.delta)} |`);}
formalSection.push("","所有 task、variant、model、seed 的原始值在 `reports/overnight/formal/raw.csv`。`reports/overnight/formal/aggregate.json` 对每项保存 A/C 均值、n 和完整的 task/seed 原始向量。",
  "","`wallclock_ms` 为 executor 准备与 agent 模型/工具阶段用时，外部评分不在该指标内。mutation 另有 20 分钟上限，正式 run 的剩余 30 分钟总预算也限制外部测试和评分。", "");
formalSection.push("<details><summary>每个正式 seed 的原始自动指标</summary>", "",
  "| 模型 | task | 变体 | seed | valid | public | hidden | CRAP max | CRAP mean | 重复对 | survivors | diff lines | commits | 首 commit 为失败测试 | agent ms |",
  "| --- | --- | --- | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |");
for(const row of formal){const m=row.metrics;
  formalSection.push(`| ${row.model} | ${row.task} | ${row.variant} | ${row.seed} | ${row.valid} | ${m.public_tests_passed} | ${m.hidden_tests_passed} | ${number(m.crap_max)} | ${number(m.crap_mean)} | ${m.dup_pairs_over_threshold??"null"} | ${m.mutation_survivors??"null"} | ${m.diff_lines} | ${m.commits} | ${m.first_commit_is_failing_test} | ${number(m.wallclock_ms)} |`);
}
formalSection.push("", "</details>", "");
const start=text.indexOf("## Smoke"),end=text.indexOf("## 诊断 run 与限制");
text=text.slice(0,start)+[...smokeSection,...formalSection].join("\n")+"\n"+text.slice(end);
const marker="## 无效与 null 项\n";
if(text.includes(marker))text=text.slice(0,text.indexOf(marker));
text+="\n"+marker+"\n";
const invalid=[...smoke,...formal].filter(r=>!r.valid);
text+=invalid.length?invalid.map(r=>`- ${r.id}: ${r.invalid_reasons.join("; ")}`).join("\n"):"无效 run：无（未完成的 run 尚未计入）。";
text+="\n\n";
const missing=[...smoke,...formal].filter(r=>Object.keys(r.null_reasons).length);
text+=missing.length?missing.map(r=>`- ${r.id}: ${JSON.stringify(r.null_reasons)}`).join("\n"):"null 指标：无（未完成的 run 尚未计入）。";
text+="\n\n阶段诊断 manual-v1–v4 不属于实验样本，不与正式无效 run 混算。mutator 的正常 survivor 退出码为 3；smoke 早期解析遗漏已按原始完整 Total 日志修正，并保存修正前 result。\n";
await writeFile(path,text.replace(/\n{4,}/g,"\n\n\n"));
console.log(`${path}: ${status}, smoke=${smoke.length}, formal=${formal.length}, valid=${valid}`);
