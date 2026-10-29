#!/usr/bin/env python3
"""Verify Vue repairs with pristine tests/config and only submitted production sources."""
import concurrent.futures
import hashlib
import json
import os
import secrets
import shlex
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path(os.environ.get("BENCH_ARTIFACTS_DIR", ROOT))
OUT = ARTIFACTS / "reports/vue-2026-10-29/source-only-replay"
IMAGE = "ub-mode-bench/vue-template-cache:2026-10-29-full-sfc-gates"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    token = secrets.token_hex(5)
    # Names and component inputs are generated after model execution, not shown to it.
    test = '''import { compileScript, compileTemplate, parse } from '../src'
describe('independent post-submission cache regression', () => {
  test.each([false, true])('keeps new template-only bindings after eviction (ssr=%s)', ssr => {
    const name = 'binding_TOKEN_' + (ssr ? 'server' : 'client')
    const delimiters: [string, string] = ['[[', ']]']
    const source = `<script setup lang="ts">import { ${name} } from './postSubmissionModule'</script>\n<template><section>[[ ${name} ]]</section></template>`
    const { descriptor } = parse(source, { templateParseOptions: { delimiters } })
    const templateOptions = { compilerOptions: { delimiters }, ssr }
    const first = compileScript(descriptor, { id: 'postSubmission', templateOptions })
    expect(first.content).toContain(`get ${name}() { return ${name} }`)
    const template = compileTemplate({ filename: 'PostSubmission.vue', id: 'postSubmission',
      source: descriptor.template!.content, ast: descriptor.template!.ast,
      compilerOptions: { delimiters }, ssr, ssrCssVars: [] })
    expect(template.errors).toEqual([])
    for (let i = 0; i < 501; i++) {
      const filler = parse(`<script setup lang="ts">import { other } from './other'</script><template>{{ other }} TOKEN_${ssr}_${i}</template>`).descriptor
      compileScript(filler, { id: 'eviction' })
    }
    const repeated = compileScript(descriptor, { id: 'postSubmission', templateOptions })
    expect(repeated.content).toContain(`get ${name}() { return ${name} }`)
    expect(repeated.imports![name].isUsedInTemplate).toBe(true)
  })
})
'''.replace("TOKEN", token)
    (OUT / "post-submission-regression.spec.ts").write_text(test)
    snapshots = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (ARTIFACTS / "runs/vue-formal").glob("*/result.json")}

    def run(label, submitted=None, reference=False):
        with tempfile.TemporaryDirectory(prefix="ubm-pristine-") as temp:
            work = Path(temp) / "workspace"
            subprocess.run(["bash", str(ROOT / "tasks/vue-template-cache/setup.sh"), str(work)], check=True)
            if submitted:
                source = submitted / "packages/compiler-sfc/src"
                assert not any(p.is_symlink() for p in source.rglob("*"))
                shutil.rmtree(work / "packages/compiler-sfc/src")
                shutil.copytree(source, work / "packages/compiler-sfc/src")
            if reference:
                subprocess.run(["git", "apply", str(ROOT / "gold/vue-template-cache/reference.patch")], cwd=work, check=True)
            (work / "node_modules").symlink_to("/opt/task/node_modules")
            (work / "packages/compiler-sfc/__tests__/post-submission-regression.spec.ts").write_text(test)
            args = ["docker", "run", "--rm", "--network=none", "--cpus=2", "--memory=4096m", "--pids-limit=512",
                    "--user", f"{os.getuid()}:{os.getgid()}", "-v", f"{work}:{work}:rw", "-v", f"{OUT}:/evidence:rw",
                    "-w", str(work), IMAGE, "node_modules/.bin/vitest", "run", "--project", "unit",
                    "packages/compiler-sfc/__tests__", "--maxWorkers=2", "--reporter=json", f"--outputFile=/evidence/{label}.json"]
            process = subprocess.run(["sg", "docker", "-c", shlex.join(args)], capture_output=True, text=True, timeout=180)
            (OUT / f"{label}.log").write_text(process.stdout + "\n" + process.stderr)
            report = json.loads((OUT / f"{label}.json").read_text())
            cases = [a for r in report["testResults"] for a in r["assertionResults"]
                     if "independent post-submission cache regression" in a["fullName"]]
            assert len(cases) == 2 and all(a["status"] in ("passed", "failed") for a in cases), label
            passed = sum(a["status"] == "passed" for a in cases)
            result = {"id": label, "exit_code": process.returncode, "passed_tests": report["numPassedTests"],
                      "failed_tests": report["numFailedTests"], "new_cases_passed": passed,
                      "passed": process.returncode == 0 and report["numFailedTests"] == 0,
                      "pristine_original_tests_and_configuration": True, "network": "none"}
            print(f"{label}: pass={result['passed']} original+new={result['passed_tests']} newCases={passed}/2", flush=True)
            return result

    base = run("negative-base")
    fixed = run("positive-reference", reference=True)
    assert not base["passed"] and base["new_cases_passed"] == 0 and base["passed_tests"] == 469 and base["failed_tests"] == 2
    assert fixed["passed"] and fixed["new_cases_passed"] == 2
    paths = sorted((ARTIFACTS / "runs/vue-formal").glob("*/result.json"))
    assert len(paths) == 18
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda path: run(path.parent.name, path.parent / "workspace"), paths))
    assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest() == sha for p, sha in snapshots.items())
    (OUT / "summary.json").write_text(json.dumps({"checked_at": datetime.now(timezone.utc).isoformat(), "test_sha256": hashlib.sha256(test.encode()).hexdigest(),
        "input_token_generated_after_models": token, "base_control": base, "reference_control": fixed, "rows": results,
        "original_results_unchanged": True, "source_only_overlay": "packages/compiler-sfc/src", "model_tests_and_config_not_used": True}, indent=2))


if __name__ == "__main__":
    main()
