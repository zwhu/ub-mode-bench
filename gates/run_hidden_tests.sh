#!/usr/bin/env bash
set -euo pipefail
work="${1:?workdir}"
task="${2:?task id}"
image="${3:?task gates image}"
gold="${BENCH_GOLD_DIR:-$(pwd)/gold}/$task/hidden_tests"
test -d "$gold" || exit 127
args=(docker run --rm --pull=never --network=none --user "$(id -u):$(id -g)" -v "$work:/work:rw" -v "$gold:/hidden:ro" -w /work "$image" bash -c 'cp -r /hidden/. ./ && node_modules/.bin/vitest run')
printf -v command '%q ' "${args[@]}"
exec sg docker -c "$command"
