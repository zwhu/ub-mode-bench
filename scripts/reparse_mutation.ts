#!/usr/bin/env tsx
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseMutation } from "../runners/result.ts";
const root="runs/smoke";
for(const dir of await readdir(root,{withFileTypes:true})){
  if(!dir.isDirectory())continue;
  const path=join(root,dir.name);
  try{
    const result=JSON.parse(await readFile(join(path,"result.json"),"utf8"));
    if(result.metrics.mutation_survivors!==null)continue;
    const text=await readFile(join(path,"mutator.log"),"utf8");
    if(result.null_reasons.mutation_survivors?.includes("20 minutes"))continue;
    const count=parseMutation(text);
    await writeFile(join(path,"result-before-mutation-reparse.json"),JSON.stringify(result,null,2));
    result.metrics.mutation_survivors=count;delete result.null_reasons.mutation_survivors;
    result.reparsed_mutation_reason="The fixed upstream exits 3 when survivors exist; complete Total row was retained in the original log.";
    await writeFile(join(path,"result.json"),JSON.stringify(result,null,2));
    console.log(dir.name,count);
  }catch{/* incomplete runs are untouched */}
}
