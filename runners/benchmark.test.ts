import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, symlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { matrix, MODELS } from "./matrix.ts";
import { completedResult, parseEvents, parseCrap, parseDry, parseMutation, parseMutationResult, resolveSkillPaths, skillCatalog, firstTestProof, type Result } from "./result.ts";
import { aggregate } from "../score/aggregate.ts";
import { auditLinks } from "./collect.ts";
import { assertDependencyBaselines } from "./reference.ts";

const metric={public_tests_passed:true,hidden_tests_passed:true,crap_max:5,crap_mean:3,dup_pairs_over_threshold:0,mutation_survivors:null,
  diff_lines:10,commits:2,first_commit_is_failing_test:true,wallclock_ms:1000,exit_code:0};
function row(model:string,variant:"A"|"C",value:number|null):Result{return {id:`${model}-${variant}`,model,variant,task:"task",seed:1,status:"completed",valid:true,
  metrics:{...metric,crap_max:value},null_reasons:{mutation_survivors:"timeout"},invalid_reasons:[],skill_evidence:[],available_skills:[],base:"base",commit_sequence:[],finished_at:"now",attempts:1};}
test("matrix has every task-model-variant-seed combination and stable unique IDs",()=>{
  assert.equal(matrix(["one"],["A","C"],Object.keys(MODELS),1).length,6);
  const jobs=matrix(["one","two","three"],["A","C"],Object.keys(MODELS),3);
  assert.equal(jobs.length,54);assert.equal(new Set(jobs.map(x=>x.id)).size,54);
  assert.throws(()=>matrix(["one"],["C"],["unknown"],1));assert.throws(()=>matrix(["one"],["A"],Object.keys(MODELS),1.5));
});
test("event parser requires successful actual skill-body read, not a final claim",()=>{
  const claim=JSON.stringify({type:"item.completed",item:{type:"agent_message",text:"I loaded ub-mode"}});
  assert.equal(parseEvents(claim).skillEvidence.length,0);
  const event={type:"item.completed",item:{type:"command_execution",command:"Read",status:"completed",command_actions:[{path:"/skills/ub-mode/SKILL.md"}],aggregated_output:"# ub-mode\nEvery time you are asked"}};
  const parsed=parseEvents(claim+"\nnot-json\n"+JSON.stringify(event)+'\n{"type":"turn.completed"}');
  assert(parsed.completed);assert.equal(parsed.skillEvidence.length,1);
  assert.equal(parseEvents(JSON.stringify({...event,item:{...event.item,status:"failed"}})).skillEvidence.length,0);
});
test("native skill aliases resolve to exact absolute config paths",()=>{
  assert.deepEqual(resolveSkillPaths('- `r0` = `/native/skills`\n- ponytail: text (file: r0/ponytail/SKILL.md)\n- ub-mode: text (file: /clean/skills/ub-mode/SKILL.md)'),
    ["/native/skills/ponytail/SKILL.md","/clean/skills/ub-mode/SKILL.md"]);
  assert.equal(skillCatalog('The following skills are available for use with the Skill tool:\n- ub-mode: text (file: /clean/skills/ub-mode/SKILL.md)').length,1);
});
test("tool parsers preserve unavailable CRAP and mutation values",()=>{
  assert.deepEqual(parseCrap('{:entries [{:crap 4.0} {:crap 8.0}]}'),{max:8,mean:6});
  assert.equal(parseCrap('{:entries [{:crap nil}]}'),null);
  assert.equal(parseDry('{:candidates [{:score 0.9} {:score 0.82}]}'),2);
  assert.equal(parseMutation('Total                  7         2          1     10   77.8%\n'),2);
  assert.throws(()=>parseMutation("process timed out"));assert.throws(()=>parseCrap("tool unavailable"));
  const survivor="Total   7   2   1   10   77.8%\n";
  assert.equal(parseMutationResult(3,survivor),2);
  assert.equal(parseMutationResult(2,survivor),null);
  assert.equal(parseMutationResult(124,survivor),null);
  assert.equal(parseMutationResult(3,"usage error"),null);
});
test("aggregate computes within-model C minus A and uses non-null n",()=>{
  const rows=[row("model-one","A",10),row("model-one","C",4),row("model-one","C",null),row("model-two","A",100),row("model-two","C",120)];
  const result=aggregate(rows);assert.equal(result[0]?.metrics.crap_max?.delta,-6);assert.equal(result[0]?.metrics.crap_max?.C.n,1);
  assert.equal(result[1]?.metrics.crap_max?.delta,20);
  rows[1]!.valid=false;assert.equal(aggregate(rows)[0]?.metrics.crap_max?.delta,null);
});
test("resume skips only a complete validated terminal result",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"ubm-test-"));const file=join(dir,"result.json");
  try {assert.equal(await completedResult(file),null);await writeFile(file,'{"status":"completed"}');assert.equal(await completedResult(file),null);
    const full=row("model-one","A",5);await writeFile(file,JSON.stringify(full));assert.deepEqual(await completedResult(file),full);
    await writeFile(file,'{"status":');assert.equal(await completedResult(file),null);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test("evaluator rejects a task symlink before reading or overlaying host files",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"ubm-link-test-"));
  try{
    await symlink("/opt/task/node_modules",join(dir,"node_modules"));await auditLinks(dir);
    await mkdir(join(dir,"test"));await symlink("/home/host-private",join(dir,"test","escape"));
    await assert.rejects(auditLinks(dir),/WORKSPACE_ISOLATION_BLOCKED/);
    await rm(join(dir,"test","escape"));await rm(join(dir,"node_modules"));await mkdir(join(dir,"node_modules"));
    await assert.rejects(auditLinks(dir),/dependency entry changed/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test("first failing test proof requires the same failing assertion to pass at final commit",()=>{
  const red={numTotalTests:2,numFailedTests:1,numPassedTests:1,testResults:[{assertionResults:[{fullName:"regression",status:"failed"},{fullName:"existing",status:"passed"}]}]};
  const green={numTotalTests:2,numFailedTests:0,numPassedTests:2,testResults:[{assertionResults:[{fullName:"regression",status:"passed"},{fullName:"existing",status:"passed"}]}]};
  assert(firstTestProof(red,green));
  assert.equal(firstTestProof(red,{...green,testResults:[{assertionResults:[{fullName:"existing",status:"passed"}]}]}),false);
  assert.equal(firstTestProof({...red,numFailedTests:0},green),false);
});
test("dependency preflight rejects a post-fix copy even alongside a pre-fix copy",()=>{
  const baseline={ufo:"1.6.3",defu:"6.1.4"};
  assertDependencyBaselines([{name:"ufo",version:"1.6.3"},{name:"defu",version:"6.1.4"}],baseline);
  assert.throws(()=>assertDependencyBaselines([{name:"ufo",version:"1.6.3"},{name:"ufo",version:"1.6.4"}],baseline),/REFERENCE_ISOLATION_BLOCKED/);
  assert.throws(()=>assertDependencyBaselines([{name:"defu",version:"6.1.7"}],baseline),/REFERENCE_ISOLATION_BLOCKED/);
  assert.throws(()=>assertDependencyBaselines([{name:"defu"}],baseline));
});
