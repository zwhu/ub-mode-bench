import { cp, mkdir, readFile, rm, writeFile, mkdtemp, readdir, lstat, readlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";
import type { Task } from "./schema.ts";
import type { SandboxHandle } from "./isolate.ts";
import type { Job } from "./matrix.ts";
import { docker, quote, cleanEnvironment } from "./process.ts";
import { parseCrap, parseDry, parseMutationResult, parseEvents, skillCatalog, firstTestProof, type TestReport, type Metrics, type Result } from "./result.ts";

async function git(workdir: string, ...args: string[]) {
  const r = await execa("git", ["-C", workdir, "-c", "core.hooksPath=/dev/null", ...args], {
    env: cleanEnvironment(), extendEnv: false, reject: false });
  if (r.exitCode !== 0) throw new Error(`git ${args[0]}: ${r.stderr}`);
  return r.stdout;
}
export async function auditLinks(root: string, path = root): Promise<void> {
  if(path===root){
    const entry=await lstat(join(root,"node_modules")).catch(()=>null);
    if(!entry?.isSymbolicLink()||await readlink(join(root,"node_modules"))!=="/opt/task/node_modules"){
      throw new Error("WORKSPACE_ISOLATION_BLOCKED: preinstalled dependency entry changed");
    }
  }
  for(const file of await readdir(path)){
    const full=join(path,file),info=await lstat(full);
    if(info.isSymbolicLink()){
      if(full===join(root,"node_modules")&&await readlink(full)==="/opt/task/node_modules")continue;
      throw new Error(`WORKSPACE_ISOLATION_BLOCKED: unexpected symlink ${full}`);
    }
    if(info.isDirectory())await auditLinks(root,full);
  }
}
async function testInImage(work: string, image: string, command: string, out: string, label: string, deadline=Infinity) {
  const limit=Math.max(1,Math.min(180,Math.floor((deadline-performance.now())/1000)));
  const r = await docker(["run", "--rm", "--pull=never", "--network=none", "--cpus=2", "--memory=4096m", "--pids-limit=512",
    "--user", `${process.getuid!()}:${process.getgid!()}`,
    "-v", `${work}:${work}:rw`, "-w", work, image, "timeout",String(limit),"bash", "-c", command], (limit+15)*1000);
  await writeFile(join(out, `${label}.log`), r.stdout + "\n" + r.stderr);
  return r;
}
export async function collect(handle: SandboxHandle, task: Task, job: Job, stdout: string, exitCode: number, wallclock: number, out: string, attempts: number): Promise<Result> {
  const deadline=performance.now()+Math.max(0,1800_000-wallclock);
  const final = join(out, "workspace");
  await cp(handle.workdir, final, { recursive: true, dereference: false });
  await auditLinks(final);
  const diff = await git(final, "diff", handle.base, "--numstat");
  const diffLines = diff.split("\n").reduce((sum, line) => {
    const [add, del] = line.split("\t"); return sum + (Number(add) || 0) + (Number(del) || 0);
  }, 0);
  const trackedChanged = (await git(final, "diff", handle.base, "--name-only")).split("\n").filter(Boolean);
  const untracked = (await git(final, "ls-files", "--others", "--exclude-standard")).split("\n").filter(Boolean);
  let extraLines = 0;
  for (const file of untracked) {
    const text=await readFile(join(final,file),"utf8");extraLines+=(text.match(/\n/g)?.length??0)+(text&&!text.endsWith("\n")?1:0);
  }
  const commits = (await git(final, "rev-list", "--reverse", `${handle.base}..HEAD`)).split("\n").filter(Boolean);
  const sequence = [];
  for (const sha of commits) sequence.push({ sha, message: await git(final, "show", "-s", "--format=%B", sha),
    files: (await git(final, "diff-tree", "--no-commit-id", "--name-only", "-r", sha)).split("\n").filter(Boolean) });
  const scratch = await mkdtemp(join(tmpdir(), "ubm-score-"));
  const image = `${task.image!}-gates`;
  const reasons: Record<string,string> = {};
  let publicOk: boolean | null = null, hiddenOk: boolean | null = null, crap: {max:number;mean:number} | null = null;
  let duplication: number | null = null, mutation: number | null = null, firstTest: boolean | null = false;
  try {
    const work = join(scratch,"gates"); await cp(final, work, { recursive:true });
    const pub = await testInImage(work, image, task.evaluation.public_tests.join(" && "), out,"public-tests",deadline);
    publicOk = pub.exitCode === 0;
    const hidden = join(scratch,"hidden"); await cp(final, hidden, {recursive:true});
    await cp(resolve(`gold/${task.id}/hidden_tests`), hidden, {recursive:true});
    const h = await testInImage(hidden,image,task.hidden_command!,out,"hidden-tests",deadline); hiddenOk=h.exitCode===0;
    // The disposable evaluator HEAD points to the known base, so --changed
    // includes every final source edit even when the agent committed it.
    await git(work,"update-ref","HEAD",handle.base);
    await rm(join(work,".metrics"),{recursive:true,force:true});
    await rm(join(work,"coverage"),{recursive:true,force:true});
    const cov = await testInImage(work,image,task.coverage_command!,out,"coverage",deadline);
    const coverageReady = cov.exitCode === 0;
    const tool = async (args: string[], label: string, requestedLimit: number) => {
      const limit=Math.max(1,Math.min(requestedLimit,Math.floor((deadline-performance.now())/1000)));
      const r=await docker(["run","--rm","--pull=never","--network=none","--cpus=2","--memory=4096m","--pids-limit=512",
        "--user",`${process.getuid!()}:${process.getgid!()}`,
        "-v",`${work}:${work}:rw`,"-w",work,image,"timeout",String(limit),...args],(limit+15)*1000);
      await writeFile(join(out,`${label}.log`),r.stdout+"\n"+r.stderr);return r;
    };
    const cr=await tool(["crapper","--changed","--threshold","10", coverageReady?"--use-existing-coverage":"--no-coverage"],"crapper",180);
    if (cr.exitCode===0||cr.exitCode===2) {
      try {crap=parseCrap(await readFile(join(work,".metrics/crap.edn"),"utf8"));}
      catch { if (![...trackedChanged,...untracked].some(f=>f.startsWith("src/"))) crap={max:0,mean:0}; }
    }
    if(!crap) reasons.crap="coverage unavailable or crapper failed; see coverage.log and crapper.log";
    const dr=await tool(["dryer","--changed","--threshold","0.8"],"dryer",180);
    if(dr.exitCode===0) { try {duplication=parseDry(await readFile(join(work,".metrics/dry.edn"),"utf8"));} catch {reasons.dup_pairs_over_threshold="dryer report missing or invalid";} }
    if(duplication===null) reasons.dup_pairs_over_threshold="dryer failed; see dryer.log";
    const mu=await tool(["mutator","--changed","--test-command",task.evaluation.public_tests.join(" && "),
      coverageReady?"--use-existing-coverage":"--no-coverage"],"mutator",1200);
    mutation=parseMutationResult(mu.exitCode,mu.stdout);
    if(mutation===null) reasons.mutation_survivors=mu.exitCode===124?"mutation reached its 20-minute cap or the remaining 30-minute run deadline":reasons.mutation_survivors??"mutator failed; see mutator.log";
    await cp(join(work,".metrics"),join(out,"gate-metrics"),{recursive:true}).catch(()=>{});
    const first=sequence[0];
    if(first && first.files.length>0 && first.files.every(f=>/^test\/.+\.(?:test|spec)\.[cm]?[jt]sx?$/.test(f))) {
      const firstDir=join(scratch,"first-commit");await mkdir(firstDir);
      const tar=await execa("git",["-C",final,"archive",first.sha],{encoding:"buffer"});
      await execa("tar",["-xf","-","-C",firstDir],{input:tar.stdout});
      await execa("ln",["-s","/opt/task/node_modules",join(firstDir,"node_modules")]);
      const files=first.files.join(" ");
      const a=await testInImage(firstDir,image,`node_modules/.bin/vitest run ${files} --reporter=json --outputFile=${quote(join(firstDir,"first.json"))}`,out,"first-commit-tests",deadline);
      const finalCommitDir=join(scratch,"final-commit");await mkdir(finalCommitDir);
      const head=await execa("git",["-C",final,"archive","HEAD"],{encoding:"buffer"});
      await execa("tar",["-xf","-","-C",finalCommitDir],{input:head.stdout});
      await execa("ln",["-s","/opt/task/node_modules",join(finalCommitDir,"node_modules")]);
      const b=await testInImage(finalCommitDir,image,`node_modules/.bin/vitest run ${files} --reporter=json --outputFile=${quote(join(finalCommitDir,"first-final.json"))}`,out,"first-commit-final-tests",deadline);
      try {
        const red=JSON.parse(await readFile(join(firstDir,"first.json"),"utf8")) as TestReport;
        const green=JSON.parse(await readFile(join(finalCommitDir,"first-final.json"),"utf8")) as TestReport;
        firstTest=a.exitCode!==0&&b.exitCode===0&&firstTestProof(red,green);
        await writeFile(join(out,"first-commit-proof.json"),JSON.stringify({red,green},null,2));
      } catch {firstTest=null;reasons.first_commit_is_failing_test="test replay produced no assertion report";}
    }
  } finally { await rm(scratch,{recursive:true,force:true}); }
  const events=parseEvents(stdout);
  const context=JSON.parse(await readFile(join(out,"context.json"),"utf8")) as {content:{text?:string}[]}[];
  const skills=skillCatalog(context.flatMap(x=>x.content).map(x=>x.text??"").join("\n"));
  const invalid:string[]=[];
  if(!events.completed||exitCode!==0) invalid.push("agent invocation incomplete or failed");
  if(job.variant==="C"&&!events.skillEvidence.length) invalid.push("C has no ub-mode loading event");
  if(job.variant==="A"&&skills.length) invalid.push("A loaded skills");
  if([...trackedChanged,...untracked].some(f=>!f.startsWith("src/")&&!f.startsWith("test/")&&!['ACTION_LOG.md','WORK_LOG.md'].includes(f))) invalid.push("changed a forbidden path");
  const metrics:Metrics={public_tests_passed:publicOk,hidden_tests_passed:hiddenOk,crap_max:crap?.max??null,crap_mean:crap?.mean??null,
    dup_pairs_over_threshold:duplication,mutation_survivors:mutation,diff_lines:diffLines+extraLines,commits:commits.length,
    first_commit_is_failing_test:firstTest,wallclock_ms:wallclock,exit_code:exitCode};
  return {...job,status:events.completed?"completed":"invalid",valid:!invalid.length,invalid_reasons:invalid,metrics,
    null_reasons:reasons,skill_evidence:events.skillEvidence,available_skills:skills,base:handle.base,commit_sequence:sequence,
    finished_at:new Date().toISOString(),attempts};
}
