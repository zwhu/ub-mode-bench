import { readdir, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { completedResult, type Result, type Metrics } from "../runners/result.ts";
import { diffStats } from "../runners/diff.ts";
import { artifactRoot } from "../runners/process.ts";
export const METRICS: (keyof Metrics)[]=["public_tests_passed","hidden_tests_passed","crap_max","crap_mean","dup_pairs_over_threshold","mutation_survivors","diff_lines","code_diff_lines","test_diff_lines","other_diff_lines","commits","first_commit_is_failing_test","wallclock_ms"];
export function aggregate(rows:Result[]) {
  return [...new Set(rows.map(r=>r.model))].map(model=>({model,metrics:Object.fromEntries(METRICS.map(metric=>{
    const group=(variant:"A"|"C")=>{
      const values=rows.filter(r=>r.valid&&r.model===model&&r.variant===variant&&r.metrics[metric]!==null)
        .map(r=>({task:r.task,seed:r.seed,value:Number(r.metrics[metric])}));
      return {mean:values.length?values.reduce((s,x)=>s+x.value,0)/values.length:null,n:values.length,values};
    };
    const A=group("A"),C=group("C");
    return [metric,{A,C,delta:C.mean!==null&&A.mean!==null?C.mean-A.mean:null}];
  }))}));
}
export async function collectRows(root:string){
  const rows:Result[]=[];
  for(const file of await readdir(root,{withFileTypes:true})){if(!file.isDirectory())continue;
    const r=await completedResult(join(root,file.name,"result.json"));if(!r)continue;
    const work=join(root,file.name,"workspace");
    // Backfill legacy metrics from retained workspaces without rewriting result.json.
    if([r.metrics.code_diff_lines,r.metrics.test_diff_lines,r.metrics.other_diff_lines].some(x=>x===null) &&
      await stat(work).then(s=>s.isDirectory(),e=>{if(e.code==="ENOENT")return false;throw e;})){
      const {files,...lines}=await diffStats(work,r.base);
      if(lines.diff_lines!==r.metrics.diff_lines)throw new Error(`Retained diff changed: ${r.id}`);
      Object.assign(r.metrics,lines);
    }
    rows.push(r);}
  return rows;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const p=new Command();p.option("--run <phase>","run phase","formal").option("--out <path>","output")
    .action(async o=>{o.out??=join(artifactRoot,`reports/overnight/${o.run}`);const rows=await collectRows(join(artifactRoot,"runs",o.run));await mkdir(o.out,{recursive:true});
      await writeFile(join(o.out,"aggregate.json"),JSON.stringify({valid:rows.filter(r=>r.valid).length,total:rows.length,models:aggregate(rows),invalid:rows.filter(r=>!r.valid)},null,2));
      const header="model,task,variant,seed,valid,"+METRICS.join(",");
      await writeFile(join(o.out,"raw.csv"),header+"\n"+rows.map(r=>[r.model,r.task,r.variant,r.seed,r.valid,...METRICS.map(k=>r.metrics[k]??"")].join(",")).join("\n")+"\n");
      console.log(`aggregate: ${o.out}/aggregate.json`);});await p.parseAsync(process.argv);
}
