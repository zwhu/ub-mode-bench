#!/usr/bin/env python3
"""Build the three exact upstream sources into offline pip wheels."""
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
lock = json.loads((root / "docker/tools.lock.json").read_text())
dest = root / "docker/vendor/wheels"
dest.mkdir(parents=True, exist_ok=True)
for name in ["crapper", "dryer", "mutator"]:
    repo = Path("/tmp/ubm-upstream") / name
    actual = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"]).decode().strip()
    if actual != lock[name]:
        raise ValueError(f"{name}: expected {lock[name]}, found {actual}")
    if subprocess.check_output(["git", "-C", str(repo), "status", "--porcelain"]).strip():
        # pip build artifacts are untracked and contain no source edits.
        status = subprocess.check_output(["git", "-C", str(repo), "diff", "HEAD", "--stat"]).strip()
        if status:
            raise ValueError(f"{name}: modified upstream source")
    subprocess.run(["python3", "-m", "pip", "wheel", "--no-deps", "--no-build-isolation", "--wheel-dir", str(dest), str(repo)], check=True)
libs = root / "docker/vendor/parser-libs"
libs.mkdir(parents=True, exist_ok=True)
for language, repository, subdir in [("typescript", "typescript", "typescript/src"), ("tsx", "typescript", "tsx/src"), ("javascript", "javascript", "src")]:
    repo = Path("/tmp/ubm-grammars") / repository
    actual = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"]).decode().strip()
    if actual != lock[f"tree-sitter-{repository}"]:
        raise ValueError(f"{repository}: wrong grammar source")
    source = repo / subdir
    subprocess.run(["gcc", "-shared", "-fPIC", "-O2", "-I", str(source), str(source / "parser.c"), str(source / "scanner.c"),
                    "-o", str(libs / f"libtree_sitter_{language}.so")], check=True)
