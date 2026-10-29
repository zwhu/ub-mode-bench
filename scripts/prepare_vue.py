#!/usr/bin/env python3
"""Prepare the approved Vue task from already verified official archives."""
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TASK_ID = "vue-template-cache"
BASE = "c04a45d15498ebba0de3ceae674b88ac43cb9e76"
FIX = "a4440c01b96798a23bef12cb6f9ada5ffaba0d3a"
ARCHIVES = Path("/tmp/ubm-next-candidates/vue-fixed")
env = {k: v for k, v in os.environ.items() if not k.startswith(("GIT_CONFIG_", "TRAE_GIT_"))}


def extract(archive, dest, expected):
    with tarfile.open(archive) as data:
        assert data.pax_headers["comment"] == expected
        for member in data.getmembers():
            parts = Path(member.name).parts[1:]
            if not parts:
                continue
            assert ".." not in parts and not Path(*parts).is_absolute()
            if member.isfile():
                path = dest.joinpath(*parts)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data.extractfile(member).read())


def prepare():
    task = ROOT / "tasks" / TASK_ID
    gold = ROOT / "gold" / TASK_ID
    task.mkdir(exist_ok=True)
    gold.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="ubm-vue-prepare-") as directory:
        base, fixed = Path(directory) / "base", Path(directory) / "fixed"
        extract(ARCHIVES / "15136-base.tar.gz", base, BASE)
        extract(ARCHIVES / "15136-fixed.tar.gz", fixed, FIX)
        for path in list(base.rglob("*")):
            if (path.name == ".github" or path.name.lower().startswith("changelog")) and path.is_dir():
                shutil.rmtree(path)
            elif path.is_file() and path.name.lower().startswith("changelog"):
                path.unlink()
        # Mutation workers must resolve source aliases in their private cwd.
        aliases = base / "scripts/aliases.js"
        text = aliases.read_text()
        original = """path.resolve(
    fileURLToPath(import.meta.url),
    `../../packages/${p}/src/index.ts`,
  )"""
        assert original in text
        aliases.write_text(text.replace(original, "path.resolve(process.cwd(), `packages/${p}/src/index.ts`)"))
        git = lambda *args: subprocess.check_output([
            "git", "-C", str(base), "-c", "core.hooksPath=/dev/null", "-c", "user.name=benchmark",
            "-c", "user.email=benchmark@localhost", *args], env=env)
        git("init", "-q")
        git("add", ".")
        git("commit", "-qm", "Benchmark fixture")
        with tarfile.open(task / "base.tar.gz", "w:gz") as data:
            for path in sorted(base.iterdir()):
                if path.name != ".git":
                    data.add(path, arcname=path.name)
        source = "packages/compiler-sfc/src"
        for path in (fixed / source).rglob("*"):
            if path.is_file():
                dest = base / path.relative_to(fixed)
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(path.read_bytes())
        git("add", "-N", source)
        (gold / "reference.patch").write_bytes(git("diff", "HEAD", "--", source))
        hidden = gold / "hidden_tests/packages/compiler-sfc/__tests__"
        hidden.mkdir(parents=True, exist_ok=True)
        adapted = Path("/tmp/ubm-next-candidates/vue-15136-fixed-hidden/packages/compiler-sfc/__tests__/compileScript.spec.ts")
        (hidden / "compileScript.spec.ts").write_bytes(adapted.read_bytes())
    (gold / "source.json").write_text(json.dumps({"repo": "https://github.com/vuejs/core", "pr": "https://github.com/vuejs/core/pull/15136",
        "title": "fix(compiler-sfc): handle transformed template AST after cache invalidation", "base": BASE, "fixed": FIX,
        "hidden_files": ["packages/compiler-sfc/__tests__/compileScript.spec.ts"],
        "fixture_adapter": "scripts/aliases.js resolves from cwd for mutation workers; no production source change",
        "hidden_adapter": "Evict the existing 500-entry LRU with 501 public compilations instead of importing a new cache export"}, indent=2))
    public = "node_modules/.bin/vitest run --project unit packages/compiler-sfc/__tests__ --maxWorkers=2"
    allowed = ["packages/compiler-sfc/src/**", "packages/compiler-sfc/__tests__/**", "ACTION_LOG.md", "WORK_LOG.md"]
    digest = lambda value: "sha256:" + hashlib.sha256(value.encode()).hexdigest()
    (task / "task.yaml").write_text(json.dumps({"id": TASK_ID, "category": "bug_fix", "language": "ts", "difficulty": "hard",
        "upstream": {"repo_hash": digest("vuejs/core"), "base_sha_hash": digest(BASE), "pr_url_encrypted": "enc:local-gold-only", "license": "MIT"},
        "constraints": {"allowed_paths": allowed, "forbidden_paths": [], "time_budget_sec": 1800, "token_budget": 1000000, "network": "none"},
        "evaluation": {"public_tests": [public], "hidden_tests_ref": f"gold://{TASK_ID}/hidden_tests",
                       "gates": {"crap_max": 10, "dup_threshold": 0.8, "mutation_survivor_max": 0}},
        "image": "ub-mode-bench/vue-template-cache:2026-10-29-full-sfc", "test_project": "unit",
        "hidden_command": public,
        "coverage_command": public + " --coverage --coverage.reporter=lcov",
        "dependency_baselines": {name: "ABSENT" for name in ("vue", "@vue/compiler-sfc", "@vue/compiler-core", "@vue/compiler-dom", "@vue/compiler-ssr", "@vue/shared")}}, indent=2))
    (task / "prompt.md").write_text("""Repeated compilation of a TypeScript single-file component can lose imports that are used only by its template. The problem appears when a template has already been compiled/transformed and the template analysis cache entry is later evicted, so a subsequent script compilation re-analyzes that descriptor. Fix this across the compilation pipeline. Preserve normal repeated compilation, template-only imports, v-model target handling, custom compilers and compiler options (including delimiters), SSR mode, and SFC-relative source locations. Existing diagnostics and ordinary untransformed templates must keep their behavior.
""")
    (task / "allowed_paths.txt").write_text("\n".join(allowed) + "\n")
    (task / "setup.sh").write_text('''#!/usr/bin/env bash
set -euo pipefail
target="${1:?workspace}"
task_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
mkdir -p "$target"
tar -xzf "$task_dir/base.tar.gz" -C "$target"
''')
    (task / "setup.sh").chmod(0o755)
    dest = ROOT / "docker/vendor/vue-node-modules"
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree("/tmp/ubm-next-candidates/vue-validation-deps/node_modules", dest, symlinks=True)
    for name in (".vite", ".vite-temp"):
        shutil.rmtree(dest / name, ignore_errors=True)
    shutil.copyfile("/tmp/ubm-next-candidates/vue-validation-deps/pnpm-lock.yaml", ROOT / "docker/vendor/vue-deps-lock.yaml")
    print(f"Prepared {TASK_ID}; production sources from {BASE}, answers in gold only")


if __name__ == "__main__":
    prepare()
