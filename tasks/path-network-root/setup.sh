#!/usr/bin/env bash
set -euo pipefail
target="${1:?workspace}"
task_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
mkdir -p "$target"
tar -xzf "$task_dir/base.tar.gz" -C "$target"
