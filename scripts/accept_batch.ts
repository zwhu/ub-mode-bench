#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { execa } from "execa";
import { join, resolve } from "node:path";
import { matrix, MODELS } from "../runners/matrix.ts";
import { completedResult, parseEvents, type Result } from "../runners/result.ts";
import { METRICS } from "../score/aggregate.ts";
import { cleanEnvironment, checkedDocker } from "../runners/process.ts";
import { assertDependencyBaselines } from "../runners/reference.ts";
import { loadTask } from "../runners/config.ts";

const phase=process.argv[2]??"smoke";
assert(phase==="smoke"||phase==="formal","phase must be smoke or formal");
const jobs=matrix(phase==="smoke"?["url-base-slashes"]:["url-base-slashes","defaults-safe-copy","path-network-root"],["A","C"],Object.keys(MODELS),phase==="smoke"?1:3);
const root=resolve("runs",phase);
const rows:Result[]=[];
for(const job of jobs){
  const out=join(root,job.id),r=await completedResult(join(out,"result.json"));
  assert(r,`missing or incomplete result: ${job.id}`);
  assert.equal(r.id,job.id);assert.equal(r.model,job.model);assert.equal(r.seed,job.seed);
  rows.push(r);
  if(r.valid){
    assert.equal(r.status,"completed",`${job.id}: valid run must be completed`);
    assert.equal(r.available_skills.length,job.variant==="A"?0:1);
    const events=parseEvents(await readFile(join(out,"events.jsonl"),"utf8"));
    assert(events.completed,`${job.id}: missing completed event`);
    if(job.variant==="C")assert(events.skillEvidence.length>0,`${job.id}: missing actual skill read`);
    const net=JSON.parse(await readFile(join(out,"network.json"),"utf8"));
    assert(net.probe_exit!==0,"outbound network probe succeeded");assert.equal(net.auth_mounted,false);
    assert(!JSON.stringify(net.mounts).includes("auth.json"));
    const task=loadTask(`tasks/${job.task}/task.yaml`);
    assert(task.dependency_baselines,`${job.id}: dependency baseline policy missing`);
    let referenceText:string|null=null;
    try{referenceText=await readFile(join(out,"reference-check.json"),"utf8");}catch{/* Original UNC runs precede the new preflight. */}
    if(referenceText){
      const reference=JSON.parse(referenceText);
      assert.deepEqual(reference.expected,task.dependency_baselines);
      assertDependencyBaselines(reference.copies,task.dependency_baselines);
    }else{
      assert.equal(job.task,"path-network-root",`${job.id}: missing reference preflight`);
      const baseline=JSON.parse(await readFile("reports/overnight/pathe-reference-baseline.json","utf8"));
      assert.equal(baseline.version,task.dependency_baselines.pathe);
      assert.equal(baseline.target_fix_present,false,"original UNC image contains target repair");
    }
    for(const key of ["crap_max","crap_mean","dup_pairs_over_threshold","mutation_survivors"] as const){
      if(r.metrics[key]===null)assert(r.null_reasons[key]||key.startsWith("crap")&&r.null_reasons.crap,`${job.id}: missing null reason for ${key}`);
    }
  }
  if(phase==="smoke"){
    assert.equal(r.status,"completed",`smoke infrastructure failure ${job.id}`);
    assert(r.valid,`${job.id}: ${r.invalid_reasons.join("; ")}`);
    assert.equal(r.available_skills.length,job.variant==="A"?0:1);
    assert.equal(parseEvents(await readFile(join(out,"events.jsonl"),"utf8")).completed,true);
    if(job.variant==="C")assert(r.skill_evidence.length>0,`${job.id}: no loaded skill`);
    assert.equal(typeof r.metrics.hidden_tests_passed,"boolean");
    for(const key of ["crap_max","crap_mean","dup_pairs_over_threshold","mutation_survivors"] as const){
      if(r.metrics[key]===null)assert(r.null_reasons[key]||key.startsWith("crap")&&r.null_reasons.crap,`${job.id}: missing null reason for ${key}`);
      else assert(Number.isFinite(r.metrics[key]));
    }
    const net=JSON.parse(await readFile(join(out,"network.json"),"utf8"));
    assert(net.probe_exit!==0,"outbound network probe succeeded");assert.equal(net.auth_mounted,false);
    assert(!JSON.stringify(net.mounts).includes("auth.json"));
  }
}
if(phase==="smoke"){
  const internal=JSON.parse(await checkedDocker(["network","inspect","ubm-internal"])) as {Internal:boolean}[];
  assert.equal(internal[0]?.Internal,true);
  const auth=await execa("/home/huzhengwei/.local/bin/traex",["exec","-m","GPT-5.6-Luna","-c","model_reasoning_effort=xhigh","--json","--ephemeral","--skip-git-repo-check","Reply HOST_AUTH_OK. Do not use tools."],
    {env:cleanEnvironment(),extendEnv:false,stdin:"ignore",reject:false,timeout:180_000});
  await writeFile("reports/overnight/smoke-host-after.jsonl",auth.stdout);
  await writeFile("reports/overnight/smoke-host-after.stderr",auth.stderr);
  assert.equal(auth.exitCode,0);assert(parseEvents(auth.stdout).completed&&auth.stdout.includes("HOST_AUTH_OK"));
}
const valid=rows.filter(r=>r.valid).length;
if(phase==="formal"){
  const report=JSON.parse(await readFile("reports/overnight/formal/aggregate.json","utf8")) as {
    total:number;valid:number;models:{model:string;metrics:Record<string,{A:{mean:number|null;n:number;values:{task:string;seed:number;value:number}[]};C:{mean:number|null;n:number;values:{task:string;seed:number;value:number}[]};delta:number|null}>}[];
  };
  assert.equal(report.total,54);assert.equal(report.valid,valid);
  assert.deepEqual(report.models.map(x=>x.model).sort(),Object.keys(MODELS).sort());
  for(const model of report.models)for(const metric of METRICS){
    const item=model.metrics[metric];assert(item,`missing ${model.model}/${metric}`);
    for(const variant of ["A","C"] as const){
      const actual:{task:string;seed:number;value:number}[]=rows.filter(r=>r.valid&&r.model===model.model&&r.variant===variant&&r.metrics[metric]!==null)
        .map(r=>({task:r.task,seed:r.seed,value:Number(r.metrics[metric])}));
      const sort=(a:{task:string;seed:number},b:{task:string;seed:number})=>a.task.localeCompare(b.task)||a.seed-b.seed;
      assert.equal(item[variant].n,actual.length);
      assert.deepEqual([...item[variant].values].sort(sort),actual.sort(sort));
      const mean:number|null=actual.length?actual.reduce((sum,x)=>sum+x.value,0)/actual.length:null;
      if(mean===null)assert.equal(item[variant].mean,null);
      else assert(Math.abs(item[variant].mean!-mean)<1e-8*Math.max(1,Math.abs(mean)),`mean mismatch ${model.model}/${metric}/${variant}`);
    }
    const delta:number|null=item.C.mean!==null&&item.A.mean!==null?item.C.mean-item.A.mean:null;
    assert.equal(item.delta,delta,`delta mismatch ${model.model}/${metric}`);
  }
}
const status=valid>=jobs.length*.9?"PASS_CANDIDATE":"LIMITED";
await writeFile(`reports/overnight/${phase}-acceptance.json`,JSON.stringify({phase,total:rows.length,valid,status,invalid:rows.filter(r=>!r.valid).map(r=>({id:r.id,reasons:r.invalid_reasons})),checked_at:new Date().toISOString()},null,2));
console.log(`${phase}: ${status} ${valid}/${jobs.length}`);
