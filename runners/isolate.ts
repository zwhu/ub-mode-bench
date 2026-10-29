import { mkdtemp, rm, mkdir, readFile, writeFile, symlink, cp } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { execa } from "execa";
import type { Task, BenchConfig } from "./schema.ts";
import type { Job } from "./matrix.ts";
import { checkedDocker, docker, quote } from "./process.ts";
import { assertDependencyBaselines, dependencyProbeCode } from "./reference.ts";

export interface SandboxHandle {
  containerId: string; workdir: string; home: string; ip: string; base: string;
  image: string; destroy: () => Promise<void>;
}
export async function startSandbox(task: Task, job: Job, cfg: BenchConfig, runDir: string): Promise<SandboxHandle> {
  if (!task.image) throw new Error("task image missing");
  const workdir = await mkdtemp(join(tmpdir(), "ubm-run-"));
  await execa("bash", [`tasks/${task.id}/setup.sh`, workdir]);
  const home = resolve(runDir, "home");
  await mkdir(join(home, "cli"), { recursive: true });
  await symlink(join(homedir(), ".trae/cli/auth.json"), join(home, "cli/auth.json"));
  const skillMount: string[] = [];
  if (job.variant === "C") {
    const skill = join(home, "skills/ub-mode");
    await mkdir(skill, { recursive: true });
    await cp("/tmp/ubm-upstream/ub-mode/SKILL.md", join(skill, "SKILL.md"));
    skillMount.push("-v", `${skill}:${skill}:ro`);
  }
  const network=JSON.parse(await checkedDocker(["network", "inspect", "ubm-internal"])) as {Internal:boolean}[];
  if(network[0]?.Internal!==true)throw new Error("NETWORK_ISOLATION_BLOCKED: network is not internal");
  const image = job.variant === "C" ? `${task.image}-gates` : task.image;
  const containerId = await checkedDocker(["run", "-d", "--rm", "--pull=never", "--name", `ubm-${job.id.toLowerCase()}`,
    "--network=ubm-internal", `--cpus=${cfg.sandbox.cpus}`, `--memory=${cfg.sandbox.memory_mb}m`,
    "--user", `${process.getuid!()}:${process.getgid!()}`,
    "-e", "TRAE_HOME=/tmp/executor-home", "-e", "TRAECLI_HOME=/tmp/executor-home/cli",
    `--pids-limit=${cfg.sandbox.pids}`, "--cap-drop=ALL", "--security-opt=no-new-privileges",
    "--tmpfs=/tmp:rw,size=2048m", "-v", `${workdir}:${workdir}:rw`,
    "-v", `${resolve(homedir(), ".local/bin/traex")}:/usr/local/bin/traecli:ro`, ...skillMount, image,
    "sh", "-c", "mkdir -p /tmp/executor-home/cli && exec traecli exec-server --listen ws://0.0.0.0:4300"]);
  try {
    const ip = await checkedDocker(["inspect", containerId, "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}"]);
    let ready=false;
    for(let attempt=0;attempt<30;attempt++){
      ready=await new Promise<boolean>(resolve=>{
        const socket=createConnection({host:ip,port:4300});
        const finish=(value:boolean)=>{socket.destroy();resolve(value);};
        socket.setTimeout(500);socket.once("connect",()=>finish(true));socket.once("error",()=>finish(false));socket.once("timeout",()=>finish(false));
      });
      if(ready)break;
      await delay(1000);
    }
    if(!ready)throw new Error("exec-server not reachable after 30 readiness probes");
    const probe=await docker(["exec",containerId,"timeout","5","bash","-c","echo >/dev/tcp/1.1.1.1/443"],8000);
    await writeFile(resolve(runDir,"network.json"),JSON.stringify({internal:true,ip,probe_exit:probe.exitCode,
      mounts:JSON.parse(await checkedDocker(["inspect",containerId,"--format","{{json .Mounts}}"])),auth_mounted:false},null,2));
    if(probe.exitCode===0)throw new Error("NETWORK_ISOLATION_BLOCKED: outbound TCP succeeded");
    if(task.dependency_baselines){
      const copies=JSON.parse(await checkedDocker(["exec",containerId,"node","-e",dependencyProbeCode,JSON.stringify(Object.keys(task.dependency_baselines))]));
      await writeFile(resolve(runDir,"reference-check.json"),JSON.stringify({expected:task.dependency_baselines,copies},null,2));
      assertDependencyBaselines(copies,task.dependency_baselines);
    }
    const gitSetup = [
      `cd ${quote(workdir)}`, "ln -s /opt/task/node_modules node_modules",
      "git init -q", "git config user.name benchmark", "git config user.email benchmark@localhost",
      "git config core.hooksPath /dev/null", "git config commit.gpgsign false",
      "printf '\\nnode_modules/\\n.metrics/\\ncoverage/\\ntarget/\\nTASK.md\\nACTION_LOG.md\\n' >> .gitignore",
      "git add .", "git commit -qm 'Benchmark base'", "git rev-parse HEAD",
    ].join(" && ");
    const base = await checkedDocker(["exec", containerId, "bash", "-c", gitSetup]);
    await checkedDocker(["exec", containerId, "bash", "-c", `cd ${quote(workdir)} && git update-index --assume-unchanged .gitignore`]);
    return { containerId, workdir, home, ip, base, image,
      destroy: async () => { await docker(["rm", "-f", containerId]); await rm(workdir, { recursive: true, force: true });
        await rm(home, { recursive: true, force: true }); } };
  } catch (error) {
    await docker(["rm", "-f", containerId]); await rm(workdir, { recursive: true, force: true }); throw error;
  }
}
export function execInSandbox(handle: SandboxHandle, cmd: string[], timeout = 180_000) {
  return docker(["exec", "-w", handle.workdir, handle.containerId, ...cmd], timeout);
}
