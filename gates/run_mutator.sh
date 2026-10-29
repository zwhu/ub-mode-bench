#!/usr/bin/env bash
set -euo pipefail
work="${1:?workdir}"
image="${2:?task gates image}"
test_command="${3:?test command}"
args=(docker run --rm --pull=never --network=none --user "$(id -u):$(id -g)" -v "$work:$work:rw" -w "$work" "$image" timeout 1200 mutator --changed --test-command "$test_command" --use-existing-coverage)
printf -v command '%q ' "${args[@]}"
exec sg docker -c "$command"
