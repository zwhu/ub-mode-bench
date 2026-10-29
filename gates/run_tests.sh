#!/usr/bin/env bash
set -euo pipefail
work="${1:?workdir}"
image="${2:?task gates image}"
test_command="${3:-node_modules/.bin/vitest run}"
args=(docker run --rm --pull=never --network=none --user "$(id -u):$(id -g)" -v "$work:/work:rw" -w /work "$image" bash -c "$test_command")
printf -v command '%q ' "${args[@]}"
exec sg docker -c "$command"
