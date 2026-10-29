#!/usr/bin/env tsx
import { Command } from "commander";
import pLimit from "p-limit";
import { mkdir, writeFile, rm, rename, statfs } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { loadBenchConfig, loadTask } from "./config.ts";
import { matrix, MODELS } from "./matrix.ts";
import { startSandbox } from "./isolate.ts";
import { runAgent, hostAuth } from "./run_agent.ts";
import { collect } from "./collect.ts";
import { completedResult, ResultSchema } from "./result.ts";
import { appendFile } from "node:fs/promises";

const program = new Command();
program.name("ub-mode-bench").command("run")
  .option("--tasks <ids>","comma-separated tasks","url-base-slashes,defaults-safe-copy,path-network-root")
  .option("--variants <ids>","A,C","A,C")
  .option("--models <ids>","comma-separated models",Object.keys(MODELS).join(","))
  .option("--seeds <n>","seeds per combination",Number)
  .option("--phase <id>","stable run namespace","formal")
  .option("--config <path>","config path","bench.yaml")
  .option("--dry-run","only print the matrix")
  .option("--no-retry","disable infrastructure retry when replaying a previously attempted run")
  .action(async opts=>{
    const cfg=loadBenchConfig(opts.config);
    if(!/^[a-z0-9-]+$/.test(opts.phase))throw new Error("invalid phase");
    const jobs=matrix(opts.tasks.split(","),opts.variants.split(","),opts.models.split(","),opts.seeds??cfg.run.default_seeds);
    if(opts.dryRun){for(const job of jobs)console.log(JSON.stringify(job));console.log(`total=${jobs.length}`);return;}
    const root=resolve("runs",opts.phase);await mkdir(root,{recursive:true});
    let done=0,valid=0,failures=0,stop:string|null=null;
    const cli=cfg.agent.adapters[cfg.agent.default]?.cmd[0];if(!cli)throw new Error("missing CLI");
    // Refresh is serialized on the host before spawning any executor.
    await hostAuth(cli,root);
    const limit=pLimit(Math.min(2,cfg.run.parallelism));
    await Promise.all(jobs.map(job=>limit(async()=>{
      const out=join(root,job.id);
      const previous=await completedResult(join(out,"result.json"));
      if(previous){console.log(`[skip] ${job.id}`);done++;if(previous.valid)valid++;return;}
      if(stop) return;
      const disk=await statfs("/data00");
      if(disk.bavail*disk.bsize<30*1024**3){stop="/data00 free space below 30G";return;}
      await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
      console.log(`[start] ${job.id}`);
      let lastError="",attempts=0;
      const maxAttempts=opts.retry?2:1;
      for(let attempt=1;attempt<=maxAttempts;attempt++){
        attempts=attempt;
        if(attempt>1){await rename(out,`${out}-infra-attempt-1`);await mkdir(out,{recursive:true});}
        let handle:Awaited<ReturnType<typeof startSandbox>>|undefined;
        try {
          // Check expires_at on every run. The host is the single refresh owner.
          await hostAuth(cli,out);
          const task=loadTask(`tasks/${job.task}/task.yaml`);
          const t=performance.now();handle=await startSandbox(task,job,cfg,out);
          const agent=await runAgent(handle,task,job,cfg,out,Math.max(1,cfg.run.task_timeout_sec*1000-(performance.now()-t)));
          if(agent.exitCode!==0||!agent.stdout.includes('"type":"turn.completed"'))throw new Error("agent infrastructure invocation failed");
          const result=ResultSchema.parse(await collect(handle,task,job,agent.stdout,agent.exitCode,performance.now()-t,out,attempt));
          await writeFile(join(out,"result.tmp"),JSON.stringify(result,null,2));await rename(join(out,"result.tmp"),join(out,"result.json"));
          failures=0;done++;if(result.valid)valid++;console.log(`[done] ${job.id} valid=${result.valid} hidden=${result.metrics.hidden_tests_passed}`);
          if(done%6===0){await appendFile("reports/overnight/PROGRESS.md",`[${new Date().toISOString()}] ${opts.phase==="smoke"?"S4":"S5"} | IN_PROGRESS | ${done}/${jobs.length} runs have complete results | ${root}\n`);
            const {readFile}=await import("node:fs/promises");const s=await readFile("HANDOFF.md","utf8");
            await writeFile("HANDOFF.md",s.replace(/- 运行进度：.*\n/g,"").replace("## 2. 当前状态\n",`## 2. 当前状态\n\n- 运行进度：${opts.phase} ${done}/${jobs.length}，UTC ${new Date().toISOString()}。\n`));}
          return;
        }catch(e){
          lastError=String(e);await writeFile(join(out,"infrastructure-error.txt"),lastError);failures++;
          if(lastError.includes("HOST_AUTH_BLOCKED")||lastError.includes("ISOLATION_BLOCKED")||failures>=3){stop=lastError;break;}
          // A task deadline is a terminal invalid sample; only infrastructure
          // failures receive the single retry.
          if(typeof e==="object"&&e!==null&&"timedOut" in e&&e.timedOut===true)break;
        }finally{await handle?.destroy();}
      }
      const empty={public_tests_passed:null,hidden_tests_passed:null,crap_max:null,crap_mean:null,dup_pairs_over_threshold:null,mutation_survivors:null,
        diff_lines:0,commits:0,first_commit_is_failing_test:null,wallclock_ms:0,exit_code:1};
      await writeFile(join(out,"result.json"),JSON.stringify(ResultSchema.parse({...job,status:"invalid",valid:false,invalid_reasons:[lastError],
        metrics:empty,null_reasons:{all:lastError},skill_evidence:[],available_skills:[],base:"",commit_sequence:[],finished_at:new Date().toISOString(),attempts}),null,2));
      done++;
    })));
    await writeFile(join(root,"batch-status.json"),JSON.stringify({total:jobs.length,done,valid,stop,status:stop?"BLOCKED":valid<jobs.length*0.9?"LIMITED":"PASS_CANDIDATE"},null,2));
    if(stop)throw new Error(`BLOCKED: ${stop}`);
  });
await program.parseAsync(process.argv);
