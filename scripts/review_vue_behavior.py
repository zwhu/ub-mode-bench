#!/usr/bin/env python3
"""Recheck final workspaces with an implementation-independent hidden assertion."""
import concurrent.futures
import hashlib
import json
import os
import shlex
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path(os.environ.get("BENCH_ARTIFACTS_DIR", ROOT))


def main():
    phase = __import__("sys").argv[1]
    assert phase in ("vue-formal", "vue-calibration")
    out = ARTIFACTS / "reports/vue-2026-10-29" / phase / "behavioral-review"
    out.mkdir(parents=True, exist_ok=True)
    original = (ROOT / "gold/vue-template-cache/hidden_tests/packages/compiler-sfc/__tests__/compileScript.spec.ts").read_text()
    assertion = "      expect(descriptor.template!.ast!.transformed).toBe(true)\n"
    assert original.count(assertion) == 1
    test = original.replace(assertion, "")
    image = "ub-mode-bench/vue-template-cache:2026-10-29-full-sfc-gates"
    paths = sorted((ARTIFACTS / "runs" / phase).glob("*/result.json"))

    def review(path):
        row = json.loads(path.read_text())
        if not row["valid"]:
            return {"id": row["id"], "reviewed": False, "reason": "invalid run"}
        workspace = path.parent / "workspace"
        before = {str(p.relative_to(workspace)): hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in (workspace / "packages").rglob("*.ts") if "/src/" in str(p)}
        original_result = hashlib.sha256(path.read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory(prefix="ubm-behavior-") as temp:
            work = Path(temp) / "workspace"
            shutil.copytree(workspace, work, symlinks=True)
            (work / "packages/compiler-sfc/__tests__/compileScript.spec.ts").write_text(test)
            args = ["docker", "run", "--rm", "--network=none", "--cpus=2", "--memory=4096m", "--pids-limit=512",
                    "--user", f"{os.getuid()}:{os.getgid()}", "-v", f"{work}:{work}:rw", "-v", f"{out}:/evidence:rw",
                    "-w", str(work), image, "node_modules/.bin/vitest", "run", "--project", "unit",
                    "packages/compiler-sfc/__tests__", "--maxWorkers=2", "--reporter=json",
                    f"--outputFile=/evidence/{row['id']}.json"]
            process = subprocess.run(["sg", "docker", "-c", shlex.join(args)], capture_output=True, text=True, timeout=180)
            (out / f"{row['id']}.log").write_text(process.stdout + "\n" + process.stderr)
            report_path = out / f"{row['id']}.json"
            assert report_path.exists(), f"no assertion report for {row['id']}"
            report = json.loads(report_path.read_text())
            target = [a for r in report["testResults"] for a in r["assertionResults"]
                      if a["title"] == "should re-analyze a transformed template after cache invalidation"]
            assert len(target) == 1 and target[0]["status"] in ("passed", "failed"), row["id"]
            assert report["numTotalTests"] > 0
        after = {str(p.relative_to(workspace)): hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in (workspace / "packages").rglob("*.ts") if "/src/" in str(p)}
        assert before == after and original_result == hashlib.sha256(path.read_bytes()).hexdigest()
        return {"id": row["id"], "reviewed": True, "passed": process.returncode == 0 and report["numFailedTests"] == 0,
                "target_passed": target[0]["status"] == "passed", "passed_tests": report["numPassedTests"],
                "failed_tests": report["numFailedTests"], "original_hidden_passed": row["metrics"]["hidden_tests_passed"],
                "production_and_result_unchanged": True, "log": str(out / f"{row['id']}.log")}

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(review, paths))
    (out / "summary.json").write_text(json.dumps({"checked_at": datetime.now(timezone.utc).isoformat(), "phase": phase,
        "removed_implementation_assertion": assertion.strip(), "test_sha256": hashlib.sha256(test.encode()).hexdigest(),
        "network": "none", "image": image, "rows": results}, indent=2))
    print(f"Behavioral recheck: {sum(bool(r.get('passed')) for r in results)}/{len(results)} passed")


if __name__ == "__main__":
    main()
