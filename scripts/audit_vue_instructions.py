#!/usr/bin/env python3
"""Inventory instructions and inspect actual Vue run catalogs and tool events."""
import hashlib
import json
import os
import re
import subprocess
import tarfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path(os.environ.get("BENCH_ARTIFACTS_DIR", ROOT))
OUT = ARTIFACTS / "reports/vue-2026-10-29/instruction-audit"
NAMES = {"agents.md", "agents.override.md", "claude.md", "gemini.md", "skill.md", "copilot-instructions.md",
         ".cursorrules", ".windsurfrules", ".clinerules", ".aider.conf.yml", "opencode.json", "opencode.jsonc"}
DIRS = {".trae", ".claude", ".agents", ".codex", ".cursor", ".windsurf", ".continue", ".kilocode", ".opencode"}
FOREIGN = ("playwright-trace", "playwright-component-testing", "playwright-cli", "lib/tools/skills/", "ponytail/SKILL.md")


def instruction_file(path):
    parts = Path(path).parts
    return bool(parts and (parts[-1].lower() in NAMES or parts[-1].endswith(".mdc") or
                           any(p.lower() in DIRS for p in parts) or
                           str(path).lower().startswith((".github/instructions/", ".github/agents/", ".github/skills/"))))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    archives = []
    for path, strip in [(Path("/tmp/ubm-next-candidates/vue-fixed/15136-base.tar.gz"), True),
                        (Path("/tmp/ubm-next-candidates/vue-fixed/15136-fixed.tar.gz"), True),
                        (ROOT / "tasks/vue-template-cache/base.tar.gz", False)]:
        with tarfile.open(path) as archive:
            names = [m.name.split("/", 1)[-1] if strip else m.name for m in archive.getmembers() if m.isfile()]
            archives.append({"file": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                             "commit": archive.pax_headers.get("comment"), "file_count": len(names),
                             "instruction_files": [name for name in names if instruction_file(name)]})
    dependency_files = []
    vendor = ARTIFACTS / "docker/vendor/vue-node-modules"
    for directory, _, files in os.walk(vendor):
        for name in files:
            path = Path(directory) / name
            if name.lower() in NAMES or name.endswith(".mdc"):
                dependency_files.append({"path": str(path.relative_to(ARTIFACTS)), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    runs = []
    source = Path("/tmp/ubm-upstream/ub-mode/SKILL.md").read_text().strip()
    for phase in ("vue-calibration", "vue-formal"):
        for path in sorted((ARTIFACTS / "runs" / phase).glob("*/context.json")):
            context = json.loads(path.read_text())
            body = "\n".join(c.get("text", "") for item in context for c in item.get("content", []))
            catalog = re.findall(r"^- [^\n]+\(file: [^\n]+SKILL\.md\)$", body, re.M)
            variant = path.parent.name.split("--")[-2]
            expected = 0 if variant == "A" else 1
            events, delegation, foreign, loaded = [], [], [], []
            stream = path.parent / "events.jsonl"
            for line in stream.read_text().splitlines() if stream.exists() else []:
                try:
                    event = json.loads(line)
                except ValueError:
                    continue
                events.append(event)
                item = event.get("item", {})
                if event.get("type") == "item.completed" and item.get("type") == "collab_tool_call" and item.get("tool") == "spawn_agent" and item.get("status") == "completed":
                    delegation.append({"id": item.get("id"), "prompt": item.get("prompt"), "children": item.get("receiver_thread_ids")})
                if event.get("type") == "item.completed" and item.get("type") == "command_execution":
                    command = item.get("command", "")
                    output = item.get("aggregated_output", "")
                    if any(marker in command or marker in output for marker in FOREIGN):
                        foreign.append({"id": item.get("id"), "command": command, "status": item.get("status")})
                    if item.get("status") == "completed" and source in re.sub(r"^\d+\t", "", output, flags=re.M):
                        loaded.append(item.get("id"))
            result_path = path.parent / "result.json"
            baseline_files = []
            if result_path.exists():
                result = json.loads(result_path.read_text())
                if result.get("base") and (path.parent / "workspace/.git").exists():
                    names = subprocess.check_output(["git", "-C", str(path.parent / "workspace"), "ls-tree", "-r", "--name-only", result["base"]], text=True).splitlines()
                    baseline_files = [name for name in names if instruction_file(name)]
            catalog_ok = len(catalog) == expected and (not expected or "ub-mode" in catalog[0])
            runs.append({"phase": phase, "id": path.parent.name, "variant": variant, "catalog": catalog, "catalog_ok": catalog_ok,
                         "context_sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "baseline_instruction_files": baseline_files,
                         "foreign_skill_catalog": [s for s in catalog if "ub-mode" not in s], "foreign_skill_tool_reads": foreign,
                         "ub_mode_complete_reads": loaded, "spawn_calls": delegation,
                         "model_complete": any(e.get("type") == "turn.completed" for e in events)})
    parent_files = []
    for root in (Path("/"), Path("/tmp"), ROOT, *ROOT.parents):
        for name in ("AGENTS.md", "AGENTS.override.md", "CLAUDE.md", "GEMINI.md"):
            if (root / name).is_file():
                parent_files.append(str(root / name))
    summary = {"checked_at": datetime.now(timezone.utc).isoformat(), "archives": archives, "dependency_instruction_files": dependency_files,
               "parent_instruction_files": sorted(set(parent_files)), "runs": runs,
               "formal_contexts_checked": sum(r["phase"] == "vue-formal" for r in runs),
               "foreign_skill_reads_found": sum(len(r["foreign_skill_tool_reads"]) for r in runs),
               "delegation_runs": [r["id"] for r in runs if r["spawn_calls"]]}
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    assert all(r["catalog_ok"] for r in runs), "Unexpected skill catalog"
    print(f"Instruction audit: {summary['formal_contexts_checked']} formal contexts, {len(dependency_files)} packaged instruction files, {len(summary['delegation_runs'])} runs with actual child creation")


if __name__ == "__main__":
    main()
