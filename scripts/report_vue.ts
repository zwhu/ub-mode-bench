import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collectRows, aggregate } from "../score/aggregate.ts";
import { MODELS, matrix } from "../runners/matrix.ts";
import { diffStats } from "../runners/diff.ts";
import { parseEvents, skillCatalog, parseCrap, parseDry, parseMutation } from "../runners/result.ts";
import { assertDependencyBaselines } from "../runners/reference.ts";
import { loadTask } from "../runners/config.ts";
import assert from "node:assert/strict";
import { execa } from "execa";
import { createHash } from "node:crypto";
import { artifactRoot } from "../runners/process.ts";

const phase = process.argv[2] ?? "vue-formal";
assert(phase === "vue-formal" || phase === "vue-calibration");
const calibration = phase === "vue-calibration";
const jobs = matrix(["vue-template-cache"], ["A", "C"], calibration ? ["GPT-6.1-Sol"] : Object.keys(MODELS), calibration ? 1 : 3);
const task = loadTask("tasks/vue-template-cache/task.yaml");
const rows = await collectRows(join(artifactRoot,"runs", phase));
const outLabel = join("reports/vue-2026-10-29", phase);
const out = join(artifactRoot,outLabel);
await mkdir(out, { recursive: true });
await execa("python3", ["scripts/audit_vue_instructions.py"], { timeout: 120000 });
const protocolChanges: {id:string;raw_valid:boolean;reasons:string[]}[] = [];
for (const row of rows) {
  const events = parseEvents(await readFile(join(artifactRoot,"runs", phase, row.id, "events.jsonl"), "utf8").catch(()=>""));
  if (events.delegation.length) {
    protocolChanges.push({id:row.id,raw_valid:row.valid,reasons:["No-delegation protocol violated: spawned child agents"]});
  }
}
await writeFile(join(out,"protocol-audit.json"),JSON.stringify({checked_at:new Date().toISOString(),raw_results_unchanged:true,
  analysis_policy:"User requested keeping delegation runs in the overall comparison; delegation is an observation, not an exclusion",excluded:[],observed:protocolChanges},null,2));
let reviews: {id:string;reviewed:boolean;passed?:boolean;original_hidden_passed?:boolean}[] = [];
if (rows.length === jobs.length && !calibration) {
  const test = (await readFile("gold/vue-template-cache/hidden_tests/packages/compiler-sfc/__tests__/compileScript.spec.ts", "utf8"))
    .replace("      expect(descriptor.template!.ast!.transformed).toBe(true)\n", "");
  const existing = await readFile(join(out, "behavioral-review/summary.json"), "utf8").then(JSON.parse).catch(()=>null);
  const ids = rows.map(r=>r.id).sort();
  if (!existing || existing.test_sha256 !== createHash("sha256").update(test).digest("hex") ||
      JSON.stringify(existing.rows.map((r:{id:string})=>r.id).sort()) !== JSON.stringify(ids)) {
    await execa("python3", ["scripts/review_vue_behavior.py", phase], { timeout: 600000 });
  }
  const reviewed = JSON.parse(await readFile(join(out, "behavioral-review/summary.json"), "utf8"));
  reviews = reviewed.rows;
}
for (const row of rows) {
  assert(jobs.some(j => j.id === row.id), `unexpected sample ${row.id}`);
  if (!row.valid) continue;
  const dir = join(artifactRoot,"runs", phase, row.id);
  const context = JSON.parse(await readFile(join(dir, "context.json"), "utf8")) as {content:{text?:string}[]}[];
  const skills = skillCatalog(context.flatMap(x => x.content).map(c => c.text ?? "").join("\n"));
  assert.equal(skills.length, row.variant === "A" ? 0 : 1);
  const events = parseEvents(await readFile(join(dir, "events.jsonl"), "utf8"));
  assert(events.completed);
  if (row.variant === "C") assert(events.skillEvidence.length > 0 && skills[0]!.includes("ub-mode"));
  const network = JSON.parse(await readFile(join(dir, "network.json"), "utf8"));
  assert(network.internal && network.probe_exit !== 0 && !network.auth_mounted);
  assert(!JSON.stringify(network.mounts).includes("auth.json"));
  const reference = JSON.parse(await readFile(join(dir, "reference-check.json"), "utf8"));
  assert.deepEqual(reference.expected, task.dependency_baselines);
  assertDependencyBaselines(reference.copies, task.dependency_baselines!);
  const { files, ...counts } = await diffStats(join(dir, "workspace"), row.base);
  for (const [key, value] of Object.entries(counts)) assert.equal(row.metrics[key as keyof typeof counts], value);
  for (const metric of ["crap_max", "crap_mean", "mutation_survivors", "dup_pairs_over_threshold"] as const) {
    if (row.metrics[metric] === null) assert(row.null_reasons[metric] || metric.startsWith("crap") && row.null_reasons.crap);
  }
  for (const [metric, label] of [["public_tests_passed", "public-tests"], ["hidden_tests_passed", "hidden-tests"]] as const) {
    if (row.metrics[metric]) {
      const log = (await readFile(join(dir, `${label}.log`), "utf8")).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
      assert(/\bTests\s+\d+\s+passed/.test(log) && !/\bTests\s+\d+\s+failed/.test(log));
    }
  }
  if (row.metrics.crap_max !== null && row.metrics.code_diff_lines! > 0) {
    const crap = parseCrap(await readFile(join(dir, "gate-metrics/crap.edn"), "utf8"));
    assert(crap);
    assert(Math.abs(crap.mean - row.metrics.crap_mean!) < 1e-8);
    assert(Math.abs(crap.max - row.metrics.crap_max) < 1e-8);
  }
  if (row.metrics.dup_pairs_over_threshold !== null) assert.equal(parseDry(await readFile(join(dir, "gate-metrics/dry.edn"), "utf8")), row.metrics.dup_pairs_over_threshold);
  if (row.metrics.mutation_survivors !== null) assert.equal(parseMutation(await readFile(join(dir, "mutator.log"), "utf8")), row.metrics.mutation_survivors);
}
const valid = rows.filter(r => r.valid).length;
const complete = rows.length === jobs.length;
const status = complete ? valid === jobs.length ? "PASS_CANDIDATE" : "LIMITED" : "IN_PROGRESS";
const models = aggregate(rows);
await writeFile(join(out, "aggregate.json"), JSON.stringify({ total: rows.length, expected: jobs.length, valid, models }, null, 2));
const fields = ["public_tests_passed", "hidden_tests_passed", "code_diff_lines", "crap_max", "crap_mean", "dup_pairs_over_threshold", "mutation_survivors", "wallclock_ms"] as const;
const behavioral = (id:string) => reviews.find(r=>r.id===id)?.passed;
await writeFile(join(out, "source-only.csv"), "model,variant,seed,valid," + fields.join(",") + ",behavioral_recheck_passed\n" + rows.map(r => [r.model,r.variant,r.seed,r.valid,...fields.map(k=>r.metrics[k]??""),behavioral(r.id)??""].join(",")).join("\n") + "\n");
await writeFile(join(out, "acceptance.json"), JSON.stringify({ phase, expected: jobs.length, completed: rows.length, valid, status, checked_at: new Date().toISOString() }, null, 2));
const number = (n: number | null) => n === null ? "未测得" : n.toFixed(2);
const lines = ["# Vue 大仓库修复评测 · 2026-10-29", "", `当前阶段：${calibration ? "Sol A/C 校准" : "正式三模型评测"}；${rows.length}/${jobs.length} 次已终态，${valid} 次有效。状态 ${status}。`, "",
  "本轮用同一模型比较普通修复（A）与启用 ub-mode（C），修的是 Vue 单文件组件反复编译后丢失模板导入的问题。仓库约5.7万行TypeScript源码，官方参考修复134行业务源码、跨4个模块。", "",
  "公开测试检查原有行为，隐藏回归检查模板已转换且缓存失效后的再次分析。有效表示实验条件满足；是否修好看公开和隐藏测试，不代表所有质量指标达标。", "",
  "## 修复结果与业务源码改动", "", "| 模型 | 普通：公开/隐藏通过次数 | ub-mode：公开/隐藏通过次数 | 源码改动：普通 → ub-mode | 平均额外分钟 |", "| --- | --- | --- | --- | ---: |"];
for (const model of models) {
  const group = (variant: "A" | "C") => rows.filter(r=>r.valid&&r.model===model.model&&r.variant===variant);
  const passes = (variant: "A" | "C") => { const g=group(variant); return `${g.filter(r=>r.metrics.public_tests_passed).length}/${g.length} · ${g.filter(r=>r.metrics.hidden_tests_passed).length}/${g.length}`; };
  const m=model.metrics;
  lines.push(`| ${model.model} | ${passes("A")} | ${passes("C")} | ${number(m.code_diff_lines!.A.mean)} → ${number(m.code_diff_lines!.C.mean)} | ${number(m.wallclock_ms!.delta===null?null:m.wallclock_ms!.delta/60000)} |`);
}
if (!calibration) {
  lines.push("", "隐藏测试的内部断言复核：原测试要求输入AST被标记为transformed，但保留原AST、转换其副本同样能修复丢失导入。Luna C1原始隐藏失败发生在这个内部断言，去掉该断言后旧base仍因实际导入丢失失败，官方fix与Luna C1业务回归均通过。原始hidden_tests_passed保持原值，不直接当作实际修复失败。", "");
  if (reviews.length) {
    lines.push("所有终态样本按同一业务断言在断网容器重新执行完整compiler-sfc测试目录，未改模型源码或原始指标：", "", "| 模型 | 普通方式：行为复核通过 | ub-mode：行为复核通过 |", "| --- | ---: | ---: |");
    for (const model of models) {
      const count=(v:"A"|"C")=>{const g=rows.filter(r=>r.valid&&r.model===model.model&&r.variant===v);return `${g.filter(r=>behavioral(r.id)).length}/${g.length}`;};
      lines.push(`| ${model.model} | ${count("A")} | ${count("C")} |`);
    }
    lines.push("", "复核结果独立保存在behavioral-review/summary.json和CSV末列，原测试结果和所有源文件哈希保持不变。复核统一对所有样本执行，不重跑模型。", "");
  } else lines.push("正式运行尚未完成，统一对所有最终样本的业务复核待执行。", "");
}
if (protocolChanges.length) lines.push("", `委派观察：${protocolChanges.length} 次运行实际创建子agent，随后关闭且部分提示为no-op。按用户最新决定，这些运行保留在整体A/C汇总中，委派记录单列观察，不因此判无效。原始指标和事件保持不变，记录见protocol-audit.json的observed。`, "");
if (!calibration) {
  const proof = await readFile(join(artifactRoot,"reports/vue-2026-10-29/source-only-replay/summary.json"), "utf8").then(JSON.parse).catch(()=>null);
  if (proof) lines.push("", "补充独立修复核验：从干净base恢复原版测试与固定配置，只导入各模型的生产源码，丢弃模型修改的全部测试/辅助文件；再加入修复完成后才生成新标识符的客户端/SSR回归。旧base原有469项通过、新2项失败；官方fix通过471项；18份模型源码均通过471项。原结果未改写。这支持目标行为确实修好，但不证明代码已无其他bug或训练时未见过上游答案。详细证据见source-only-replay/summary.json。", "");
}
lines.push("", "改动行数只统计业务src源码的新增＋删除，包含空行、注释和未提交的新文件；不含测试及日志。时间包括环境准备、模型和模型调用工具阶段，不包括外部验收评分。", "", "## 质量评分", "",
  "CRAP是复杂度与测试覆盖组合的风险参考分数，越低通常越好；改动整个文件中的函数都会计入。Vue原有大型函数的分数就可能很高，不能直接把分数称为新增bug。survivor是工具故意改动后测试未发现的变化，不能直接称为真实漏洞；没测完记未测得。", "",
  "变异评分缺失由20分钟评分上限和整次30分钟预算共同造成；扫描整个改动文件可产生数百变异点，有些样本在模型修复和前置检查后已几乎没有评分时间。缺失不能当0或修复失败，也不适合只用完成的少数样本推断整体收益。本轮评分预算对Vue大任务不足，后续需独立且一致的评分预算和范围校准。", "",
  "| 模型 | 指标 | 普通均值（测量次数） | ub-mode均值（测量次数） | ub-mode − 普通 |", "| --- | --- | ---: | ---: | ---: |");
for (const model of models) for (const key of ["crap_mean", "crap_max", "dup_pairs_over_threshold", "mutation_survivors"] as const) {
  const m=model.metrics[key]!;
  lines.push(`| ${model.model} | ${key} | ${number(m.A.mean)} (${m.A.n}) | ${number(m.C.mean)} (${m.C.n}) | ${number(m.delta)} |`);
}
lines.push("", "## 条件与证据范围", "", "A没有额外skill；C只有固定版本ub-mode和三个质量工具。运行容器断网、无鉴权目录；依赖预装且禁止包含发布版Vue目标实现。评分容器network=none。源码别名按cwd解析，已用私有变异探针验证测试确实读取变异源码。", "",
  `单次30分钟，外部mutation最多20分钟，并发2。${calibration ? "校准每组仅一次，用于检查流程，不能据此判断稳定收益；正式轮每模型每组独立重复三次。" : "相同任务每模型每组独立重复三次。"}编号不是provider随机数种子。只比较同一模型内的A/C，不给模型排名。原小任务的54次结果没有混入本报告。`, "",
  `本轮回归基于官方新增测试，使用公开编译API挤出缓存以兼容旧版未导出的缓存；未修改生产源码。${calibration ? "校准沿用最初三个相关测试文件，正式轮扩充到完整compiler-sfc测试目录，因此两阶段不混算。" : "正式验收覆盖完整compiler-sfc测试目录，含模型新增测试文件。"}未覆盖完整Vue CI、lint、类型检查或所有浏览器测试。来源PR merge时间未独立核验，不能排除模型训练时见过开源修复。`, "",
  "指令审计：原始Vue快照和任务基线未发现常见agent规则文件。预装playwright-core依赖中有三个SKILL.md，但未进入A/C可用技能列表，已检查事件流未见读取。这些文件物理存在且同样可供两组访问，因此结论是未发现加载影响，不能称环境不存在任何其他skill文件。宿主ponytail等目录被逐路径禁用；模型自身CLI指令与统一任务限制仍然存在。Luna实际spawn子agent的运行按用户决定保留在整体汇总，委派记录单列，见instruction-audit/summary.json和protocol-audit.json。", "",
  "## 每次运行明细", "", "| 模型 | 做法 | 次数 | 有效 | 公开通过 | 隐藏通过 | 源码改动行 | CRAP均值 | survivor | 模型阶段分钟 |", "| --- | --- | ---: | --- | --- | --- | ---: | ---: | ---: | ---: |");
for (const r of rows) lines.push(`| ${r.model} | ${r.variant} | ${r.seed} | ${r.valid} | ${r.metrics.public_tests_passed} | ${r.metrics.hidden_tests_passed} | ${r.metrics.code_diff_lines??"未测得"} | ${number(r.metrics.crap_mean)} | ${r.metrics.mutation_survivors??"未测得"} | ${number(r.metrics.wallclock_ms/60000)} |`);
lines.push("", "## 未测得与无效项", "");
const missing=rows.filter(r=>Object.keys(r.null_reasons).length||!r.valid);
lines.push(...(missing.length?missing.map(r=>`- ${r.id}: ${[...r.invalid_reasons,...Object.entries(r.null_reasons).map(([k,v])=>`${k}: ${v}`)].join("; ")}`):["目前无未测得或无效项；未完成的运行尚不计入。"]));
lines.push("", `完整指标、有效性审计和源码口径CSV：\`${outLabel}/\`。逐次事件流、测试日志、Git和质量工具原始证据：\`runs/${phase}/\`。`, "");
await writeFile(calibration ? join(out, "report.md") : "reports/vue-2026-10-29.md", lines.join("\n"));
console.log(`${phase}: ${status} completed=${rows.length}/${jobs.length} valid=${valid}`);
