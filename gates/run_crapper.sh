#!/usr/bin/env bash
set -euo pipefail
work="${1:?workdir}"
image="${2:?task gates image}"
args=(docker run --rm --pull=never --network=none --user "$(id -u):$(id -g)" -v "$work:$work:rw" -w "$work" "$image" crapper --changed --threshold 10 --use-existing-coverage)
printf -v command '%q ' "${args[@]}"
exec sg docker -c "$command"
