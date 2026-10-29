#!/usr/bin/env python3
"""Materialize the reviewed source commits; answers stay in local gold/."""
import hashlib
import io
import json
import shutil
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    ("url-base-slashes", "ufo", "5cd9e676711af3f4e4b5398ddf6ca8d52c1c7e1f", 335,
     "Removing a URL base can produce a protocol-relative destination when the remaining path starts with repeated slashes. Normalize the leading separators of a successfully removed base to a single slash. Preserve the existing behavior for unrelated paths, segment boundaries, query strings, and external URLs."),
    ("defaults-safe-copy", "defu", "3942bfbbcaa72084bd4284846c83bd61ed7c8b29", 156,
     "Merging configuration defaults from JSON can give the result an attacker-controlled prototype. A JSON object with an own __proto__ property must not cause inherited values to override ordinary defaults. Fix the merge behavior while preserving precedence, nested defaults, arrays, custom mergers, and protection of Object.prototype."),
    ("path-network-root", "pathe", "b52fcacc59717a1e4a8783d4bbfae7fa81b4db07", 246,
     "Resolving a network share path loses its UNC root and turns it into an ordinary rooted path. resolve should retain the network root for both backslash and forward-slash UNC inputs, including relative segments appended to the share. Keep normal absolute roots, drive paths, relative paths, and cwd fallback behaving as before."),
]


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args])


def hashed(value):
    return "sha256:" + hashlib.sha256(value.encode()).hexdigest()


def prepare():
    for task_id, name, fixed, pr, prompt in SOURCES:
        repo = Path("/tmp/ubm-tasks") / name
        base = git(repo, "rev-parse", fixed + "^").decode().strip()
        task = ROOT / "tasks" / task_id
        gold = ROOT / "gold" / task_id
        task.mkdir(parents=True, exist_ok=True)
        (gold / "hidden_tests").mkdir(parents=True, exist_ok=True)
        patch = git(repo, "diff", base, fixed, "--", "src")
        (gold / "reference.patch").write_bytes(patch)
        files = git(repo, "diff", "--name-only", base, fixed, "--", "test").decode().splitlines()
        for file in files:
            dest = gold / "hidden_tests" / file
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(git(repo, "show", f"{fixed}:{file}"))
        title = git(repo, "show", "-s", "--format=%s", fixed).decode().strip()
        (gold / "source.json").write_text(json.dumps({
            "repo": f"https://github.com/unjs/{name}", "pr": f"https://github.com/unjs/{name}/pull/{pr}",
            "title": title, "base": base, "fixed": fixed,
            "commit_time": git(repo, "show", "-s", "--format=%cI", fixed).decode().strip(),
            "hidden_files": files,
        }, indent=2) + "\n")
        scratch = task / "base"
        if scratch.exists():
            shutil.rmtree(scratch)
        scratch.mkdir()
        with tarfile.open(fileobj=io.BytesIO(git(repo, "archive", base))) as archive:
            for member in archive.getmembers():
                if Path(member.name).is_absolute() or ".." in Path(member.name).parts or not (member.isfile() or member.isdir()):
                    raise ValueError(f"Unsafe archive member: {member.name}")
            archive.extractall(scratch)
        for path in sorted(scratch.rglob("*"), reverse=True):
            if path.name == ".github" or path.name.lower().startswith("changelog"):
                if path.is_dir():
                    shutil.rmtree(path)
                elif path.exists():
                    path.unlink()
        # No old dependency lock can expose release history. npm's resolved lock
        # is produced once during image construction and kept with build evidence.
        for file in ["pnpm-lock.yaml", "pnpm-workspace.yaml"]:
            (scratch / file).unlink(missing_ok=True)
        with tarfile.open(task / "base.tar.gz", "w:gz") as archive:
            for path in sorted(scratch.iterdir()):
                archive.add(path, arcname=path.name)
        (task / "prompt.md").write_text(prompt + "\n")
        (task / "allowed_paths.txt").write_text("src/**\ntest/**\n")
        (task / "setup.sh").write_text('''#!/usr/bin/env bash
set -euo pipefail
target="${1:?workspace}"
task_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
mkdir -p "$target"
tar -xzf "$task_dir/base.tar.gz" -C "$target"
''')
        (task / "setup.sh").chmod(0o755)
        # JSON is valid YAML and avoids a second Python YAML dependency.
        (task / "task.yaml").write_text(json.dumps({
            "id": task_id, "category": "bug_fix", "language": "ts", "difficulty": "easy",
            "upstream": {"repo_hash": hashed(f"unjs/{name}"), "base_sha_hash": hashed(base),
                         "pr_url_encrypted": "enc:local-gold-only", "license": "MIT"},
            "constraints": {"allowed_paths": ["src/**", "test/**", "ACTION_LOG.md", "WORK_LOG.md"], "forbidden_paths": [],
                            "time_budget_sec": 1800, "token_budget": 1000000, "network": "none"},
            "evaluation": {"public_tests": ["node_modules/.bin/vitest run"],
                           "hidden_tests_ref": f"gold://{task_id}/hidden_tests",
                           "gates": {"crap_max": 10, "dup_threshold": 0.8, "mutation_survivor_max": 0}},
            "image": f"ub-mode-bench/{task_id}:2026-10-29" + ("" if task_id == "path-network-root" else "-no-reference"),
            "dependency_baselines": {"pathe": "2.0.3"} if task_id == "path-network-root" else {"ufo": "1.6.3", "defu": "6.1.4"},
            "hidden_command": "node_modules/.bin/vitest run " + " ".join(files),
            "coverage_command": "node_modules/.bin/vitest run --coverage --coverage.reporter=lcov",
        }, indent=2) + "\n")
        print(task_id, base, "source lines", len(patch.splitlines()))


if __name__ == "__main__":
    prepare()
